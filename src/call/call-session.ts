import type { CallRpcChannel } from './call-rpc.js'
import type { CallOfferMessage, CallAnswerMessage, CallEndMessage, CallControlMessage, MediaFrameMessage } from './call-encoding.js'
import { DEFAULT_AUDIO_CODEC, encodeAudioCodecList, readNegotiatedCodec } from './audio-codec.js'

// ---------------------------------------------------------------------------
// Call state machine
//
// Each CallSession represents one live or recently-ended call between this
// device and a single remote peer. The lifecycle is:
//
//   IDLE → CALLING (we dialled) or RINGING (they dialled)
//        → CONNECTED (media streaming — held open across a dropped connection, see
//                     `handlePeerDisconnected`)
//        → ENDED
//
// Media capture/playback is NOT handled here — that lives in media-pipeline.ts
// in the renderer, because getUserMedia and MediaSource are DOM APIs. This
// class manages only the signaling state and the Protomux channels that carry
// it, deliberately staying platform-agnostic.
// ---------------------------------------------------------------------------

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended'
export type CallEndReason = 'hangup' | 'rejected' | 'timeout' | 'error' | 'busy'

/**
 * Where the end came from, as opposed to what it was called.
 *
 * The reason travels on the wire, so both ends of a call report the same one — which is what made
 * "Connection lost" so hard to place. A call ending as `error` on this phone can mean this side
 * lost the peer, or that the *other* side lost it and said so, and those are different faults in
 * different machines. This is decided locally and never sent, so it always names the side reading
 * it.
 */
export type CallEndOrigin =
  /** We hung up or rejected. */
  | 'local'
  /** Nobody answered within the ring timeout. */
  | 'local-timeout'
  /** The peer sent an end message — the reason beside this one is theirs, not ours. */
  | 'remote'
  /** Our connection to the peer went away underneath the call. */
  | 'peer-disconnected'

export interface CallMediaOptions {
  audio: boolean
  video: boolean
  /** Audio codecs this device can actually speak, best first — see `audio-codec.ts`. Offered on an
   *  outgoing call; absent means the floor, which is what every build understands. */
  audioCodecs?: readonly string[]
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
  /** The one audio codec this call settled on. Both ends hold the same value once connected. */
  audioCodec: string
  remoteMuted: boolean
  remoteCameraOff: boolean
  startedAt: number | null
  endedAt: number | null
  endReason: CallEndReason | null
  /** Which side's fault the ending was. Local only — see `CallEndOrigin`. */
  endOrigin: CallEndOrigin | null
  /**
   * What the layer below said, when it said anything — the transport's own error message for a
   * connection that went away, for instance. Free text, local only, and null far more often than
   * not: it exists because "the peer disconnected" names *who*, never *why*, and the why was being
   * discarded at the socket.
   */
  endDetail: string | null
  /**
   * True while a connected call has lost its connection and has not yet heard from the peer over a
   * new one — see `CallSession.handlePeerDisconnected`.
   *
   * Not a state of its own on purpose: the call *is* still connected as far as both people are
   * concerned — the media pipeline keeps running, the clock keeps counting — and every shell treats
   * anything but `connected` as "tear the media down". Local only, never sent.
   */
  reconnecting: boolean
}

export interface CallSessionEvents {
  onStateChange?(info: CallInfo): void
  onRemoteControl?(callId: string, action: string): void
  onMediaFrame?(frame: MediaFrameMessage): void
  /**
   * The call ended while its connection was down, so the peer was never told.
   *
   * The message is the one that would have gone out. Whoever holds the peer's next connection owes
   * it to them — see `CallDesk.peerBack` — or the peer, still waiting out its own grace, reattaches
   * to a call that no longer exists here and sits in it with nothing on the line.
   */
  onEndUnsent?(message: CallEndMessage): void
}

/** How long we wait for the remote peer to answer before giving up. */
const RING_TIMEOUT_MS = 30_000

/**
 * How long a connected call survives the loss of its connection.
 *
 * A call rides one Hyperswarm socket, and on a phone that socket is not forever: a wifi/cellular
 * handoff, a NAT rebinding its port, the app's own network resync all close it — and Hyperswarm
 * opens a fresh one to the same peer a few seconds later. Ending the call the instant the first
 * one closed is what made every one of those blips a dropped call. Long enough to outlast a
 * handoff plus a re-punch on a cellular NAT, short enough that a peer who really left is given up
 * on while the person is still looking at the screen.
 */
export const RECONNECT_GRACE_MS = 30_000

/**
 * Which control actions cancel each other out, so that a reconnect replays the latest of each.
 * An action outside these pairs stands for itself.
 */
