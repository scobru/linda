import { useState, useRef, useCallback, useEffect } from 'react'
import { Platform, PermissionsAndroid } from 'react-native'
import { mediaDevices } from 'react-native-webrtc'
import { PeerCall } from '@core/calls/call'
import type { CallSignalMessage } from '@core/network/encoding'
import type { RpcChannel } from '@core/network/rpc'
import { sendCallSignal, onCallSignal, listConnectedPeerIds } from '../bare/call-proxy'
import type { RoomProxy } from '../bare/room-proxy'

/** PeerCall only ever calls `.sendCallSignal` on this — the other RpcChannel methods are unreachable dead weight here, so a full mock isn't worth typing out. */
function rpcAdapter(peerId: string): RpcChannel {
  return { sendCallSignal: (message: CallSignalMessage) => void sendCallSignal(peerId, message) } as unknown as RpcChannel
}

async function requestMediaPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
  ])
  return granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
    granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED
}

export interface UseCallResult {
  callActive: boolean
  remoteStreams: Map<string, MediaStream>
  startCall: () => Promise<void>
  endCall: () => void
}

export function useCall(room: RoomProxy | null | undefined, localUserId: string): UseCallResult {
  const [callActive, setCallActive] = useState(false)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const callsRef = useRef<Map<string, PeerCall>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)

  const endPeerCall = useCallback((peerId: string) => {
    callsRef.current.get(peerId)?.hangup()
    callsRef.current.delete(peerId)
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

  const ensureLocalStream = useCallback(async (): Promise<MediaStream> => {
    if (localStreamRef.current) return localStreamRef.current
    if (!(await requestMediaPermissions())) throw new Error('Camera/microphone permission denied')
    const stream = await mediaDevices.getUserMedia({ audio: true, video: true }) as unknown as MediaStream
    localStreamRef.current = stream
    setCallActive(true)
    return stream
  }, [])

  const startCall = useCallback(async () => {
    if (!room) return
    const { members } = await room.listMembers()
    const connected = new Set(await listConnectedPeerIds())
    const targets = members.map((m) => m.identityId).filter((id) => id !== localUserId && connected.has(id))
    if (targets.length === 0) throw new Error('No connected room member to call')

    const stream = await ensureLocalStream()
    for (const peerId of targets) {
      const call = new PeerCall(rpcAdapter(peerId), room.id, localUserId, peerId, stream, {
        onRemoteStream: (remote) => setRemoteStreams((prev) => new Map(prev).set(peerId, remote)),
        onClose: () => endPeerCall(peerId)
      })
      callsRef.current.set(peerId, call)
      void call.call()
    }
  }, [room, localUserId, ensureLocalStream, endPeerCall])

  useEffect(() => {
    if (!room) return
    const roomId = room.id
    return onCallSignal((message: CallSignalMessage) => {
      if (message.roomId !== roomId) return
      void (async () => {
        let call = callsRef.current.get(message.fromUserId)
        if (!call && message.kind === 'offer') {
          let stream: MediaStream
          try {
            stream = await ensureLocalStream()
          } catch {
            // Permission denied, camera busy, etc. — without this, the offer is silently dropped
            // (an unhandled rejection) and the caller's side just keeps ringing forever with
            // nothing ever telling them why. 'hangup' doubles as "can't take this call".
            void sendCallSignal(message.fromUserId, { roomId: message.roomId, fromUserId: localUserId, kind: 'hangup', payload: '' })
            return
          }
          call = new PeerCall(rpcAdapter(message.fromUserId), message.roomId, localUserId, message.fromUserId, stream, {
            onRemoteStream: (remote) => setRemoteStreams((prev) => new Map(prev).set(message.fromUserId, remote)),
            onClose: () => endPeerCall(message.fromUserId)
          })
          callsRef.current.set(message.fromUserId, call)
        }
        await call?.handleSignal(message)
      })()
    })
  }, [room, localUserId, ensureLocalStream, endPeerCall])

  // Hang up when leaving the room's chat screen.
  useEffect(() => () => endCall(), [room?.id, endCall])

  return { callActive, remoteStreams, startCall, endCall }
}
