import type { RpcChannel } from '../network/rpc.js'
import type { CallSignalMessage } from '../network/encoding.js'

export interface CallHandlers {
  onRemoteStream?(stream: MediaStream): void
  onRemoteScreenShare?(stream: MediaStream): void
  onClose?(): void
}

/**
 * No STUN/TURN: the Hyperswarm socket already did NAT traversal, so ICE
 * candidates only need to be exchanged (not gathered from external servers).
 */
const ICE_SERVERS: RTCIceServer[] = []

export class PeerCall {
  private readonly pc: RTCPeerConnection
  private readonly screenSenders: RTCRtpSender[] = []
  /** First remote stream seen is the camera/mic stream; a later, distinct stream id is the screen share (calls always start with camera, screen share is added afterward). */
  private remoteStreamId: string | null = null
  /** "Perfect negotiation" (W3C-recommended pattern): both sides can call `.call()` around the same
   * time and race to send offers. The lexicographically-smaller user id is "polite" and yields —
   * rolling back its own in-flight offer to accept the peer's — instead of both sides colliding
   * and one throwing `InvalidStateError` on setRemoteDescription. */
  private readonly polite: boolean
  private makingOffer = false
  private ignoreOffer = false
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly rpc: RpcChannel,
    private readonly roomId: string,
    private readonly localUserId: string,
    remoteUserId: string,
    localStream: MediaStream,
    private readonly handlers: CallHandlers = {}
  ) {
    this.polite = localUserId < remoteUserId
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    for (const track of localStream.getTracks()) this.pc.addTrack(track, localStream)

    this.pc.onicecandidate = (event) => {
      if (!event.candidate) return
      this.signal('candidate', JSON.stringify(event.candidate))
    }

    this.pc.ontrack = (event) => {
      const [stream] = event.streams
      if (!stream) return
      if (this.remoteStreamId === null) {
        this.remoteStreamId = stream.id
        handlers.onRemoteStream?.(stream)
      } else if (stream.id !== this.remoteStreamId) {
        handlers.onRemoteScreenShare?.(stream)
      }
    }

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState
      if (state === 'connected' && this.disconnectTimer) {
        clearTimeout(this.disconnectTimer)
        this.disconnectTimer = null
        return
      }
      if (state === 'closed' || state === 'failed') {
        if (this.disconnectTimer) { clearTimeout(this.disconnectTimer); this.disconnectTimer = null }
        handlers.onClose?.()
        return
      }
      // 'disconnected' fires on any transient packet-loss blip (the exact kind of thing a wifi <->
      // cellular switch causes) and very often self-recovers back to 'connected' within a few
      // seconds without any renegotiation — tearing the call down immediately on it was dropping
      // calls that would have kept working on their own.
      if (state === 'disconnected' && !this.disconnectTimer) {
        this.disconnectTimer = setTimeout(() => {
          this.disconnectTimer = null
          if (this.pc.connectionState === 'disconnected') handlers.onClose?.()
        }, 8000)
      }
    }
  }

  async call(): Promise<void> {
    await this.renegotiate()
  }

  /** Adds the screen-capture stream's tracks to the existing connection and renegotiates. `hangup`'s `handleSignal('offer', ...)` path already handles re-offers generically, so the remote side needs no separate wiring beyond `onRemoteScreenShare`. */
  async addScreenShare(stream: MediaStream): Promise<void> {
    for (const track of stream.getTracks()) this.screenSenders.push(this.pc.addTrack(track, stream))
    await this.renegotiate()
  }

  async removeScreenShare(): Promise<void> {
    for (const sender of this.screenSenders) this.pc.removeTrack(sender)
    this.screenSenders.length = 0
    await this.renegotiate()
  }

  private async renegotiate(): Promise<void> {
    try {
      this.makingOffer = true
      const offer = await this.pc.createOffer()
      await this.pc.setLocalDescription(offer)
      this.signal('offer', JSON.stringify(offer))
    } finally {
      this.makingOffer = false
    }
  }

  async handleSignal(message: CallSignalMessage): Promise<void> {
    if (message.roomId !== this.roomId) return

    switch (message.kind) {
      case 'offer': {
        const collision = this.makingOffer || this.pc.signalingState !== 'stable'
        this.ignoreOffer = !this.polite && collision
        if (this.ignoreOffer) return

        if (collision) {
          // Impolite branch already returned above; only the polite side rolls back here.
          await this.pc.setLocalDescription({ type: 'rollback' })
        }
        await this.pc.setRemoteDescription(JSON.parse(message.payload))
        const answer = await this.pc.createAnswer()
        await this.pc.setLocalDescription(answer)
        this.signal('answer', JSON.stringify(answer))
        break
      }
      case 'answer':
        await this.pc.setRemoteDescription(JSON.parse(message.payload))
        break
      case 'candidate':
        try {
          await this.pc.addIceCandidate(JSON.parse(message.payload))
        } catch (err) {
          if (!this.ignoreOffer) throw err
        }
        break
      case 'hangup':
        // pc.close() doesn't reliably fire onconnectionstatechange in every runtime — call
        // the handler directly so the remote side's call UI closes every time, not just when
        // the event happens to fire.
        if (this.disconnectTimer) { clearTimeout(this.disconnectTimer); this.disconnectTimer = null }
        this.pc.close()
        this.handlers.onClose?.()
        break
    }
  }

  hangup(): void {
    if (this.disconnectTimer) { clearTimeout(this.disconnectTimer); this.disconnectTimer = null }
    this.signal('hangup', '')
    this.pc.close()
  }

  private signal(kind: CallSignalMessage['kind'], payload: string): void {
    this.rpc.sendCallSignal({ roomId: this.roomId, fromUserId: this.localUserId, kind, payload })
  }
}
