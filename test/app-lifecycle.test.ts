import test from 'node:test'
import assert from 'node:assert/strict'
import { createAppStateHandler } from '../mobile/src/app-lifecycle.js'

// ---------------------------------------------------------------------------
// The background-connection service is started when the app leaves the foreground and stopped
// when it returns. In v1.14.81 a stop that overtook its start crashed the app
// (`ForegroundServiceDidNotStartInTimeException`). The native module now queues the stop behind
// the start, and that only holds if this side never sends two of the same in a row, or a stop
// with no start before it.
// ---------------------------------------------------------------------------

function harness(initial: string | null = 'active', session = true) {
  const calls: string[] = []
  const state = { session }
  const handle = createAppStateHandler(initial, {
    hasSession: () => state.session,
    onForeground: () => calls.push('resync'),
    startBackgroundConnection: () => calls.push('start'),
    stopBackgroundConnection: () => calls.push('stop')
  })
  return { calls, handle, state }
}

/** Only the service calls, in order. */
const service = (calls: string[]) => calls.filter((c) => c === 'start' || c === 'stop')

test('leaving the foreground starts the service, returning stops it and resyncs', () => {
  const { calls, handle } = harness()
  handle('background')
  handle('active')
  assert.deepEqual(calls, ['start', 'resync', 'stop'])
})

test('no session: nothing to keep connected, so no start and no stop', () => {
  const { calls, handle } = harness('active', false)
  handle('background')
  handle('active')
  assert.deepEqual(calls, ['resync'])
})

test('a session that appears while backgrounded is not stopped on a start that never happened', () => {
  const { calls, handle, state } = harness('active', false)
  handle('background')
  state.session = true
  handle('active')
  assert.deepEqual(service(calls), [])
})

test('passing through inactive on the way out starts once, not twice', () => {
  const { calls, handle } = harness()
  handle('inactive')
  handle('background')
  handle('active')
  assert.deepEqual(service(calls), ['start', 'stop'])
})

test('repeated events for the same state change nothing', () => {
  const { calls, handle } = harness()
  handle('active')
  handle('background')
  handle('background')
  handle('active')
  handle('active')
  assert.deepEqual(calls, ['start', 'resync', 'stop'])
})

test('rapid flips alternate start and stop, starting with a start', () => {
  const { calls, handle } = harness()
  const flips = ['background', 'active', 'inactive', 'active', 'background', 'background', 'active', 'background', 'active']
  for (const next of flips) handle(next)
  const seq = service(calls)
  assert.equal(seq[0], 'start')
  for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1], `two ${seq[i]}s in a row at ${i}: ${seq.join(',')}`)
  assert.equal(seq.at(-1), 'stop', 'back in the foreground, nothing left running')
})

test('launched in the background: returning to the foreground resyncs but stops nothing', () => {
  const { calls, handle } = harness('background')
  handle('active')
  assert.deepEqual(calls, ['resync'])
})
