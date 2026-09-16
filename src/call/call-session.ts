import type { CallRpcChannel } from './call-rpc.js'
import type { CallOfferMessage, CallAnswerMessage, CallEndMessage, CallControlMessage, MediaFrameMessage } from './call-encoding.js'

// ---------------------------------------------------------------------------
// Call state machine
//
// Each CallSession represents one live or recently-ended call between this
// device and a single remote peer. The lifecycle is:
//
//   IDLE → CALLING (we dialled) or RINGING (they dialled)
//        → CONNECTED (media streaming)
//        → ENDED
//
// Media capture/playback is NOT handled here — that lives in media-pipeline.ts
// in the renderer, because getUserMedia and MediaSource are DOM APIs. This
// class manages only the signaling state and the Protomux channels that carry
// it, deliberately staying platform-agnostic.
// ---------------------------------------------------------------------------

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended'
export type CallEndReason = 'hangup' | 'rejected' | 'timeout' | 'error' | 'busy'

export interface CallMediaOptions {
  audio: boolean
  video: boolean
}

/** What the peer has switched off on their side, as both shells display it. */
export interface RemoteControlState {
  remoteMuted: boolean
  remoteCameraOff: boolean
}

/**
 * Applies a `call_control` action to a view of the call.
 *
 * The same four-way switch was written three times — here, in the desktop overlay's
 * `handleCallRemoteControl`, and in mobile's `useSession` reducer — because each shell keeps its
 * own copy of the call info and has to update it when the control event arrives. Returning a new
 * object rather than mutating is what lets a React state setter and this class share one function.
 * An unknown action leaves the state alone: a newer peer's vocabulary is not a reason to guess.
 */
export function applyRemoteControl<T extends RemoteControlState>(state: T, action: string): T {
  switch (action) {
    case 'mute': return { ...state, remoteMuted: true }
    case 'unmute': return { ...state, remoteMuted: false }
    case 'camera-off': return { ...state, remoteCameraOff: true }
    case 'camera-on': return { ...state, remoteCameraOff: false }
    default: return state
  }
}

export interface CallInfo {
  callId: string
  peerId: string
  roomId: string
  state: CallState
  direction: 'outgoing' | 'incoming'
  media: CallMediaOptions
  remoteMuted: boolean
  remoteCameraOff: boolean
  startedAt: number | null
  endedAt: number | null
  endReason: CallEndReason | null
}

export interface CallSessionEvents {
  onStateChange?(info: CallInfo): void
  onRemoteControl?(callId: string, action: string): void
  onMediaFrame?(frame: MediaFrameMessage): void
}

/** How long we wait for the remote peer to answer before giving up. */
const RING_TIMEOUT_MS = 30_000

export class CallSession {
  readonly callId: string
  readonly peerId: string
  readonly roomId: string
  readonly direction: 'outgoing' | 'incoming'
  readonly media: CallMediaOptions

  private _state: CallState = 'idle'
  private _remote: RemoteControlState = { remoteMuted: false, remoteCameraOff: false }
  private _startedAt: number | null = null
  private _endedAt: number | null = null
  private _endReason: CallEndReason | null = null
  private ringTimer: ReturnType<typeof setTimeout> | null = null
  private readonly events: CallSessionEvents
  private callRpc: CallRpcChannel | null = null
  private readonly localId: string  // our own identity id

  constructor(
    callId: string,
    peerId: string,
    roomId: string,
    localId: string,
    direction: 'outgoing' | 'incoming',
    media: CallMediaOptions,
    events: CallSessionEvents = {}
  ) {
    this.callId = callId
    this.peerId = peerId
    this.roomId = roomId
    this.localId = localId
    this.direction = direction
    this.media = media
    this.events = events
  }

  get state(): CallState { return this._state }

  get info(): CallInfo {
    return {
      callId: this.callId,
      peerId: this.peerId,
      roomId: this.roomId,
      state: this._state,
      direction: this.direction,
      media: this.media,
      remoteMuted: this._remote.remoteMuted,
      remoteCameraOff: this._remote.remoteCameraOff,
      startedAt: this._startedAt,
      endedAt: this._endedAt,
      endReason: this._endReason
    }
  }

  /** Binds this call to a Protomux call channel on the peer's connection. */
  attachChannel(channel: CallRpcChannel): void {
    this.callRpc = channel
  }

  // ── Outgoing call lifecycle ─────────────────────────────────────────────

