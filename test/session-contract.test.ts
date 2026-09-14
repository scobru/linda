import test from 'node:test'
import assert from 'node:assert/strict'
import { FORWARDED, FORWARDED_METHODS } from '../src/app/session-contract.js'
import { Session } from '../src/app/session.js'
import { RemoteSessionView } from '../src/transport/remote-session-view.js'
import { WorkerDispatcher } from '../src/worker/dispatcher.js'
import { Duplex } from 'streamx'

// ---------------------------------------------------------------------------
// The contract enumerated.
//
// `mirror-parity.test.ts` walks ten sections chosen by hand, which is why three drifts lived in
// this seam at once: a member nobody wrote a section for is a member nobody checks. These tests
// iterate the contract itself, so a new entry is covered the moment it is declared — and an entry
// that exists on neither side fails here rather than on a user's machine.
// ---------------------------------------------------------------------------

test('every forwarded method exists on Session and on the remote proxy', () => {
  assert.ok(FORWARDED_METHODS.length > 0, 'the contract is not empty')

  const missingFromSession: string[] = []
  const missingFromProxy: string[] = []

  for (const name of FORWARDED_METHODS) {
    if (typeof (Session.prototype as Record<string, unknown>)[name] !== 'function') {
      missingFromSession.push(name)
    }
    if (typeof (RemoteSessionView.prototype as Record<string, unknown>)[name] !== 'function') {
      missingFromProxy.push(name)
    }
  }

  assert.deepEqual(missingFromSession, [], 'contract names a method Session does not have')
  assert.deepEqual(missingFromProxy, [], 'contract names a method the proxy does not implement')
})

test('the proxy never declares fewer parameters than Session', () => {
  // This is the `banMember` defect as a rule. The proxy declared `(roomId, identityId)` against
  // `Session.banMember(roomId, writerKeyHex, identityId)`; TypeScript accepts that, because a
  // function taking fewer arguments is assignable to a type with more, so the worker silently
  // received the identity id in the writer-key slot.
  //
  // Declaring *more* parameters than Session is the harmless direction, and a default value lowers
  // `Function.length` without dropping the argument — `broadcastPresence(online = true)` reports 0.
  // So the rule is one-sided, and the exceptions are named rather than waved through.
  const defaultedParams: Record<string, number> = {
    // name: how many trailing parameters carry a default on the proxy
    broadcastPresence: 1
  }

  const short: string[] = []
  for (const name of FORWARDED_METHODS) {
    const onSession = (Session.prototype as Record<string, (...a: never[]) => unknown>)[name]
    const onProxy = (RemoteSessionView.prototype as Record<string, (...a: never[]) => unknown>)[name]
    if (typeof onSession !== 'function' || typeof onProxy !== 'function') continue

    const allowed = defaultedParams[name] ?? 0
    if (onProxy.length + allowed < onSession.length) {
      short.push(`${name}: proxy takes ${onProxy.length}, Session takes ${onSession.length}`)
    }
  }

  assert.deepEqual(short, [], 'a proxy method would drop arguments on the way to the worker')
})

test('the dispatcher serves every forwarded method, and only through the contract', () => {
  // The dispatcher's table is built from the contract, so this asserts the wiring actually ran —
  // and that nothing in the contract is missing a handler, which is how `resumeNetwork` went
  // unreachable on the worker path while being forwarded on mobile.
  const sink = new Duplex({ write(_data, cb) { cb(null) } })
  const table = (new WorkerDispatcher(sink) as unknown as {
    handlers: Record<string, unknown>
  }).handlers

  const missing = FORWARDED_METHODS.filter((name) => typeof table[`session.${name}`] !== 'function')
  assert.deepEqual(missing, [], 'the dispatcher has no handler for these contract members')
})

test('every effect is one the dispatcher knows how to apply', () => {
  const known = new Set(['none', 'roomState', 'bookmarks', 'roomState+bookmarks'])
  const unknown = FORWARDED_METHODS
    .filter((name) => !known.has(FORWARDED[name]))
    .map((name) => `${name}: ${FORWARDED[name]}`)

  assert.deepEqual(unknown, [], 'an effect was declared that applyEffect does not handle')
})

test('methods with a room effect take the room id first', () => {
  // The invariant `applyEffect` leans on to find the room whose state it must republish. Stated as
  // a test because it is an assumption about every current and future member, not about one.
  const roomScoped = FORWARDED_METHODS.filter((name) => FORWARDED[name].includes('roomState'))
  assert.ok(roomScoped.length > 0)

  const wrong: string[] = []
  for (const name of roomScoped) {
    const source = (Session.prototype as Record<string, (...a: never[]) => unknown>)[name]?.toString() ?? ''
    const params = source.slice(source.indexOf('(') + 1, source.indexOf(')'))
    const first = params.split(',')[0]?.trim() ?? ''
    if (!/^roomId\b/.test(first)) wrong.push(`${name}(${first}…)`)
  }

  assert.deepEqual(wrong, [], 'a room-scoped method does not take roomId first')
})
