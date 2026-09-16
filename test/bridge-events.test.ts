import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { codeOf, sourceFiles } from './source-scan.js'

// ---------------------------------------------------------------------------
// Both shells' halves talk through named events: a backend calls `pushEvent('x', …)` and a front end
// calls `.on('x', …)`. Nothing connects the two names — not the compiler, not a type — so a listener
// whose producer was never written is silent. Not broken, not logged, just never called.
//
// That is what happened to `callEnded` and `callRemoteControl` on mobile: `useSession` had listened
// for both since calls landed, and `entry.ts` passed neither to `Session`. The end-of-call haptic
// never fired, and a peer's mute only reached the phone if the state change that followed it
// happened to carry the flag.
//
// Mobile got a guard for that. The desktop, which has exactly the same seam between
// `WorkerDispatcher` and `RemoteSessionView`, did not — and had two such listeners of its own. So
// the guard covers both runtimes now, because a check that protects one half of a pair of shells is
// how the pair drifts.
// ---------------------------------------------------------------------------

function names(source: string, pattern: RegExp): Set<string> {
  const found = new Set<string>()
  for (const match of source.matchAll(pattern)) found.add(match[1]!)
  return found
}

/** Events a backend actually sends, read from its `pushEvent` calls. */
function pushedBy(files: string[]): Set<string> {
  const all = new Set<string>()
  for (const file of files) {
    for (const name of names(codeOf(file), /pushEvent\(\s*'([a-zA-Z]+)'/g)) all.add(name)
  }
  return all
}

test('every event the mobile app listens for is one the worklet actually sends', () => {
  const pushed = pushedBy(sourceFiles(['mobile/worklet']))

  const listened = new Set<string>()
  for (const file of sourceFiles(['mobile/src'])) {
    for (const name of names(codeOf(file), /bareClient\.on\(\s*'([a-zA-Z]+)'/g)) listened.add(name)
  }

  assert.ok(pushed.size > 0, 'found no pushEvent calls — the scan is looking in the wrong place')
  assert.ok(listened.size > 0, 'found no bareClient.on calls — the scan is looking in the wrong place')

  const silent = [...listened].filter((name) => !pushed.has(name)).sort()
  assert.deepEqual(silent, [], 'the mobile app listens for these events and nothing sends them')
})

test('every event the desktop proxy listens for is one the worker actually sends', () => {
  // The same seam, one runtime over: `src/worker/dispatcher.ts` pushes and the two remote views
  // listen. This found `sessionState` and `networkStatus`, both of which nothing had ever sent.
  const pushed = pushedBy(['src/worker/dispatcher.ts'])

  const listened = new Set<string>()
  for (const file of ['src/transport/remote-session-view.ts', 'src/transport/remote-room-view.ts']) {
    for (const name of names(codeOf(file), /rpcClient\.on\(\s*'([a-zA-Z]+)'/g)) listened.add(name)
    for (const name of names(codeOf(file), /client\.on\(\s*'([a-zA-Z]+)'/g)) listened.add(name)
  }

  assert.ok(pushed.size > 0, 'found no pushEvent calls — the scan is looking in the wrong place')
  assert.ok(listened.size > 0, 'found no .on calls — the scan is looking in the wrong place')

  const silent = [...listened].filter((name) => !pushed.has(name)).sort()
  assert.deepEqual(silent, [], 'the desktop proxy listens for these events and nothing sends them')
})

test('every field the desktop proxy caches is kept current by something', () => {
  // This is the invariant that made deleting `sessionState` safe rather than hopeful. That listener
  // was the only thing that could have re-applied the whole initial state, so removing it is only
  // sound if every field has another keeper: a setter that writes through before its RPC, a value
  // taken from an RPC result, or an event that is genuinely sent.
  //
  // The check is deliberately blunt — it asks whether anything outside `applyInitialState` assigns
  // the field. It cannot prove the assignment happens at the right moment, and nothing here can.
  // It does catch a field that nothing touches again after construction, which is the failure that
  // would make a stale value survive until restart.
  const source = codeOf('src/transport/remote-session-view.ts')

  const shape = source.slice(source.indexOf('interface RemoteSessionInitialState'))
  const fields = [...shape.slice(0, shape.indexOf('}')).matchAll(/^\s*([a-zA-Z]+)\??:/gm)].map((m) => m[1]!)
  assert.ok(fields.length >= 10, `expected the cached state to have its fields, found ${fields.length}`)

  // Everything except the one function whose whole job is to apply the initial state.
  const applyAt = source.indexOf('private applyInitialState')
  const applyEnd = source.indexOf('\n  }', applyAt)
  const elsewhere = source.slice(0, applyAt) + source.slice(applyEnd)

  const orphans = fields.filter((field) => {
    const assigned = new RegExp(`(this|self)\\.${field}\\s*=|this\\.${field}\\.set\\(`)
    return !assigned.test(elsewhere)
  })
  assert.deepEqual(orphans, [], 'these cached fields are set once and never updated again')
})
