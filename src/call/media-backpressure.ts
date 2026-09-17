// ---------------------------------------------------------------------------
// Whether a call's video may keep being produced, decided from what the wire says about itself.
//
// Nothing asked. `protocol-channel.ts` sends fire-and-forget, and the capture loop in
// `media-pipeline.ts` fires every 50ms regardless — so when the link could not carry 20 fps, the
// frames did not slow down, they queued. Hyperswarm hands Protomux a reliable, ordered UDX stream:
// a queue on it is not dropped, it is delivered late, and everything behind it waits. The call's
// audio shares that stream (and so does Hypercore replication, see `app/session.ts`), so the
// backlog one video frame too many creates is paid for by the audio packets behind it.
//
// That is the bufferbloat shape: latency that grows without bound while every layer reports
// success. Lowering the bitrate does not fix it, because the loop will still outrun whatever the
// link can carry — it just takes longer to get there.
//
// Protomux already answers the question. Its `send()` returns the underlying `stream.write()`
// boolean: false means the send buffer is over its watermark. The core records that answer and
// reports the transitions (`app/session.ts`), and this is what the producing end does with them.
//
// Audio is never gated here. It is ~1 KB every 32ms, it is the part of a call people actually need,
// and — because it keeps flowing while video is held back — it is also what keeps probing the wire.
// A paused video path with live audio learns it may resume within one frame.
// ---------------------------------------------------------------------------

export class MediaBackpressure {
  /**
   * How long a blocked path waits before sending one frame anyway.
   *
   * A pure "stop until told otherwise" gate has a failure mode worth more than the bandwidth it
   * saves: if the resume never arrives — audio is off, so nothing probes the wire; the transition
   * is missed; the peer stops reading — video is off for the rest of the call, with nothing on
   * screen to say why. So the block expires into a probe rather than into silence. One frame a
   * second costs nothing next to the 20 it replaces, and its own send result is what answers the
   * question.
   */
  static readonly PROBE_INTERVAL_MS = 1000

  private blocked = false
  private lastProbeAt = 0
  private skipped = 0
  private keyframeDebt = false

  /** What the wire last said: `true` when it wants more, which is `send()`'s own return value. */
  update(wantsMore: boolean, now: number): void {
    if (wantsMore) {
      this.blocked = false
      return
    }
    // Only the leading edge moves the probe clock. Re-reporting a block that is already known must
    // not push the next probe further out, or a steady stream of `false` would defer it forever.
    if (!this.blocked) {
      this.blocked = true
      this.lastProbeAt = now
    }
  }

  /**
   * Whether a video frame may be produced now.
   *
   * Asked before encoding rather than before sending, because a frame dropped after the encoder has
   * already consumed it is worse than useless: VP8 delta frames reference their predecessor, so a
   * hole in the chain corrupts the receiver's picture until the next keyframe — up to two seconds
   * away. Dropping before the encoder keeps the chain intact, and `takeKeyframeDebt` below closes
   * the gap it does leave.
   */
  allowsVideo(now: number): boolean {
    if (!this.blocked) return true
    if (now - this.lastProbeAt < MediaBackpressure.PROBE_INTERVAL_MS) {
      this.skipped++
      this.keyframeDebt = true
      return false
    }
    this.lastProbeAt = now
    return true
  }

  /**
   * Whether the frame about to be sent has to be a keyframe, clearing the debt.
   *
   * Skipping frames is invisible to the encoder — it just sees a longer gap — but not to the
   * decoder on the other side, which is holding a picture built from frames that no longer lead
   * anywhere useful. The first frame after a gap has to stand on its own.
   */
  takeKeyframeDebt(): boolean {
    const owed = this.keyframeDebt
    this.keyframeDebt = false
    return owed
  }

  /** True while the wire has told us to hold back. Reporting only; `allowsVideo` is the decision. */
  get blockedNow(): boolean {
    return this.blocked
  }

  /** Frames not produced since the last reset — the thing worth looking at when a call looked bad. */
  get droppedFrames(): number {
    return this.skipped
  }

  /** Back to the state a fresh call starts in. */
  reset(): void {
    this.blocked = false
    this.lastProbeAt = 0
    this.skipped = 0
    this.keyframeDebt = false
  }
}