const CONTROL_GROUP: Readonly<Record<string, string>> = {
  mute: 'audio',
  unmute: 'audio',
  'camera-off': 'video',
  'camera-on': 'video'
}

/** Where every call starts: nothing switched off. What a reconnect says when nothing was toggled. */
const INITIAL_CONTROLS: ReadonlyArray<readonly [string, string]> = [['audio', 'unmute'], ['video', 'camera-on']]

export class CallSession {
  readonly callId: string
  readonly peerId: string
  readonly roomId: string
  readonly direction: 'outgoing' | 'incoming'
  readonly media: CallMediaOptions

  private _state: CallState = 'idle'
  /** Until an offer is answered or an answer is sent, the floor is the only safe assumption. */
  private _audioCodec: string = DEFAULT_AUDIO_CODEC
  private _remote: RemoteControlState = { remoteMuted: false, remoteCameraOff: false }
  private _startedAt: number | null = null
  private _endedAt: number | null = null
  private _endReason: CallEndReason | null = null
  private _endOrigin: CallEndOrigin | null = null
  private _endDetail: string | null = null
  private ringTimer: ReturnType<typeof setTimeout> | null = null
  /** Runs from a lost connection until the peer is heard from again — see `handlePeerDisconnected`. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /** What the transport said when the connection went, kept for the ending if it never comes back. */
  private lostDetail: string | null = null
  /** The latest control action of each kind we sent, so a fresh connection can be told where we are. */
  private readonly sentControls = new Map<string, string>()
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
      audioCodec: this._audioCodec,
      remoteMuted: this._remote.remoteMuted,
      remoteCameraOff: this._remote.remoteCameraOff,
      startedAt: this._startedAt,
      endedAt: this._endedAt,
      endReason: this._endReason,
      endOrigin: this._endOrigin,
      endDetail: this._endDetail,
      reconnecting: this.reconnectTimer !== null
    }
  }

  /** True from a lost connection until the peer is heard from again. */
  get reconnecting(): boolean {
    return this.reconnectTimer !== null
  }

  /**
   * Records the codec chosen for an incoming call.
   *
   * Only the answering side has both lists, so only it can decide — `CallDesk` does the deciding
   * and hands the result here, where `accept()` will put it in the answer. A call that is never
   * accepted keeps the floor, which is what it was going to send nothing in anyway.
   */
  agreeAudioCodec(name: string): void {
    if (this._state !== 'idle' && this._state !== 'ringing') return
    this._audioCodec = name
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
      video: this.media.video,
      audioCodecs: encodeAudioCodecList(this.media.audioCodecs ?? [DEFAULT_AUDIO_CODEC])
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
      accepted: true,
      audioCodec: this._audioCodec
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
    this.end('rejected', 'local')
  }

  // ── Shared lifecycle ────────────────────────────────────────────────────

  /** Ends the call from our side. */
  hangup(): void {
    if (this._state === 'ended' || this._state === 'idle') return
    this.tellEnded('hangup')
    this.end('hangup', 'local')
  }

  /**
   * Sends a control action (mute/unmute/camera-on/camera-off) to the remote peer.
   *
   * Remembered as well as sent: one made while the connection is down has nowhere to go, and one
   * made just before it went may never have arrived. `reattachChannel` replays the latest of each.
   */
  sendControl(action: string): void {
    if (this._state !== 'connected') return
    this.sentControls.set(CONTROL_GROUP[action] ?? action, action)
    this.callRpc?.sendCallControl({
      callId: this.callId,
      fromId: this.localId,
      action
    })
  }

  /**
   * Sends a media frame to the remote peer, answering whether the wire wants more.
   *
   * `false` means the send buffer is over its watermark — see `media-backpressure.ts` for what the
   * producing end does with that. A frame sent while the call is not connected, or with no channel
   * attached, answers `false` too: in both cases the frame went nowhere, and "went nowhere" is not
   * a reason to produce the next one faster.
   */
  sendFrame(frame: MediaFrameMessage): boolean {
    if (this._state !== 'connected') return false
    return this.callRpc?.sendMediaFrame(frame) ?? false
  }

  // ── Incoming message handlers (routed here by the `CallDesk`) ───────────

  handleAnswer(message: CallAnswerMessage): void {
    if (this._state !== 'calling') return
    this.clearRingTimeout()
    if (message.accepted) {
      // Set before the state change, because `onStateChange` is what starts the media pipeline and
      // it reads the codec off the very `CallInfo` this emits.
      this._audioCodec = readNegotiatedCodec(message.audioCodec)
      this._state = 'connected'
      this._startedAt = Date.now()
      this.emitStateChange()
    } else {
      this.end('rejected', 'remote')
    }
  }

  handleEnd(message: CallEndMessage): void {
    this.end(message.reason as CallEndReason || 'hangup', 'remote')
  }

  handleControl(message: CallControlMessage): void {
    if (this._state !== 'connected') return
    this.heardFromPeer()
    this._remote = applyRemoteControl(this._remote, message.action)
    this.events.onRemoteControl?.(this.callId, message.action)
    this.emitStateChange()
  }

  handleMediaFrame(frame: MediaFrameMessage): void {
    if (this._state !== 'connected') return
    if (this.heardFromPeer()) this.emitStateChange()
    this.events.onMediaFrame?.(frame)
  }

  /**
   * Called when the connection this call rides on closes.
   *
   * A connected call is held rather than ended: the channel is dropped, `reconnecting` goes up, and
   * the call gives the peer `RECONNECT_GRACE_MS` to come back on a fresh connection — see
   * `reattachChannel` — *and to be heard from on it*. A peer that reconnects is not yet a peer that
   * still has this call: one that restarted, or runs a build that ended its side the moment its own
   * socket closed, comes back with nothing, and a call reattached to it would sit connected to
   * nobody. So the clock stops at the first control or frame from the peer, not at the reconnect.
   * If that never comes, the call ends as the error it would have been, and the peer is told.
   *
   * One clock for the whole gap, not one per connection: a link that keeps coming back and dying
   * before the peer is heard from does not keep a call alive forever.
   *
   * A call still ringing ends at once, as before. Nothing has been said yet that a new connection
   * would carry on, the ring timeout is already counting, and dialling again costs one tap.
   *
   * `detail` is whatever closed the connection said for itself — the transport's error message,
   * when there was one. It is the difference between "the connection went away" and knowing that
   * it went away because, say, the stream was destroyed by a protocol error.
   */
  handlePeerDisconnected(detail?: string): void {
    if (this._state === 'ended' || this._state === 'idle') return
    if (this._state !== 'connected') {
      this.end('error', 'peer-disconnected', detail)
      return
    }
    this.callRpc = null
    // The latest word wins: a connection that came back and went again is described by how it
    // went the second time.
    this.lostDetail = detail ?? null
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      // Linked again but never heard from: the peer came back without this call.
      const why = this.callRpc ? 'reconnected, but the peer no longer had this call' : this.lostDetail
      this.tellEnded('error')
      this.end('error', 'peer-disconnected', why ?? undefined)
    }, RECONNECT_GRACE_MS)
    this.reconnectTimer.unref?.()
    this.emitStateChange()
  }

  /**
   * The peer is back on a fresh connection: carry the held call over to it.
   *
   * Says where we are — the latest control action of each kind, and the starting ones for any kind
   * never touched — because the peer's picture of us is whatever last reached it: a mute made
   * during the gap, or sent into a socket that was already dying, never did. That it is never
   * empty matters as much: it is what the peer hears from us, and hearing from us is what ends
   * *its* wait (see `handlePeerDisconnected`). A call with a live channel ignores this.
   */
  reattachChannel(channel: CallRpcChannel): void {
    if (this._state !== 'connected' || this.callRpc) return
    this.callRpc = channel
    const current = new Map(INITIAL_CONTROLS)
    for (const [group, action] of this.sentControls) current.set(group, action)
    for (const action of current.values()) {
      channel.sendCallControl({ callId: this.callId, fromId: this.localId, action })
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  /**
   * Whether this message is the peer being heard from again after a lost connection, closing the
   * gap if so. Only over a new connection: while there is none, nothing can arrive to count.
   */
  private heardFromPeer(): boolean {
    if (!this.reconnectTimer || !this.callRpc) return false
    this.clearReconnectTimer()
    this.lostDetail = null
    return true
  }

  /** Tells the peer the call is over — now if the connection is up, on its next one if not. */
  private tellEnded(reason: CallEndReason): void {
    const message: CallEndMessage = { callId: this.callId, fromId: this.localId, reason }
    if (this.callRpc) this.callRpc.sendCallEnd(message)
    else this.events.onEndUnsent?.(message)
  }

  private end(reason: CallEndReason, origin: CallEndOrigin, detail?: string): void {
    if (this._state === 'ended') return
    this.clearRingTimeout()
    this.clearReconnectTimer()
    this._state = 'ended'
    this._endedAt = Date.now()
    this._endReason = reason
    this._endOrigin = origin
    this._endDetail = detail ?? null
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
        this.end('timeout', 'local-timeout')
      }
    }, RING_TIMEOUT_MS)
    this.ringTimer.unref?.()
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
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
