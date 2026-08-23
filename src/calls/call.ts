import type { RpcChannel } from '../network/rpc.js'
import type { CallSignalMessage } from '../network/encoding.js'

export interface CallHandlers {
  onRemoteStream?(stream: MediaStream): void
  onRemoteScreenShare?(stream: MediaStream): void
  onClose?(): void
}

/**
 * Hyperswarm's hole-punch only covers its own signaling socket — WebRTC opens a
 * separate UDP flow for media, with its own local port, that needs its own NAT
 * traversal. STUN alone fixes cone-vs-cone and most cone-vs-symmetric pairings, but a
 * fully symmetric NAT on both ends (carrier-to-carrier, e.g. two phones both on 5G) is
 * only reachable through a TURN relay that actually forwards the media — no amount of
 * candidate exchange gets around that, it's a property of the NAT itself.
 *
 * ponytail: openrelay.metered.ca is a free public TURN (shared pool, ~20GB/mo) — kept
 * deliberately instead of self-hosting (no server this app owns is a well-fitted TURN
 * host — CapRover's HTTP(S) proxying doesn't suit a raw UDP relay port range). Third
 * party sees call metadata, never content (DTLS-SRTP stays end-to-end through a relay
 * same as direct). Revisit only if the shared pool's rate limit actually bites.
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
]

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
  /** Candidates that arrived before there was a remote description to attach them to.
   * `addIceCandidate` throws in that state, and a thrown-away candidate is gone for good —
   * see `flushPendingCandidates` for why that's fatal on a symmetric NAT specifically. */
  private pendingCandidates: RTCIceCandidateInit[] = []

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
        await this.flushPendingCandidates()
        const answer = await this.pc.createAnswer()
        await this.pc.setLocalDescription(answer)
        this.signal('answer', JSON.stringify(answer))
        break
      }
      case 'answer':
        await this.pc.setRemoteDescription(JSON.parse(message.payload))
        await this.flushPendingCandidates()
        break
      case 'candidate': {
        const candidate = JSON.parse(message.payload) as RTCIceCandidateInit
        // Candidates routinely arrive before the description they belong to — the peer starts
        // gathering the instant it sets its local description, while this side may still be
        // waiting on getUserMedia. Hold them instead of letting addIceCandidate throw them away.
        if (!this.pc.remoteDescription) { this.pendingCandidates.push(candidate); break }
        try {
          await this.pc.addIceCandidate(candidate)
        } catch (err) {
          if (!this.ignoreOffer) throw err
        }
        break
      }
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

  /** Losing a peer's candidates isn't fatal on a cone NAT: our own connectivity checks reach
   * them anyway, and they learn our address peer-reflexively from the incoming check. On a
   * symmetric NAT that recovery doesn't exist — the mapping differs per destination — so the
   * relay candidates each side sends are the only ones that can ever pair up, and dropping
   * them is exactly the difference between "works on wifi" and "never connects on cellular". */
  private async flushPendingCandidates(): Promise<void> {
    const pending = this.pendingCandidates
    this.pendingCandidates = []
    for (const candidate of pending) {
      // Individually guarded: one stale candidate (e.g. from a negotiation that got rolled
      // back) must not discard the rest of the batch.
      try { await this.pc.addIceCandidate(candidate) } catch { /* stale candidate */ }
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
