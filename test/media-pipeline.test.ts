import test from 'node:test'
import assert from 'node:assert/strict'
import * as cenc from 'compact-encoding'
import { MediaPipeline } from '../src/call/media-pipeline.js'
import { mediaFrameEncoding } from '../src/call/call-encoding.js'

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

test('MediaPipeline.decodePcm16 reads a payload sitting at an odd byte offset', () => {
  // The regression this guards: `new Int16Array(payload.buffer, payload.byteOffset, …)` throws
  // `RangeError` on an odd offset, and a decoded frame is a view into protomux's batch buffer at
  // whatever offset the messages before it left behind.
  const samples = [0, 1, -1, 1000, -1000, 32767, -32768]
  const backing = new Uint8Array(1 + samples.length * 2)
  const view = new DataView(backing.buffer)
  samples.forEach((s, i) => view.setInt16(1 + i * 2, s, true))

  const odd = backing.subarray(1)
  assert.equal(odd.byteOffset % 2, 1, 'the fixture must actually be misaligned')

  const out = MediaPipeline.decodePcm16(odd)
  assert.equal(out.length, samples.length)
  assert.equal(out[0], 0)
  assert.ok(Math.abs((out[5] ?? 0) - 1) < 1e-6, 'full-scale positive maps to +1')
  assert.equal(out[6], -1, 'full-scale negative maps to -1')
  assert.ok(Math.abs((out[3] ?? 0) - 1000 / 0x7fff) < 1e-6)
  assert.ok(Math.abs((out[4] ?? 0) + 1000 / 0x8000) < 1e-6)
})

test('MediaPipeline.decodePcm16 agrees with the aligned reading and tolerates a short frame', () => {
  const samples = [5, -5, 20000, -20000]
  const aligned = new Uint8Array(samples.length * 2)
  const view = new DataView(aligned.buffer)
  samples.forEach((s, i) => view.setInt16(i * 2, s, true))

  const fromAligned = MediaPipeline.decodePcm16(aligned)
  const padded = new Uint8Array(aligned.length + 1)
  padded.set(aligned, 1)
  const fromOdd = MediaPipeline.decodePcm16(padded.subarray(1))
  assert.deepEqual([...fromOdd], [...fromAligned])

  // A trailing odd byte is not half a sample — it is dropped, not thrown over.
  const short = new Uint8Array(aligned.length + 1)
  short.set(aligned, 0)
  assert.equal(MediaPipeline.decodePcm16(short).length, samples.length)
  assert.equal(MediaPipeline.decodePcm16(new Uint8Array([0x01])).length, 0)
  assert.equal(MediaPipeline.decodePcm16(new Uint8Array([])).length, 0)
})

test('MediaPipeline.scheduleAudioFrame keeps a healthy queue seamless', () => {
  const duration = 0.032
  // Queue is ahead of the clock but within the ceiling: the frame is appended exactly where the
  // previous one ends, which is what makes playback gapless.
  const out = MediaPipeline.scheduleAudioFrame(10.05, 10, duration)
  assert.equal(out.startAt, 10.05)
  assert.equal(out.nextPlayTime, 10.05 + duration)
  assert.equal(out.resynced, false)
})

test('MediaPipeline.scheduleAudioFrame gives a dry queue headroom instead of scheduling in the past', () => {
  const duration = 0.032
  const out = MediaPipeline.scheduleAudioFrame(9.9, 10, duration)
  assert.equal(out.startAt, 10 + MediaPipeline.AUDIO_JITTER_HEADROOM_S)
  assert.equal(out.nextPlayTime, out.startAt + duration)
  assert.equal(out.resynced, false, 'a dry queue has no backlog to discard')
})

test('MediaPipeline.scheduleAudioFrame drops a backlog that has become pure latency', () => {
  const duration = 0.032
  // The unbounded-drift case: a burst arrived late, or the sender's clock runs fast, and the queue
  // has crept half a second ahead. Without a ceiling this only ever grew.
  const out = MediaPipeline.scheduleAudioFrame(10.5, 10, duration)
  assert.equal(out.resynced, true)
  assert.equal(out.startAt, 10 + MediaPipeline.AUDIO_JITTER_HEADROOM_S)
  assert.ok(out.nextPlayTime - 10 < MediaPipeline.MAX_AUDIO_LEAD_S + duration)

  // Comfortably inside the ceiling stays untouched — the lead there is doing its job. Not tested at
  // exactly the ceiling: `10 + 0.15 - 10` is `0.1500000000000004`, so which side of the comparison
  // the boundary lands on is a fact about binary floating point, not a behaviour worth pinning.
  const insideAt = 10 + MediaPipeline.MAX_AUDIO_LEAD_S - 0.01
  const inside = MediaPipeline.scheduleAudioFrame(insideAt, 10, duration)
  assert.equal(inside.resynced, false)
  assert.equal(inside.startAt, insideAt)
})

