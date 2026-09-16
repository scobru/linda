import test from 'node:test'
import assert from 'node:assert/strict'
import { callDurationSeconds, formatCallDuration } from '../src/util/duration.js'

// ---------------------------------------------------------------------------
// Both shells showed a call's length and did it differently: mobile from the moment it connected,
// the desktop by incrementing a counter inside a one-second interval. Two people on the same call
// saw two different numbers.
// ---------------------------------------------------------------------------

test('the length comes from when the call connected', () => {
  const startedAt = 1_700_000_000_000
  assert.equal(callDurationSeconds(startedAt, startedAt), 0)
  assert.equal(callDurationSeconds(startedAt, startedAt + 1_000), 1)
  assert.equal(callDurationSeconds(startedAt, startedAt + 59_999), 59)
  assert.equal(callDurationSeconds(startedAt, startedAt + 600_000), 600)
})

test('a window that stopped ticking still knows how long the call has been up', () => {
  // The counter version lost every tick the browser throttled away while the window sat behind
  // another one, so a ten-minute call read as eight.
  const startedAt = 1_700_000_000_000
  const tenMinutes = callDurationSeconds(startedAt, startedAt + 10 * 60_000)
  assert.equal(tenMinutes, 600)
  assert.equal(formatCallDuration(tenMinutes), '10:00')
})

test('a call that has not connected has no length', () => {
  assert.equal(callDurationSeconds(null, Date.now()), 0)
  assert.equal(callDurationSeconds(0, Date.now()), 0)
})

test('a clock that jumps backwards does not produce a negative call', () => {
  const startedAt = 1_700_000_000_000
  assert.equal(callDurationSeconds(startedAt, startedAt - 5_000), 0)
})

test('the format is mm:ss, padded, and does not wrap into hours', () => {
  assert.equal(formatCallDuration(0), '00:00')
  assert.equal(formatCallDuration(9), '00:09')
  assert.equal(formatCallDuration(70), '01:10')
  // Both shells already read past an hour this way, and it is unambiguous in the space it has.
  assert.equal(formatCallDuration(3674), '61:14')
})
