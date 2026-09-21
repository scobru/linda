import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CALL_CAPTURE_WIDTH, CALL_CAPTURE_HEIGHT,
  parseCaptureSize, pickCaptureSize
} from '../src/call/capture-size.js'

test('a real phone\'s size list picks something near the frame, not the sensor', () => {
  // What a mid-range Android actually offers. The last one is what was being captured before:
  // twelve megapixels, decoded to a 48 MB bitmap and re-encoded, twice a second.
  const offered = ['176x144', '320x240', '640x480', '1280x720', '1920x1080', '4000x3000']
  assert.equal(pickCaptureSize(offered), '640x480')
})

test('the chosen size covers the frame rather than merely being close to it', () => {
  // 320x240 is nearer 480x360 in area than 640x480 is, and it would upscale — the frame would be
  // softer than the one the desktop sends at the same nominal size.
  const offered = ['320x240', '640x480']
  const picked = pickCaptureSize(offered)
  assert.equal(picked, '640x480')

  const parsed = parseCaptureSize(picked!)!
  assert.ok(parsed.width >= CALL_CAPTURE_WIDTH && parsed.height >= CALL_CAPTURE_HEIGHT)
})

test('the smallest covering size wins, because decode cost is what this controls', () => {
  const offered = ['4000x3000', '1920x1080', '800x600', '1280x720']
  assert.equal(pickCaptureSize(offered), '800x600')
})

test('a portrait-reported size counts as covering too', () => {
  // Some devices report the sensor the other way round. A 480x640 frame contains a 480x360 one.
  assert.equal(pickCaptureSize(['240x320', '480x640', '1080x1920']), '480x640')
})

test('a device whose best is smaller than the target gets its best', () => {
  // Nothing is saved by refusing to capture here, and the largest is the least bad picture.
  assert.equal(pickCaptureSize(['160x120', '320x240']), '320x240')
})

test('an empty or unreadable list means leave the platform alone', () => {
  // Null is "set no pictureSize", which is exactly the behaviour that existed before. Guessing a
  // size the device never offered would be worse than not constraining it.
  assert.equal(pickCaptureSize([]), null)
  assert.equal(pickCaptureSize(['', 'best', '1920*1080', 'x']), null)
})

test('unreadable entries are skipped without discarding the readable ones', () => {
  assert.equal(pickCaptureSize(['garbage', '640x480', '0x0', '4000x3000']), '640x480')
})

test('parseCaptureSize reads what Android reports and refuses what it does not', () => {
  assert.deepEqual(parseCaptureSize('640x480'), { label: '640x480', width: 640, height: 480 })
  assert.deepEqual(parseCaptureSize('  640x480  '), { label: '  640x480  ', width: 640, height: 480 })
  assert.equal(parseCaptureSize('640X480'), null, 'the separator Android uses is lowercase')
  assert.equal(parseCaptureSize('640x'), null)
  assert.equal(parseCaptureSize('0x480'), null)
  assert.equal(parseCaptureSize(''), null)
})

test('the target is the size the desktop has always drawn into', () => {
  // `media-pipeline.ts` now sizes its capture canvas and its VP8 encoder from these, so the two
  // platforms cannot drift onto different frame sizes. Pinned here because changing them changes
  // what every call sends, which is worth doing on purpose rather than in passing.
  assert.equal(CALL_CAPTURE_WIDTH, 480)
  assert.equal(CALL_CAPTURE_HEIGHT, 360)
})
