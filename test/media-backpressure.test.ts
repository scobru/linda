import test from 'node:test'
import assert from 'node:assert/strict'
import { MediaBackpressure } from '../src/call/media-backpressure.js'

test('an unblocked wire lets every video frame through', () => {
  const gate = new MediaBackpressure()
  let now = 1000
  for (let i = 0; i < 40; i++) {
    gate.update(true, now)
    assert.equal(gate.allowsVideo(now), true)
    now += 50
  }
  assert.equal(gate.droppedFrames, 0)
  assert.equal(gate.blockedNow, false)
})

test('a blocked wire stops video without ever stopping the caller from sending audio', () => {
  const gate = new MediaBackpressure()
  gate.update(false, 1000)
  assert.equal(gate.blockedNow, true)

  // The capture loop keeps ticking every 50ms; none of those ticks produce a frame.
  for (let now = 1050; now < 1000 + MediaBackpressure.PROBE_INTERVAL_MS; now += 50) {
    assert.equal(gate.allowsVideo(now), false, `tick at ${now}`)
  }
  assert.ok(gate.droppedFrames > 15, `dropped ${gate.droppedFrames} frames`)
})

test('a block expires into a probe rather than into silence', () => {
  const gate = new MediaBackpressure()
  gate.update(false, 1000)
  assert.equal(gate.allowsVideo(1500), false)

  // Nothing has told it to resume — no audio to probe with, a missed transition, a peer that
  // stopped reading. The gate must not stay shut on its own say-so.
  assert.equal(gate.allowsVideo(1000 + MediaBackpressure.PROBE_INTERVAL_MS), true)

  // And that one probe does not reopen the gate: still blocked until the wire says otherwise.
  assert.equal(gate.blockedNow, true)
  assert.equal(gate.allowsVideo(1000 + MediaBackpressure.PROBE_INTERVAL_MS + 50), false)
})

test('a still-blocked wire reporting itself again does not push the probe further out', () => {
  const gate = new MediaBackpressure()
  gate.update(false, 1000)
  // Audio keeps flowing at ~31 packets a second, each one reporting the same block. If every
  // report reset the clock, the probe would never come due.
  for (let now = 1000; now < 1000 + MediaBackpressure.PROBE_INTERVAL_MS; now += 32) {
    gate.update(false, now)
  }
  assert.equal(gate.allowsVideo(1000 + MediaBackpressure.PROBE_INTERVAL_MS), true)
})

test('the wire wanting more reopens the gate immediately', () => {
  const gate = new MediaBackpressure()
  gate.update(false, 1000)
  assert.equal(gate.allowsVideo(1050), false)

  // One audio frame's send result is enough — this is why audio is never gated.
  gate.update(true, 1060)
  assert.equal(gate.blockedNow, false)
  assert.equal(gate.allowsVideo(1060), true)
})

test('the first frame after a gap is owed a keyframe, and the debt is paid once', () => {
  const gate = new MediaBackpressure()
  assert.equal(gate.takeKeyframeDebt(), false, 'nothing is owed before anything is dropped')

  gate.update(false, 1000)
  assert.equal(gate.allowsVideo(1050), false)
  assert.equal(gate.allowsVideo(1100), false)

  // A delta frame here would reference pictures the decoder built from frames that no longer lead
  // anywhere: it must stand on its own.
  assert.equal(gate.takeKeyframeDebt(), true)
  assert.equal(gate.takeKeyframeDebt(), false, 'the debt is owed once, not on every later frame')
})

test('an uninterrupted stream owes no keyframe', () => {
  const gate = new MediaBackpressure()
  let now = 1000
  for (let i = 0; i < 20; i++) {
    gate.update(true, now)
    gate.allowsVideo(now)
    now += 50
  }
  assert.equal(gate.takeKeyframeDebt(), false)
})

test('reset returns the gate to what a fresh call starts with', () => {
  const gate = new MediaBackpressure()
  gate.update(false, 1000)
  gate.allowsVideo(1050)
  assert.ok(gate.droppedFrames > 0)

  gate.reset()
  assert.equal(gate.blockedNow, false)
  assert.equal(gate.droppedFrames, 0)
  assert.equal(gate.takeKeyframeDebt(), false)
  assert.equal(gate.allowsVideo(0), true)
})

test('a link that carries about half the frame rate settles there instead of queueing', () => {
  // The shape this exists for: the loop offers 20 fps, the wire absorbs roughly every other frame.
  // Before, all 20 went out and the surplus became a growing backlog. Here the surplus is simply
  // not produced.
  const gate = new MediaBackpressure()
  let sent = 0
  let offered = 0
  for (let tick = 0; tick < 200; tick++) {
    const now = 1000 + tick * 50
    offered++
    if (gate.allowsVideo(now)) {
      sent++
      // Every other send fills the buffer; the one after it drains.
      gate.update(sent % 2 === 0, now)
    }
  }
  assert.equal(offered, 200)
  assert.ok(sent < offered, `the gate must hold something back (sent ${sent}/${offered})`)
  assert.ok(sent > 0, 'and must not hold everything back')
  assert.equal(sent + gate.droppedFrames, offered, 'every offered frame was either sent or counted')
})
