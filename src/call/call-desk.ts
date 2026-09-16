import { CallSession, type CallInfo, type CallMediaOptions } from './call-session.js'
import type { CallRpcChannel } from './call-rpc.js'
import type {
  CallOfferMessage, CallAnswerMessage, CallEndMessage, CallControlMessage, MediaFrameMessage
} from './call-encoding.js'

// ---------------------------------------------------------------------------
// The device's one call slot.
//
// `CallSession` is one call's state machine. Everything *around* it — that this device takes one
// call at a time, that a second offer gets `busy` rather than silence, that an arriving message
// belongs to the call it names or is dropped, that the slot empties when a call ends — was spread
// across `Session` as the same two conditions written eight times:
//
//   if (this.activeCall && this.activeCall.state !== 'ended')      // twice: "am I busy?"
//   if (this.activeCall && this.activeCall.callId === message.callId)   // five times: "is it mine?"
//
// …plus the twenty-line event-wiring block copied between `startCall` and the incoming-offer
// handler, where it had already drifted: one names its parameter `callId`, the other `cId`.
//
// None of it could be tested without a live swarm and two real peers, because the only way in was
// through a connected `Session`. Here it needs a channel, which a test can hand it.
// ---------------------------------------------------------------------------

/** What the desk needs from a connected peer — the rest of `PeerConnection` is none of its business. */
export interface CallPeer {
  callRpc: CallRpcChannel
}

export interface CallDeskEvents {
  onIncomingCall?(info: CallInfo): void
  onCallStateChange?(info: CallInfo): void
  onCallEnded?(info: CallInfo): void
  onCallRemoteControl?(callId: string, action: string): void
  onCallMediaFrame?(frame: MediaFrameMessage): void
}

export class CallDesk {
  private active: CallSession | null = null

  constructor(
    private readonly localId: string,
    private readonly events: CallDeskEvents,
    /** Injected so a test can name the calls it places; `Session` passes its own id generator. */
    private readonly newCallId: () => string
  ) {}

  /** True while a call is live — dialling, ringing or connected. An ended call holds nothing. */
  get busy(): boolean {
    return this.active !== null && this.active.state !== 'ended'
  }

  get current(): CallInfo | null {
    return this.active ? this.active.info : null
  }

  /** Dials a peer. Throws rather than silently replacing a call that is already up. */
  place(peerId: string, roomId: string, media: CallMediaOptions, peer: CallPeer): CallInfo {
    if (this.busy) throw new Error('Already in an active call')
    const session = this.open(this.newCallId(), peerId, roomId, 'outgoing', media, peer)
    session.dial()
    return session.info
  }

  /**
   * Takes an incoming offer, or declines it as `busy`.
   *
   * The decline matters: without it the caller sits watching a ring that will never be answered
   * until its own 30s timeout, with no way to tell a busy peer from an absent one.
   */
  receive(offer: CallOfferMessage, peer: CallPeer): void {
    if (this.busy) {
      peer.callRpc.sendCallEnd({ callId: offer.callId, fromId: this.localId, reason: 'busy' })
      return
    }
    const session = this.open(
      offer.callId, offer.fromId, offer.roomId, 'incoming',
      { audio: offer.audio, video: offer.video }, peer
    )
    session.ring()
    this.events.onIncomingCall?.(session.info)
  }

  answer(callId: string, accept: boolean): void {
    const session = this.forCall(callId)
    if (!session) return
    if (accept) session.accept()
    else session.reject()
  }

  /** Hangs up. Without a `callId` it ends whatever is up, which is what a close or a quit wants. */
  end(callId?: string): void {
    if (!this.active) return
    if (callId && this.active.callId !== callId) return
    this.active.hangup()
    this.active = null
  }

  control(action: string): void {
    this.active?.sendControl(action)
  }

  send(frame: MediaFrameMessage): void {
    this.active?.sendFrame(frame)
  }

  // ── Messages off the wire ───────────────────────────────────────────────
  //
  // Each one is for the call it names or for nothing at all: a late `call_end` from a call that
  // already finished, or a frame from a peer whose call this device never accepted, must not reach
  // the call that happens to be up now.

  handleAnswer(message: CallAnswerMessage): void {
    this.forCall(message.callId)?.handleAnswer(message)
  }

  handleEnd(message: CallEndMessage): void {
    this.forCall(message.callId)?.handleEnd(message)
  }

  handleControl(message: CallControlMessage): void {
    this.forCall(message.callId)?.handleControl(message)
  }

  handleMediaFrame(frame: MediaFrameMessage): void {
    this.forCall(frame.callId)?.handleMediaFrame(frame)
  }

  /** The peer dropped off the swarm: a call with it cannot recover, so it ends as an error. */
  peerGone(peerId: string): void {
    if (this.active?.peerId === peerId) this.active.handlePeerDisconnected()
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private forCall(callId: string): CallSession | null {
    return this.active && this.active.callId === callId ? this.active : null
  }

  private open(
    callId: string,
    peerId: string,
    roomId: string,
    direction: 'outgoing' | 'incoming',
    media: CallMediaOptions,
    peer: CallPeer
  ): CallSession {
    const session = new CallSession(callId, peerId, roomId, this.localId, direction, media, {
      onStateChange: (info) => {
        this.events.onCallStateChange?.(info)
        if (info.state === 'ended') {
          this.events.onCallEnded?.(info)
          // Identity, not id: a call that ended after the slot was refilled must not empty it.
          if (this.active === session) this.active = null
        }
      },
      onRemoteControl: (id, action) => this.events.onCallRemoteControl?.(id, action),
      onMediaFrame: (frame) => this.events.onCallMediaFrame?.(frame)
    })
    session.attachChannel(peer.callRpc)
    this.active = session
    return session
  }
}
