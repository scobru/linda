import { AUDIO_PCM16_FRAME, AUDIO_OPUS_FRAME } from './call-encoding.js'

// ---------------------------------------------------------------------------
// Which audio codec a call speaks, and how the two ends agree on it.
//
// Audio went out as raw little-endian PCM16 at 16 kHz, 512 samples a packet: ~31 packets a second
// at 1024 bytes each, about 256 kbit/s, uncompressed. Opus carries the same speech at roughly a
// tenth of that. On a link that could not carry both streams, those ~230 kbit/s were being taken
// from the video — and from the audio's own latency, since everything shares one ordered stream.
//
// The hard part is not the codec, it is that both ends must agree before a single frame is sent.
// Peers here update independently: a build that sends Opus to one that expects PCM does not
// degrade, it produces noise, and a build that goes quiet instead is only marginally better. So the
// codec is negotiated in the offer and the answer, both of which grew a trailing optional string —
// the pattern `message-encoding.ts` documents, where a peer that predates the field simply sends a
// shorter frame and the decoder reads `''`.
//
// That empty string is the whole compatibility story: it means PCM16, which every build that has
// ever shipped understands. New caller to old peer, old caller to new peer, and two old peers all
// land there on their own, with nothing to configure and no version check anywhere.
// ---------------------------------------------------------------------------

export const PCM16 = 'pcm16'
export const OPUS = 'opus'

export interface AudioCodecSpec {
  name: string
  /** The `kind` its frames carry on the wire. */
  frameKind: number
  /** The rate its capture and playback contexts run at. */
  sampleRate: number
  /**
   * Samples per packet the capture side emits.
   *
   * Opus codes in fixed durations (2.5/5/10/20/40/60 ms) and 20 ms is the usual speech trade
   * between overhead and latency: 960 samples at its native 48 kHz. PCM16 keeps the 512 it has
   * always used — nothing on the receiving end cares how long a PCM packet is, and changing it
   * would be churn on the path this one exists to stop using.
   */
  frameSamples: number
}

const SPECS: Readonly<Record<string, AudioCodecSpec>> = {
  [PCM16]: { name: PCM16, frameKind: AUDIO_PCM16_FRAME, sampleRate: 16000, frameSamples: 512 },
  [OPUS]: { name: OPUS, frameKind: AUDIO_OPUS_FRAME, sampleRate: 48000, frameSamples: 960 }
}

/**
 * Every codec this build knows, best first.
 *
 * Knowing one is not the same as being able to run it: `media-pipeline.ts` asks the browser at
 * startup whether it can actually encode Opus, and what it advertises is the intersection. A build
 * that advertised what it could only decode would negotiate a call it then could not speak.
 */
export const PREFERRED_AUDIO_CODECS: readonly string[] = [OPUS, PCM16]

/** The codec assumed when nothing says otherwise: an older peer, an empty field, no agreement. */
export const DEFAULT_AUDIO_CODEC = PCM16

export function audioCodecSpec(name: string): AudioCodecSpec {
  return SPECS[name] ?? SPECS[PCM16]!
}

/** The spec for a frame kind, or null when the kind is not audio (or is not one we know). */
export function audioCodecForFrameKind(kind: number): AudioCodecSpec | null {
  for (const spec of Object.values(SPECS)) {
    if (spec.frameKind === kind) return spec
  }
  return null
}

/** How a codec list travels in an offer's one string field. */
export function encodeAudioCodecList(codecs: readonly string[]): string {
  return codecs.filter((name) => name in SPECS).join(',')
}

/**
 * Reads that field back.
 *
 * An absent or empty field is an older peer, and an older peer speaks PCM16 — stated here rather
 * than at each call site, because "empty means the floor, not nothing" is exactly the kind of thing
 * two readers would resolve differently.
 */
export function parseAudioCodecList(field: string | undefined): string[] {
  const names = (field ?? '').split(',').map((name) => name.trim()).filter((name) => name in SPECS)
  return names.length > 0 ? names : [DEFAULT_AUDIO_CODEC]
}

/**
 * The codec a call will use, decided by the answerer.
 *
 * One side has to choose, or two peers with different preference orders would each pick their own
 * favourite and send the other something it is not listening for. The answerer chooses because it
 * is the side that has seen both lists.
 *
 * The offerer's order wins among codecs both support — the same convention SDP uses, and the one
 * that lets a caller on a metered connection ask for the cheap codec and be given it. Falls to
 * PCM16 whenever there is no overlap, including when either list is empty.
 */
export function negotiateAudioCodec(offered: string | undefined, supported: readonly string[]): string {
  const theirs = parseAudioCodecList(offered)
  // The floor is always available to us, whatever the caller was told this build supports: it is
  // the format with no runtime requirement at all.
  const ours = new Set<string>([...supported.filter((name) => name in SPECS), DEFAULT_AUDIO_CODEC])
  for (const name of theirs) {
    if (ours.has(name)) return name
  }
  return DEFAULT_AUDIO_CODEC
}

/** What the answer's field said, read the same forgiving way as everything else here. */
export function readNegotiatedCodec(field: string | undefined): string {
  const name = (field ?? '').trim()
  return name in SPECS ? name : DEFAULT_AUDIO_CODEC
}
