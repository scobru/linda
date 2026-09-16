import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Duplex } from 'streamx'
import { packFrame, unpackFrame } from '../src/transport/frame.js'
import { RpcClient } from '../src/transport/rpc-client.js'
import { WorkerDispatcher } from '../src/worker/dispatcher.js'
import { codeOf } from './source-scan.js'

// ---------------------------------------------------------------------------
// Both dispatchers unpacked the incoming frame *above* their try block, and both are invoked as
// `void handleRequest(req)`. So a frame whose header did not parse threw out of a discarded promise
// — an unhandled rejection, which by default takes the worker process with it.
//
// The two runtimes then failed differently, and mobile came off worse. When the desktop's worker
// dies its pipe closes, and `bare-rpc` rejects everything in flight with "Channel closed"; when the
// worklet dies there is no pipe, so a call already waiting for a reply never hears anything. Only
// the four login methods in `mobile/src/bare/client.ts` carry a deadline — deliberately, since a
// join waits on the DHT and a download waits on a peer — so every other call waited forever.
// ---------------------------------------------------------------------------

function duplexPair(): [Duplex, Duplex] {
  let a: Duplex
  let b: Duplex
  a = new Duplex({
    write(data, cb) { b.push(data); cb(null) },
    final(cb) { b.push(null); cb(null) }
  })
  b = new Duplex({
    write(data, cb) { a.push(data); cb(null) },
    final(cb) { a.push(null); cb(null) }
  })
  // Protomux caches its mux on the stream only when userData is null; without this a second
  // protocol builds a second mux and both ends die on "Invalid open message".
  ;(a as unknown as { userData: unknown }).userData = null
  ;(b as unknown as { userData: unknown }).userData = null
  return [a, b]
}

/** A frame whose length prefix is honest and whose header is not JSON. */
function malformedFrame(): Uint8Array {
  const body = Buffer.from('{{{', 'utf8')
  const frame = new Uint8Array(4 + body.byteLength)
  new DataView(frame.buffer, frame.byteOffset, 4).setUint32(0, body.byteLength, true)
  frame.set(body, 4)
  return frame
}

test('a frame that does not parse is answered, not thrown', async () => {
  const [workerSide, clientSide] = duplexPair()
  const dispatcher = new WorkerDispatcher(workerSide)
  const client = new RpcClient(clientSide)

  const request = (client as unknown as { rpc: { request(n: number): any } }).rpc.request(0)
  request.send(malformedFrame())

  const settled = await Promise.race([
    request.reply().then((buf: Uint8Array) => unpackFrame(buf).header),
    new Promise((resolve) => setTimeout(() => resolve('never settled'), 3000))
  ])

  assert.notEqual(settled, 'never settled', 'the request was never answered')
  assert.equal((settled as { ok: boolean }).ok, false)
  assert.ok((settled as { error: string }).error, 'the reply should say what went wrong')

  // And the channel is still usable: one bad frame does not end the session.
  const after = (client as unknown as { rpc: { request(n: number): any } }).rpc.request(0)
  after.send(packFrame({ method: 'definitely.not.a.method', args: [] }))
  const second = unpackFrame(await after.reply()) as { header: { ok: boolean; error: string } }
  assert.equal(second.header.ok, false)
  assert.match(second.header.error, /definitely\.not\.a\.method/)

  void dispatcher
  workerSide.destroy()
  clientSide.destroy()
})

test('neither dispatcher unpacks a frame outside the guard that answers it', () => {
  // The seam this covers is a line's position, which no assertion over behaviour can reach on the
  // worklet side: it needs Bare Kit's IPC and cannot be constructed here. So both are checked the
  // same way — the unpack must come after the `try {`, in each file.
  for (const file of ['src/worker/dispatcher.ts', 'mobile/worklet/entry.ts']) {
    const code = codeOf(file)
    const handler = code.slice(code.indexOf('handleRequest(req: any): Promise<void> {'))
    const body = handler.slice(0, handler.indexOf('catch'))

    const tryAt = body.indexOf('try {')
    const unpackAt = body.indexOf('unpackFrame(req.data)')

    assert.ok(tryAt !== -1, `${file}: no try block found in handleRequest`)
    assert.ok(unpackAt !== -1, `${file}: no unpackFrame found in handleRequest`)
    assert.ok(unpackAt > tryAt, `${file}: unpackFrame runs before the try that would answer the caller`)
  }
})