  /** Initiates the call: sends an offer and starts the ring timeout. */
  dial(): void {
    if (this._state !== 'idle') return
    if (!this.callRpc) throw new Error('No call channel attached')
    this._state = 'calling'
    this.callRpc.sendCallOffer({
      callId: this.callId,
      fromId: this.localId,
      roomId: this.roomId,
      audio: this.media.audio,
      video: this.media.video
    })
    this.startRingTimeout()
    this.emitStateChange()
  }

  // ── Incoming call lifecycle ─────────────────────────────────────────────

  /** Marks the call as ringing (called by the `CallDesk` when an offer arrives). */
  ring(): void {
    if (this._state !== 'idle') return
    this._state = 'ringing'
    this.startRingTimeout()
    this.emitStateChange()
  }

  /** Accepts the incoming call. */
  accept(): void {
    if (this._state !== 'ringing') return
    if (!this.callRpc) throw new Error('No call channel attached')
    this.clearRingTimeout()
    this._state = 'connected'
    this._startedAt = Date.now()
    this.callRpc.sendCallAnswer({
      callId: this.callId,
      fromId: this.localId,
      accepted: true
    })
    this.emitStateChange()
  }

  /** Rejects the incoming call. */
  reject(): void {
    if (this._state !== 'ringing') return
    if (!this.callRpc) return
    this.clearRingTimeout()
    this.callRpc.sendCallAnswer({
      callId: this.callId,
      fromId: this.localId,
      accepted: false
    })
    this.end('rejected')
  }

  // ── Shared lifecycle ────────────────────────────────────────────────────

  /** Ends the call from our side. */
  hangup(): void {
    if (this._state === 'ended' || this._state === 'idle') return
    this.callRpc?.sendCallEnd({
      callId: this.callId,
      fromId: this.localId,
      reason: 'hangup'
    })
    this.end('hangup')
  }

  /** Sends a control action (mute/unmute/camera-on/camera-off) to the remote peer. */
  sendControl(action: string): void {
    if (this._state !== 'connected') return
    this.callRpc?.sendCallControl({
      callId: this.callId,
      fromId: this.localId,
      action
    })
  }

  /** Sends a media frame to the remote peer. */
  sendFrame(frame: MediaFrameMessage): void {
    if (this._state !== 'connected') return
    this.callRpc?.sendMediaFrame(frame)
  }

  // ── Incoming message handlers (routed here by the `CallDesk`) ───────────

  handleAnswer(message: CallAnswerMessage): void {
    if (this._state !== 'calling') return
    this.clearRingTimeout()
    if (message.accepted) {
      this._state = 'connected'
      this._startedAt = Date.now()
      this.emitStateChange()
    } else {
      this.end('rejected')
    }
  }

  handleEnd(message: CallEndMessage): void {
    this.end(message.reason as CallEndReason || 'hangup')
  }

  handleControl(message: CallControlMessage): void {
    if (this._state !== 'connected') return
    this._remote = applyRemoteControl(this._remote, message.action)
    this.events.onRemoteControl?.(this.callId, message.action)
    this.emitStateChange()
  }

  handleMediaFrame(frame: MediaFrameMessage): void {
    if (this._state !== 'connected') return
    this.events.onMediaFrame?.(frame)
  }

  /** Called when the peer disconnects from the swarm entirely. */
  handlePeerDisconnected(): void {
    if (this._state === 'ended' || this._state === 'idle') return
    this.end('error')
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private end(reason: CallEndReason): void {
    if (this._state === 'ended') return
    this.clearRingTimeout()
    this._state = 'ended'
    this._endedAt = Date.now()
    this._endReason = reason
    this.emitStateChange()
  }

  private startRingTimeout(): void {
    this.ringTimer = setTimeout(() => {
      if (this._state === 'calling' || this._state === 'ringing') {
        if (this._state === 'calling') {
          this.callRpc?.sendCallEnd({
            callId: this.callId,
            fromId: this.localId,
            reason: 'timeout'
          })
        }
        this.end('timeout')
      }
    }, RING_TIMEOUT_MS)
    this.ringTimer.unref?.()
  }

  private clearRingTimeout(): void {
    if (this.ringTimer) {
      clearTimeout(this.ringTimer)
      this.ringTimer = null
    }
  }

  private emitStateChange(): void {
    this.events.onStateChange?.(this.info)
  }
}
