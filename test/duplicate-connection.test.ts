import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Duplex } from 'streamx'
import b4a from 'b4a'
// @ts-ignore
import createTestnet from 'hyperdht/testnet.js'
import { Session } from '../src/app/session.js'
import { handleConnection, type SwarmTransport, type SwarmHandlers } from '../src/network/swarm.js'
import { generateKeypair } from '../src/identity/keypair.js'
import type { Identity } from '../src/identity/index.js'

// ---------------------------------------------------------------------------
// Two connections to one peer, and what it costs to mistake one for the other.
//
// Hyperswarm and a LAN mDNS lookup can both find the same peer, and both land in `onConnection`.
// `Session` keeps whichever arrived first and destroys the redundant socket — which is right, and
// which fires `onDisconnection` under that peer's own public key. Nothing in that handler could
// tell the destroyed duplicate from the peer actually leaving, so it deleted the live peer from
// the map and told `CallDesk` the peer was gone.
//
// On a phone that was a call dropping to "Connection lost" the moment a second connection
// happened to arrive, and a peer that could not be dialled afterwards because the session no
// longer believed it was connected.
// ---------------------------------------------------------------------------

let testnetPromise: Promise<{ bootstrap: unknown[]; destroy(): Promise<void> } | null> | null = null

function transport(): Promise<{ bootstrap: unknown[] }> {
  testnetPromise ??= createTestnet(4)
  return testnetPromise.then((net) => ({ bootstrap: (net as { bootstrap: never }).bootstrap }))
}

after(async () => {
  const net = await testnetPromise
  if (net) await net.destroy()
})

function makeIdentity(): Identity {
  const kp = generateKeypair()
  return { ...kp, id: b4a.toString(kp.publicKey, 'hex') }
}

/** A stand-in for an already-authenticated connection: `handleConnection` only attaches protomux. */
function duplexPair(): [Duplex, Duplex] {
  let a: Duplex
  let b: Duplex
  a = new Duplex({
    write(data: any, cb: (err?: Error | null) => void) { b.push(data); cb() },
    final(cb: (err?: Error | null) => void) { b.push(null); cb(null) }
  })
  b = new Duplex({
    write(data: any, cb: (err?: Error | null) => void) { a.push(data); cb() },
    final(cb: (err?: Error | null) => void) { a.push(null); cb(null) }
  })
  // See `protocol-channel.test.ts`: `Protomux.from` only caches its mux when `userData` is already
  // null, which is what a real secret-stream connection gives it.
  ;(a as unknown as { userData: unknown }).userData = null
  ;(b as unknown as { userData: unknown }).userData = null
  // `Session` replicates its corestore over every connection, and Hypercore reaches through the
  // stream for `noiseStream` and `opened` to do it. A real `@hyperswarm/secret-stream` is its own
  // noise stream and resolves `opened` after the handshake; without both, replication refuses the
  // socket and the session never reaches the behaviour under test.
  // Replication also waits on the handshake before it makes a peer. A real one resolves once the
  // Noise exchange completes; these are already "connected" the moment they exist.
  for (const stream of [a, b]) {
    ;(stream as unknown as { noiseStream: unknown }).noiseStream = stream
    ;(stream as unknown as { opened: Promise<boolean> }).opened = Promise.resolve(true)
  }
  return [a, b]
}

