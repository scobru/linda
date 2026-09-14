import test from 'node:test'
import assert from 'node:assert/strict'
import { MediaPipeline } from '../src/call/media-pipeline.js'

test('MediaPipeline.isImagePayload accurately detects image buffers', () => {
  // Valid JPEG header (SOI marker 0xFF 0xD8)
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
  assert.equal(MediaPipeline.isImagePayload(jpeg), true)

  // Valid PNG header (0x89 0x50 0x4E 0x47)
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.equal(MediaPipeline.isImagePayload(png), true)

  // Valid WebP header (RIFF....WEBP)
  const webp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x20, 0x00, 0x00, 0x00, // size
    0x57, 0x45, 0x42, 0x50  // WEBP
  ])
  assert.equal(MediaPipeline.isImagePayload(webp), true)

  // VP8 keyframe is NOT an image
  const vp8Key = new Uint8Array([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01])
  assert.equal(MediaPipeline.isImagePayload(vp8Key), false)

  // VP8 delta frame is NOT an image
  const vp8Delta = new Uint8Array([0x11, 0x02, 0x00, 0x00, 0x00, 0x00])
  assert.equal(MediaPipeline.isImagePayload(vp8Delta), false)

  // Empty or short buffers
  assert.equal(MediaPipeline.isImagePayload(new Uint8Array([])), false)
  assert.equal(MediaPipeline.isImagePayload(new Uint8Array([0xff])), false)
})

test('MediaPipeline.isVp8Keyframe validates VP8 bitstream header and rejects delta/JPEG', () => {
  // Valid VP8 keyframe:
  // Byte 0: (byte0 & 0x01) === 0 (bit 0 is 0 for key frame)
  // Bytes 3..5: 0x9D, 0x01, 0x2A (VP8 start code)
  const validVp8Key = new Uint8Array([0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01])
  assert.equal(MediaPipeline.isVp8Keyframe(validVp8Key), true)

  // VP8 delta frame: bit 0 of byte 0 is 1
  const vp8Delta = new Uint8Array([0x01, 0x00, 0x00, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01])
  assert.equal(MediaPipeline.isVp8Keyframe(vp8Delta), false)

  // JPEG marked as keyframe MUST NOT pass as VP8 keyframe (regression guard against decode error)
  const jpegKey = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
  assert.equal(MediaPipeline.isVp8Keyframe(jpegKey), false)

  // Truncated buffer
  assert.equal(MediaPipeline.isVp8Keyframe(new Uint8Array([0x00, 0x00, 0x00])), false)
})

test('MediaPipeline.formatMediaError formats permission and device errors', () => {
  const notAllowed = MediaPipeline.formatMediaError({ name: 'NotAllowedError' })
  assert.match(notAllowed.message, /permission was denied/i)

  const notFound = MediaPipeline.formatMediaError({ name: 'NotFoundError' })
  assert.match(notFound.message, /No microphone or camera device was found/i)

  const busy = MediaPipeline.formatMediaError({ name: 'NotReadableError' })
  assert.match(busy.message, /locked by another application/i)
})
