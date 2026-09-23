import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { watchConnectivity, RESYNC_DEBOUNCE_MS } from '../mobile/src/connectivity.js'

// ---------------------------------------------------------------------------
// When the phone resyncs the swarm, with which cause, and when it holds the process up.
//
// Two releases hang off this: v1.14.78 skips a `foreground` resync during a call, so a network
// change reported as a foreground return would cut the call off; and in v1.14.81 a stop of the
// background service that overtook its start crashed the app.
// ---------------------------------------------------------------------------

function rig(initial: string | null = 'active', session = true) {
  const calls: string[] = []
  const state = { session }
  let appState: ((next: string) => void) | null = null
  let network: ((type: string) => void) | null = null
  const stop = watchConnectivity({
    initialAppState: initial,
    onAppStateChange: (listener) => { appState = listener; return () => { appState = null } },
    onNetworkType: (listener) => { network = listener; return () => { network = null } },
    hasSession: () => state.session,
    resumeNetwork: (cause) => calls.push(`resync:${cause}`),
    startBackgroundConnection: () => calls.push('start'),
    stopBackgroundConnection: () => calls.push('stop')
  })
  return {
    calls, state, stop,
    app: (next: string) => appState?.(next),
    net: (type: string) => network?.(type),
    get watching() { return appState !== null || network !== null }
  }
}

/** Only the background-service calls, in order. */
const service = (calls: string[]) => calls.filter((c) => c === 'start' || c === 'stop')

function withTimers(fn: () => void) {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    fn()
  } finally {
    mock.timers.reset()
  }
}

// ── Resyncs ───────────────────────────────────────────────────────────────

test('a network change resyncs once the reports settle, as a network change', () => withTimers(() => {
  const r = rig()
  r.net('wifi')
  r.net('none')
  r.net('cellular')
  mock.timers.tick(RESYNC_DEBOUNCE_MS - 1)
  assert.deepEqual(r.calls, [], 'still settling')
  mock.timers.tick(1)
  assert.deepEqual(r.calls, ['resync:network-change'])
}))

test('the first network report is a baseline, not a change', () => withTimers(() => {
  const r = rig()
  r.net('wifi')
  r.net('wifi')
  mock.timers.tick(RESYNC_DEBOUNCE_MS)
  assert.deepEqual(r.calls, [])
}))

test('a return to the foreground resyncs as a foreground return', () => withTimers(() => {
  const r = rig('background')
  r.app('active')
  mock.timers.tick(RESYNC_DEBOUNCE_MS)
  assert.deepEqual(r.calls, ['resync:foreground'])
}))

test('a network change outranks a foreground return in the same window, whichever came first', () => withTimers(() => {
  const first = rig('background')
  first.net('wifi')
  first.net('cellular')
  first.app('active')
  mock.timers.tick(RESYNC_DEBOUNCE_MS)
  assert.deepEqual(first.calls, ['resync:network-change'])

  const second = rig('background')
  second.net('wifi')
  second.app('active')
  second.net('cellular')
  mock.timers.tick(RESYNC_DEBOUNCE_MS)
  assert.deepEqual(second.calls, ['resync:network-change'])
}))

test('once a resync has gone out, the next window starts clean', () => withTimers(() => {
  const r = rig('background')
  r.net('wifi')
  r.net('cellular')
  mock.timers.tick(RESYNC_DEBOUNCE_MS)
  r.app('active')
  mock.timers.tick(RESYNC_DEBOUNCE_MS)
  assert.deepEqual(r.calls, ['resync:network-change', 'resync:foreground'])
}))

test('no session, no resync', () => withTimers(() => {
  const r = rig('background', false)
  r.net('wifi')
  r.net('cellular')
  r.app('active')
  mock.timers.tick(RESYNC_DEBOUNCE_MS)
  assert.deepEqual(r.calls, [])
}))

test('stopping unsubscribes and cancels a pending resync', () => withTimers(() => {
  const r = rig()
  r.net('wifi')
  r.net('cellular')
  r.stop()
  mock.timers.tick(RESYNC_DEBOUNCE_MS)
  assert.deepEqual(r.calls, [])
  assert.equal(r.watching, false)
}))

// ── The background connection ─────────────────────────────────────────────

test('leaving the foreground starts the background connection, returning stops it', () => withTimers(() => {
  const r = rig()
  r.app('background')
  r.app('active')
  assert.deepEqual(service(r.calls), ['start', 'stop'])
}))

test('no session: nothing to keep connected, so no start and no stop', () => withTimers(() => {
  const r = rig('active', false)
  r.app('background')
  r.app('active')
  assert.deepEqual(service(r.calls), [])
}))

test('a session that appears while backgrounded is not stopped on a start that never happened', () => withTimers(() => {
  const r = rig('active', false)
  r.app('background')
  r.state.session = true
  r.app('active')
  assert.deepEqual(service(r.calls), [])
}))

test('passing through inactive on the way out starts once, not twice', () => withTimers(() => {
  const r = rig()
  r.app('inactive')
  r.app('background')
  r.app('active')
  assert.deepEqual(service(r.calls), ['start', 'stop'])
}))

test('repeated events for the same state change nothing', () => withTimers(() => {
  const r = rig()
  r.app('active')
  r.app('background')
  r.app('background')
  r.app('active')
  r.app('active')
  assert.deepEqual(service(r.calls), ['start', 'stop'])
}))

test('rapid flips alternate start and stop, starting with a start', () => withTimers(() => {
  const r = rig()
  for (const next of ['background', 'active', 'inactive', 'active', 'background', 'background', 'active', 'background', 'active']) {
    r.app(next)
  }
  const seq = service(r.calls)
  assert.equal(seq[0], 'start')
  for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1], `two ${seq[i]}s in a row at ${i}: ${seq.join(',')}`)
  assert.equal(seq.at(-1), 'stop', 'back in the foreground, nothing left running')
}))

test('launched in the background: returning stops nothing it did not start', () => withTimers(() => {
  const r = rig('background')
  r.app('active')
  assert.deepEqual(service(r.calls), [])
}))
