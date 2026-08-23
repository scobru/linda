import type { RpcChannel } from '../network/rpc.js'
import type { CallSignalMessage } from '../network/encoding.js'

export interface CallHandlers {
  onRemoteStream?(stream: MediaStream): void
  onRemoteScreenShare?(stream: MediaStream): void
  onClose?(): void
  /** One line of ICE progress, for showing the user why a call did or didn't connect.
   * Deliberately a callback rather than console.log: release builds strip `console.*`
   * entirely (verified — zero occurrences survive in the shipped Android bundle), so
   * anything logged that way is invisible exactly where diagnosing matters most. */
  onDiagnostic?(line: string): void
}

/**
 * Hyperswarm's hole-punch only covers its own signaling socket — WebRTC opens a
 * separate UDP flow for media, with its own local port, that needs its own NAT
 * traversal. STUN alone fixes cone-vs-cone and most cone-vs-symmetric pairings, but a
 * fully symmetric NAT on both ends (carrier-to-carrier, e.g. two phones both on 5G) is
 * only reachable through a TURN relay that actually forwards the media — no amount of
 * candidate exchange gets around that, it's a property of the NAT itself.
 *
 * No TURN here, deliberately. A previous version listed openrelay.metered.ca, which turns
 * out to have no DNS record at all — verified by probe, along with every other free
 * no-signup public TURN we could find (all dead or STUN-only). A relay entry that can't
 * resolve is worse than none: it buys nothing and makes ICE wait on a doomed lookup.
 *
 * The practical consequence: one peer behind a symmetric NAT still connects to a peer on a
 * normal cone NAT (phone-on-cellular to desktop-on-wifi), because the cone side is directly
 * addressable — provided no candidates are lost on the way, which is what the buffering in
 * `flushPendingCandidates` is there to guarantee. Symmetric on *both* ends (two phones, both
 * on cellular) cannot work without a relay, and needs a real TURN deployment to fix.
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

/** Whether a signal that arrived for a peer with no live `PeerCall` is worth holding for replay
 * once one exists. Only candidates are.
 *
 * A `PeerCall` is built by an incoming 'offer', and that path awaits getUserMedia — seconds, when
 * it raises a permission dialog. Candidates the caller sends during that window have nothing to
 * apply to yet, and losing them breaks connectivity in exactly the cases that depend on them.
 *
 * Everything else must be dropped instead. A stray 'answer' or 'hangup' has no call to apply it
 * to and never will: queueing them meant the peer's parting 'hangup' — which routinely lands just
 * after our own teardown — survived in the queue and was replayed into the *next* call, ending it
 * on arrival. Calls worked exactly once per app session because of it. */
export function shouldQueueSignal(kind: CallSignalMessage['kind']): boolean {
  return kind === 'candidate'
}

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
  /** Diagnostics only — see `onicecandidate`/`oniceconnectionstatechange`. */
  private readonly localCandidateTypes = new Set<string>()
  private remoteCandidateCount = 0

  constructor(
    private readonly rpc: RpcChannel,
    private readonly roomId: string,
    private readonly localUserId: string,
    private readonly remoteUserId: string,
    localStream: MediaStream,
    private readonly handlers: CallHandlers = {}
  ) {
    this.polite = localUserId < remoteUserId
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    for (const track of localStream.getTracks()) this.pc.addTrack(track, localStream)

    this.pc.onicecandidate = (event) => {
      if (!event.candidate) {
        // Null candidate = gathering finished. What we managed to gather is the single most
        // diagnostic fact when a call won't connect: no `srflx` means STUN itself didn't answer
        // on this network, and no `relay` means no TURN (see ICE_SERVERS) — which is the
        // difference between "can reach a cone NAT" and "can reach anything".
        handlers.onDiagnostic?.(`gathered: ${[...this.localCandidateTypes].join(', ') || 'none'}`)
        return
      }
      const type = /typ (\w+)/.exec(event.candidate.candidate ?? '')?.[1]
      if (type) this.localCandidateTypes.add(type)
      this.signal('candidate', JSON.stringify(event.candidate))
    }

    this.pc.oniceconnectionstatechange = () => {
      // 'checking' -> 'failed' means candidates were exchanged but no pair ever worked (the
      // NAT-traversal failure); never reaching 'checking' means they weren't exchanged at all.
      handlers.onDiagnostic?.(`ICE ${this.pc.iceConnectionState} (remote candidates: ${this.remoteCandidateCount})`)
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
      handlers.onDiagnostic?.(`connection ${state}`)
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
        this.remoteCandidateCount++
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
        // Distinguishes "the peer hung up on us" from "our own connection died" — the two look
        // identical from the UI, and they have completely different causes. `payload` carries
        // the peer's reason when it has one (see `hangup`), which is the difference between
        // "the call failed" and "their camera was busy".
        this.handlers.onDiagnostic?.(`hangup from peer${message.payload ? `: ${message.payload}` : ''}`)
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

  /** `reason` is shown to the peer as the cause of the hangup. Worth passing whenever we hang up
   * for a reason the peer can't infer — above all "we couldn't open the camera/mic", which is
   * otherwise indistinguishable on their end from the call simply failing to connect. */
  hangup(reason = ''): void {
    if (this.disconnectTimer) { clearTimeout(this.disconnectTimer); this.disconnectTimer = null }
    this.signal('hangup', reason)
    this.pc.close()
  }

  private signal(kind: CallSignalMessage['kind'], payload: string): void {
    this.rpc.sendCallSignal({ roomId: this.roomId, fromUserId: this.localUserId, kind, payload })
  }
}
