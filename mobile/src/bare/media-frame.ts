import b4a from 'b4a'
import type { MediaFrameMessage } from '@core/call/call-encoding'

// ---------------------------------------------------------------------------
// How a call's media frames cross the worklet boundary on this platform.
//
// Frames are the only thing on the bridge whose shape changes in transit: the core speaks
// `MediaFrameMessage` with raw bytes, and the phone speaks base64. That translation was written
// inline at three sites and typed at none — `(session as any).sendCallFrame(…)` on the app side, a
// `(frame: any)` handler that rewrote its argument in place on the worklet side, and a third
// hand-written shape in the component that renders the frames. The cast was load-bearing: the
// contract in `session-contract.ts` says this method takes bytes, and the app has always sent a
// string.
//
// Base64 rather than the frame's binary tail (which file downloads do use) because both ends of
// the phone's video path already speak it: the camera returns `base64` from `takePictureAsync`,
// and the only consumer is an `Image` whose `source` is a `data:` URI. Bytes on the wire here
// would mean encoding twice.
// ---------------------------------------------------------------------------

export const AUDIO_FRAME = 0
export const VIDEO_FRAME = 1

/**
 * The frame kinds this platform can do something with.
 *
 * Desktop ships ~31 audio packets a second during any call (512 samples at 16 kHz, see
 * `media-pipeline.ts`). Mobile has no call-audio path in either direction — it neither captures
 * nor plays it — so every one of those was base64-encoded, JSON-stringified, pushed across the
 * bridge and dropped by a listener that only looks at video, on the same JS thread the component
 * throttles itself to 12 fps to protect. They stop at the boundary now.
 *
 * This is the list to extend when mobile grows an audio path, and it sits next to the codec so
 * that is one edit rather than a hunt.
 */
export const PLAYABLE_FRAME_KINDS: readonly number[] = [VIDEO_FRAME]

export function isPlayableFrame(kind: number): boolean {
  return PLAYABLE_FRAME_KINDS.includes(kind)
}

/** A media frame as it crosses the bridge: the core's frame with its payload in base64. */
export interface WireMediaFrame extends Omit<MediaFrameMessage, 'payload'> {
  payload: string
}

export function toWireFrame(frame: MediaFrameMessage): WireMediaFrame {
  return { ...frame, payload: frame.payload ? b4a.toString(frame.payload, 'base64') : '' }
}

export function fromWireFrame(frame: WireMediaFrame): MediaFrameMessage {
  return { ...frame, payload: b4a.from(frame.payload ?? '', 'base64') }
}

/**
 * The `data:` URI for a frame, or null if it is not one this platform can show.
 *
 * The JPEG check is on the base64 text rather than the bytes: `/9j/` is what `FF D8 FF` encodes
 * to, and every JPEG starts with it. A frame that is not one — a codec the sender picked up later,
 * a truncated capture — must not reach `Image`, which renders a broken frame rather than keeping
 * the last good one.
 */
export function frameDataUri(frame: { kind: number; payload: string }): string | null {
  if (frame.kind !== VIDEO_FRAME || !frame.payload.startsWith('/9j/')) return null
  return `data:image/jpeg;base64,${frame.payload}`
}
