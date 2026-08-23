import { useState, useRef, useCallback, useEffect } from 'react'
import { Platform, PermissionsAndroid } from 'react-native'
import { mediaDevices } from 'react-native-webrtc'
import { PeerCall, shouldQueueSignal } from '@core/calls/call'
import type { CallSignalMessage } from '@core/network/encoding'
import type { RpcChannel } from '@core/network/rpc'
import { sendCallSignal, onCallSignal, listConnectedPeerIds } from '../bare/call-proxy'
import type { RoomProxy } from '../bare/room-proxy'

/** PeerCall only ever calls `.sendCallSignal` on this — the other RpcChannel methods are unreachable dead weight here, so a full mock isn't worth typing out. */
function rpcAdapter(peerId: string): RpcChannel {
  return { sendCallSignal: (message: CallSignalMessage) => void sendCallSignal(peerId, message) } as unknown as RpcChannel
}

async function requestMediaPermissions(withVideo: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const permissions = withVideo
    ? [PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
    : [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]
  const granted = await PermissionsAndroid.requestMultiple(permissions)
  return permissions.every((p) => granted[p] === PermissionsAndroid.RESULTS.GRANTED)
}

export interface UseCallResult {
  callActive: boolean
  remoteStreams: Map<string, MediaStream>
  startCall: (withVideo: boolean) => Promise<void>
  endCall: () => void
  /** ICE progress lines for the current call — shown in the call UI so a failure is
   * diagnosable on the device itself (release builds strip console.*, so logcat shows
   * nothing). Cleared when a new call starts. */
  diagnostics: string[]
}

export function useCall(room: RoomProxy | null | undefined, localUserId: string): UseCallResult {
  const [callActive, setCallActive] = useState(false)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [diagnostics, setDiagnostics] = useState<string[]>([])
  const addDiagnostic = useCallback((peerId: string, line: string) => {
    setDiagnostics((prev) => [...prev, `${peerId.slice(0, 6)} ${line}`])
  }, [])
  const callsRef = useRef<Map<string, PeerCall>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  /** Signals for a peer whose PeerCall doesn't exist yet — see the onCallSignal handler. */
  const pendingSignalsRef = useRef<Map<string, CallSignalMessage[]>>(new Map())

  const endPeerCall = useCallback((peerId: string) => {
    callsRef.current.get(peerId)?.hangup()
    callsRef.current.delete(peerId)
    pendingSignalsRef.current.delete(peerId)
    setRemoteStreams((prev) => {
      if (!prev.has(peerId)) return prev
      const next = new Map(prev)
      next.delete(peerId)
      return next
    })
    if (callsRef.current.size === 0) {
      for (const track of localStreamRef.current?.getTracks() ?? []) track.stop()
      localStreamRef.current = null
      setCallActive(false)
    }
  }, [])

  const endCall = useCallback(() => {
    for (const peerId of [...callsRef.current.keys()]) endPeerCall(peerId)
  }, [endPeerCall])

  const ensureLocalStream = useCallback(async (withVideo: boolean): Promise<MediaStream> => {
    if (localStreamRef.current) return localStreamRef.current
    if (!(await requestMediaPermissions(withVideo))) throw new Error(withVideo ? 'Camera/microphone permission denied' : 'Microphone permission denied')
    const stream = await mediaDevices.getUserMedia({ audio: true, video: withVideo }) as unknown as MediaStream
    localStreamRef.current = stream
    setCallActive(true)
    return stream
  }, [])

  const startCall = useCallback(async (withVideo: boolean) => {
    if (!room) return
    const { members } = await room.listMembers()
    const connected = new Set(await listConnectedPeerIds())
    const targets = members.map((m) => m.identityId).filter((id) => id !== localUserId && connected.has(id))
    if (targets.length === 0) throw new Error('No connected room member to call')

    const stream = await ensureLocalStream(withVideo)
    for (const peerId of targets) {
      const call = new PeerCall(rpcAdapter(peerId), room.id, localUserId, peerId, stream, {
        onRemoteStream: (remote) => setRemoteStreams((prev) => new Map(prev).set(peerId, remote)),
        onDiagnostic: (line) => addDiagnostic(peerId, line),
        onClose: () => endPeerCall(peerId)
      })
      callsRef.current.set(peerId, call)
      void call.call()
    }
  }, [room, localUserId, ensureLocalStream, endPeerCall, addDiagnostic])

  useEffect(() => {
    if (!room) return
    const roomId = room.id
    return onCallSignal((message: CallSignalMessage) => {
      if (message.roomId !== roomId) return
      void (async () => {
        let call = callsRef.current.get(message.fromUserId)
        if (!call) {
          // Held for replay once the 'offer' below has built the PeerCall — see shouldQueueSignal
          // for which signals qualify and, more importantly, why the rest must be dropped.
          if (message.kind !== 'offer') {
            if (shouldQueueSignal(message.kind)) {
              const queued = pendingSignalsRef.current.get(message.fromUserId) ?? []
              queued.push(message)
              pendingSignalsRef.current.set(message.fromUserId, queued)
            }
            return
          }
          // Mirror the caller's own choice of audio-only vs video — the offer's SDP already says
          // which one it was (no separate signaling field needed), so read it from there instead
          // of always grabbing the camera regardless of what kind of call this is.
          const offerHasVideo = (JSON.parse(message.payload) as { sdp?: string }).sdp?.includes('m=video') ?? true
          let stream: MediaStream
          try {
            stream = await ensureLocalStream(offerHasVideo)
          } catch (err) {
            // Permission denied, camera busy, etc. — without this, the offer is silently dropped
            // (an unhandled rejection) and the caller's side just keeps ringing forever with
            // nothing ever telling them why. 'hangup' doubles as "can't take this call", and
            // carries the reason so the caller sees "their camera was busy" rather than a bare
            // dropped call indistinguishable from a network failure.
            const reason = `${(err as Error).name || 'error'} opening ${offerHasVideo ? 'camera/mic' : 'mic'}`
            addDiagnostic(message.fromUserId, `could not answer: ${reason}`)
            pendingSignalsRef.current.delete(message.fromUserId)
            void sendCallSignal(message.fromUserId, { roomId: message.roomId, fromUserId: localUserId, kind: 'hangup', payload: reason })
            return
          }
          call = new PeerCall(rpcAdapter(message.fromUserId), message.roomId, localUserId, message.fromUserId, stream, {
            onRemoteStream: (remote) => setRemoteStreams((prev) => new Map(prev).set(message.fromUserId, remote)),
            onDiagnostic: (line) => addDiagnostic(message.fromUserId, line),
            onClose: () => endPeerCall(message.fromUserId)
          })
          callsRef.current.set(message.fromUserId, call)
        }
        await call.handleSignal(message)
        const queued = pendingSignalsRef.current.get(message.fromUserId)
        if (queued) {
          pendingSignalsRef.current.delete(message.fromUserId)
          // Guarded per signal: a candidate left over from a previous call belongs to a dead ICE
          // session and throws on apply. That must not abort the replay of the valid ones behind
          // it, nor surface as an unhandled rejection.
          for (const signal of queued) {
            try { await call.handleSignal(signal) } catch { /* stale candidate */ }
          }
        }
      })()
    })
  }, [room, localUserId, ensureLocalStream, endPeerCall, addDiagnostic])

  // Hang up when leaving the room's chat screen.
  useEffect(() => () => endCall(), [room?.id, endCall])

  return { callActive, remoteStreams, startCall, endCall, diagnostics }
}
