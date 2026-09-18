import test from 'node:test'
import assert from 'node:assert/strict'
import b4a from 'b4a'
import {
  AUDIO_FRAME, VIDEO_FRAME, PLAYABLE_FRAME_KINDS,
  isPlayableFrame, toWireFrame, fromWireFrame, frameDataUri
} from '../mobile/src/bare/media-frame.js'
import type { MediaFrameMessage } from '../src/call/call-encoding.js'

// ---------------------------------------------------------------------------
// The one place on the mobile bridge where a value changes shape in transit. It was written inline
// at three sites and typed at none: a cast on the app side, a handler that rewrote its argument in
// place on the worklet side, and a third hand-written shape in the component that renders frames.
// ---------------------------------------------------------------------------

const frame = (over: Partial<MediaFrameMessage> = {}): MediaFrameMessage => ({
  callId: 'c1', seq: 4, timestamp: 1_700_000_000, kind: VIDEO_FRAME, keyframe: true,
  payload: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x0a]),
  ...over
})

test('a frame survives the crossing with its bytes and its header intact', () => {
  const original = frame()
  const back = fromWireFrame(toWireFrame(original))

  assert.equal(back.callId, original.callId)
  assert.equal(back.seq, original.seq)
  assert.equal(back.timestamp, original.timestamp)
  assert.equal(back.kind, original.kind)
  assert.equal(back.keyframe, original.keyframe)
  assert.deepEqual([...back.payload], [...original.payload])
})

test('bytes that base64 would mangle if it were a string round trip too', () => {
  // The payload is JPEG, not text: it is full of bytes no encoding survives as characters.
  const payload = new Uint8Array([0x00, 0xff, 0x80, 0x7f, 0x0a, 0x0d, 0x1a])
  const back = fromWireFrame(toWireFrame(frame({ payload })))
  assert.deepEqual([...back.payload], [...payload])
})

test('an empty payload crosses as empty, not as a broken frame', () => {
  const wire = toWireFrame(frame({ payload: new Uint8Array(0) }))
  assert.equal(wire.payload, '')
  assert.equal(fromWireFrame(wire).payload.byteLength, 0)
})

test('the wire payload is the same base64 the camera produces', () => {
  // `takePictureAsync({ base64: true })` hands the app a base64 string, and the app passes it
  // straight through. Both directions have to agree on the encoding for that to be safe.
  const bytes = new Uint8Array([1, 2, 3, 250, 251, 252])
  assert.equal(toWireFrame(frame({ payload: bytes })).payload, b4a.toString(bytes, 'base64'))
})

test('audio frames cross the boundary now that mobile supports call audio streaming', () => {
  // Mobile now captures and plays call audio (16 kHz mono PCM16), so audio frames are accepted.
  assert.equal(isPlayableFrame(AUDIO_FRAME), true)
  assert.equal(isPlayableFrame(VIDEO_FRAME), true)
  assert.deepEqual([...PLAYABLE_FRAME_KINDS], [VIDEO_FRAME, AUDIO_FRAME])
})

test('an unknown frame kind is not shown', () => {
  // A sender that grows a third kind must not have it rendered as a picture on a build that has
  // never heard of it.
  assert.equal(isPlayableFrame(7), false)
  assert.equal(frameDataUri({ kind: 7, payload: '/9j/4AAQ' }), null)
})

test('a video frame becomes a data URI the Image component can show', () => {
  assert.equal(frameDataUri({ kind: VIDEO_FRAME, payload: '/9j/4AAQ' }), 'data:image/jpeg;base64,/9j/4AAQ')
})

test('a payload that is not a JPEG is refused rather than handed to Image', () => {
  // `/9j/` is what `FF D8 FF` encodes to, and every JPEG starts with it. A truncated capture or a
  // codec the sender picked up later would render as a broken frame instead of leaving the last
  // good one on screen.
  assert.equal(frameDataUri({ kind: VIDEO_FRAME, payload: '' }), null)
  assert.equal(frameDataUri({ kind: VIDEO_FRAME, payload: 'AAAA' }), null)

  const jpeg = toWireFrame(frame({ payload: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) }))
  assert.ok(frameDataUri(jpeg)?.startsWith('data:image/jpeg;base64,/9j/'), 'real JPEG bytes encode to the /9j/ prefix')
})