async function waitFor(check: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

test('a closing socket names itself, so a duplicate can be told from the peer leaving', async () => {
  // The enabling fact, at the layer that owns it. Without the socket, both closes look identical.
  const closed: Duplex[] = []
  const handlers: SwarmHandlers = {
    onDisconnection: (_key, socket) => { closed.push(socket) }
  }

  const key = b4a.alloc(32, 1) as unknown as Buffer
  const [first] = duplexPair()
  const [second] = duplexPair()

  handleConnection(first, key, handlers)
  handleConnection(second, key, handlers)

  second.destroy()
  await waitFor(() => closed.length > 0, 'the destroyed socket to report itself')

  assert.equal(closed.length, 1)
  assert.equal(closed[0], second, 'the socket that closed is the one handed back')
  assert.notEqual(closed[0], first, 'and it is distinguishable from the one still open')
})

test('destroying a redundant second connection does not forget the peer it duplicates', async (t) => {
  const net = await transport()
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-dupe-test-'))

  // The LAN seam hands `handleConnection` sockets directly, which is how this test injects two
  // connections for one peer without racing two real sessions into the same discovery.
  let inject: ((socket: Duplex, remotePublicKey: Buffer) => void) | null = null
  const lanTransport: SwarmTransport = {
    bootstrap: net.bootstrap as never,
    createLanDiscovery: (onSocket) => {
      inject = onSocket
      return { join: () => {}, leave: () => {}, destroy: async () => {} }
    }
  }

  const session = await Session.create(makeIdentity(), path.join(base, 'a'), { transport: lanTransport })
  t.after(async () => {
    await session.close()
    fs.rmSync(base, { recursive: true, force: true })
  })

  assert.ok(inject, 'the LAN seam should have been wired')
  const remote = makeIdentity()
  const remoteKey = remote.publicKey as unknown as Buffer
  const remoteId = remote.id

  const [firstSocket] = duplexPair()
  inject!(firstSocket, remoteKey)
  assert.equal(session.peers.size, 1, 'the first connection is the one kept')
  assert.equal(session.peers.get(remoteId)?.socket, firstSocket)

  // The same peer found a second way. `onConnection` destroys this one on purpose.
  const [secondSocket] = duplexPair()
  inject!(secondSocket, remoteKey)
  await waitFor(() => secondSocket.destroyed, 'the redundant socket to be destroyed')

  // Give the close event every chance to be mishandled before asserting it was not.
  await new Promise((resolve) => setTimeout(resolve, 100))

  assert.equal(
    session.peers.size,
    1,
    'the peer survives its own duplicate — this is what dropped calls to "Connection lost"'
  )
  assert.equal(session.peers.get(remoteId)?.socket, firstSocket, 'and it is still the first socket')
  assert.equal(firstSocket.destroyed, false, 'which was never touched')
})

test('the peer is still forgotten when the socket actually held for it closes', async (t) => {
  // The guard must not overshoot: a real disconnect still has to be a disconnect.
  const net = await transport()
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-dupe-test-'))

  let inject: ((socket: Duplex, remotePublicKey: Buffer) => void) | null = null
  const session = await Session.create(makeIdentity(), path.join(base, 'b'), {
    transport: {
      bootstrap: net.bootstrap as never,
      createLanDiscovery: (onSocket) => {
        inject = onSocket
        return { join: () => {}, leave: () => {}, destroy: async () => {} }
      }
    }
  })
  t.after(async () => {
    await session.close()
    fs.rmSync(base, { recursive: true, force: true })
  })

  const remote = makeIdentity()
  const [socket] = duplexPair()
  inject!(socket, remote.publicKey as unknown as Buffer)
  assert.equal(session.peers.size, 1)

  socket.destroy()
  await waitFor(() => session.peers.size === 0, 'the peer to be dropped when its own socket closes')
})

test('a connection that died of something says what, instead of only that it closed', async () => {
  // `swarm.ts` handled 'error' with an empty function. That is what a socket says on its way out,
  // and it was the only account of why a call would drop to "Connection lost": with it discarded,
  // the phone could report that the connection went away and nothing whatever about the cause.
  const seen: Array<{ socket: Duplex; error: Error | null }> = []
  const handlers: SwarmHandlers = {
    onDisconnection: (_key, socket, error) => { seen.push({ socket, error }) }
  }

  const key = b4a.alloc(32, 2) as unknown as Buffer
  const [failing] = duplexPair()
  const [orderly] = duplexPair()
  handleConnection(failing, key, handlers)
  handleConnection(orderly, key, handlers)

  failing.destroy(new Error('stream destroyed by remote'))
  orderly.destroy()
  await waitFor(() => seen.length === 2, 'both sockets to report themselves')

  const failed = seen.find((s) => s.socket === failing)!
  assert.equal(failed.error?.message, 'stream destroyed by remote')

  const closed = seen.find((s) => s.socket === orderly)!
  assert.equal(closed.error, null, 'an ordinary close invents no cause')
})
