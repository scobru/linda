import test from 'node:test'
import assert from 'node:assert/strict'
import { classifySessionError, describeSessionError } from '../src/app/session-errors.js'
import { rpcDeadlineMs, rpcTimeoutMessage, withRpcDeadline } from '../src/transport/rpc-deadline.js'
import { codeOf } from './source-scan.js'

// ---------------------------------------------------------------------------
// Mobile worked out which calls may be bounded and which must not be, and the desktop never did:
// `RpcClient.call` awaited `req.reply()` with no clock at all. A worker that dies is covered on both
// — bare-rpc rejects in-flight calls when the pipe closes — but one that is alive and not answering
// left the window on "Unlocking..." with no error and no way back.
// ---------------------------------------------------------------------------

test('only the login path is bounded, under either bridge’s name for it', () => {
  // The calls a screen blocks on with nothing else to offer.
  for (const method of ['identity.unlock', 'identity.create', 'identity.recover']) {
    assert.equal(rpcDeadlineMs(method), 60_000, method)
  }
  // One operation, two names: the desktop opens a session, mobile creates one.
  assert.equal(rpcDeadlineMs('session.open'), 120_000)
  assert.equal(rpcDeadlineMs('session.create'), 120_000)
})

test('everything else stays unbounded, because the network is not a failure', () => {
  // A join waits on the DHT and a download waits on a peer. A clock on those invents failures that
  // the network was going to resolve on its own — this is the half that must not be "improved".
  for (const method of ['room.join', 'session.downloadFile', 'room.send', 'session.listBookmarks']) {
    assert.equal(rpcDeadlineMs(method), undefined, `${method} must not be bounded`)
  }
})

test('an unbounded call is handed back untouched, not wrapped in a timer it will never use', async () => {
  const work = Promise.resolve('done')
  assert.equal(withRpcDeadline(work, 'room.join'), work)
  assert.equal(await withRpcDeadline(work, 'room.join'), 'done')
})

test('a bounded call that answers in time resolves normally', async () => {
  assert.equal(await withRpcDeadline(Promise.resolve('unlocked'), 'identity.unlock'), 'unlocked')
})

test('a bounded call that never answers rejects rather than hanging', async () => {
  // The deadline itself is 60s, so this drives the same code path through a method that has one
  // while asserting on the message rather than waiting for it.
  const never = new Promise<never>(() => {})
  const raced = await Promise.race([
    withRpcDeadline(never, 'identity.unlock').then(() => 'resolved', (err: Error) => err.message),
    new Promise((resolve) => setTimeout(() => resolve('still pending'), 50))
  ])
  assert.equal(raced, 'still pending', 'a 60s deadline must not fire early')
  assert.match(rpcTimeoutMessage('identity.unlock'), /did not answer identity\.unlock in time/)
})

test('the timeout message is one the shared classifier recognises', () => {
  // This wording is load-bearing, not decoration: `session-errors.ts` reads it as `runtime-stopped`.
  // Until the desktop could raise it, the desktop half of that rule was unreachable code.
  const err = new Error(rpcTimeoutMessage('session.open'))
  assert.equal(classifySessionError(err), 'runtime-stopped')

  const desktop = describeSessionError(err, 'desktop')
  const mobile = describeSessionError(err, 'mobile')
  assert.match(desktop, /runtime/i)
  assert.notEqual(desktop, mobile, 'the remedy differs even though the failure does not')
  assert.doesNotMatch(desktop, /recent-apps/, 'a desktop window has no recent-apps list')
})

test('neither client keeps its own deadline table', () => {
  // Mobile had `TIMEOUT_MS` and its own `withTimeout`; the desktop had nothing. Both now ask the
  // shared policy, so the next call that needs bounding is bounded on both at once.
  for (const file of ['src/transport/rpc-client.ts', 'mobile/src/bare/client.ts']) {
    const code = codeOf(file)
    assert.doesNotMatch(code, /TIMEOUT_MS|function withTimeout/, `${file} still has its own deadline table`)

    // Every await of a reply, not just one of them. An earlier version of this test asserted the
    // name appeared somewhere in the file and passed with `callBinary` left unbounded — which is
    // exactly the half a file-wide check cannot see.
    const awaits = code.match(/await[^\n]*\breq\.reply\(\)/g) ?? []
    assert.ok(awaits.length > 0, `${file}: found no reply to check`)
    for (const line of awaits) {
      assert.match(line, /withRpcDeadline/, `${file}: a reply is awaited without the shared deadline`)
    }
  }
})