test('MediaPipeline.scheduleAudioFrame converges instead of drifting under a steadily fast sender', () => {
  // 40 frames arriving every 25ms of wall clock but worth 32ms of audio each: the queue gains 7ms
  // per frame. The old code let that run to ~280ms of added latency; the ceiling caps it.
  const duration = 0.032
  let nextPlayTime = 0
  let now = 0
  let resyncs = 0
  for (let i = 0; i < 40; i++) {
    const out = MediaPipeline.scheduleAudioFrame(nextPlayTime, now, duration)
    if (out.resynced) resyncs++
    nextPlayTime = out.nextPlayTime
    now += 0.025
  }
  assert.ok(resyncs > 0, 'a steadily growing queue must be resynced at least once')
  assert.ok(
    nextPlayTime - now <= MediaPipeline.MAX_AUDIO_LEAD_S + duration,
    `lead stayed bounded (was ${nextPlayTime - now}s)`
  )
})

test('MediaPipeline.shouldSendJpegFrame paces the fallback well below the capture loop', () => {
  const minGap = 1000 / MediaPipeline.JPEG_FALLBACK_FPS
  assert.ok(MediaPipeline.JPEG_FALLBACK_FPS < 20, 'the fallback must not run at the capture rate')

  // The capture loop ticks every 50ms; most of those ticks must not send.
  assert.equal(MediaPipeline.shouldSendJpegFrame(1000, 1000, null), false)
  assert.equal(MediaPipeline.shouldSendJpegFrame(1050, 1000, null), false)
  assert.equal(MediaPipeline.shouldSendJpegFrame(1000 + minGap, 1000, null), true)

  // An encode still in flight blocks the next one.
  assert.equal(MediaPipeline.shouldSendJpegFrame(1000 + minGap, 1000, 1000), false)

  // First frame of a call: nothing sent yet, so it goes immediately.
  assert.equal(MediaPipeline.shouldSendJpegFrame(Date.now(), 0, null), true)
})

test('a JPEG encode that never calls back does not latch capture shut forever', () => {
  // The guard is a timestamp, not a flag, precisely so a lost `toBlob` callback costs one stalled
  // second rather than the rest of the call's video.
  const startedAt = 1_000_000
  const justBefore = startedAt + MediaPipeline.JPEG_ENCODE_STALL_MS - 1
  assert.equal(MediaPipeline.shouldSendJpegFrame(justBefore, startedAt, startedAt), false)

  const afterStall = startedAt + MediaPipeline.JPEG_ENCODE_STALL_MS
  assert.equal(MediaPipeline.shouldSendJpegFrame(afterStall, startedAt, startedAt), true)
})

test('the paced JPEG fallback sends about JPEG_FALLBACK_FPS frames per second of capture ticks', () => {
  let lastSentAt = 0
  let sent = 0
  // One second of the real 50ms capture loop.
  for (let now = 1_000_000; now < 1_001_000; now += 50) {
    if (MediaPipeline.shouldSendJpegFrame(now, lastSentAt, null)) {
      lastSentAt = now
      sent++
    }
  }
  assert.ok(sent <= MediaPipeline.JPEG_FALLBACK_FPS + 1, `sent ${sent} frames in a second`)
  assert.ok(sent >= MediaPipeline.JPEG_FALLBACK_FPS - 3, `sent ${sent} frames in a second`)
})

test('an audio frame decoded off the wire plays whatever offset protomux leaves it at', () => {
  // The end-to-end shape of the bug, with the real encoding rather than a hand-built view.
  // `cenc.buffer.decode` ends with `state.buffer.subarray(state.start, …)`, so the payload the
  // pipeline receives is a window into the batch, and the bytes ahead of it decide its alignment.
  // Electron runs the core in-process, so nothing copies it on the way — `Int16Array` threw here.
  const samples = new Int16Array([0, 1234, -1234, 32767, -32768, 7, -7, 999])
  const payload = new Uint8Array(samples.buffer.slice(0))
  const frame = {
    callId: 'a'.repeat(32),
    seq: 7,
    timestamp: Date.now(),
    kind: 0,
    keyframe: true,
    payload
  }

  const offsets = new Set<number>()
  // Protomux prefixes each message in a batch with varints, and the batch itself is a view into
  // the secret stream's plaintext: both shift by amounts nothing here controls. Sweep the leading
  // bytes rather than assert one offset.
  for (let lead = 0; lead < 6; lead++) {
    const state = cenc.state()
    state.start = lead
    state.end = lead
    mediaFrameEncoding.preencode(state, frame)
    state.buffer = new Uint8Array(state.end)
    state.start = lead
    mediaFrameEncoding.encode(state, frame)
    state.start = lead
    const decoded = mediaFrameEncoding.decode(state)

    offsets.add(decoded.payload.byteOffset % 2)
    const out = MediaPipeline.decodePcm16(decoded.payload)
    assert.equal(out.length, samples.length, `lead=${lead}`)
    assert.equal(out[0], 0, `lead=${lead}`)
    assert.equal(out[4], -1, `lead=${lead}`)
    assert.ok(Math.abs((out[1] ?? 0) - 1234 / 0x7fff) < 1e-6, `lead=${lead}`)
  }

  assert.ok(offsets.has(1), 'the sweep must actually produce a misaligned payload, or it proves nothing')
})
