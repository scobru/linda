// The two things step 3 needed that nothing covered: a worker that can open its own session, and
// the UI's events arriving from one. Both ends run in this process over a duplex pair, which is
// what makes them testable without a Pear runtime — the only piece left untested here is
// `pear-run` spawning the subprocess.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Duplex } from 'streamx'
import b4a from 'b4a'
import createTestnet from 'hyperdht/testnet.js'
import { RpcClient } from '../src/transport/rpc-client.js'
import {
  RemoteSessionView,
  type RemoteSessionInitialState,
  type RemoteSessionEvents,
  type WireIdentity
} from '../src/transport/remote-session-view.js'
import { WorkerDispatcher } from '../src/worker/dispatcher.js'
import { generateKeypair } from '../src/identity/keypair.js'
import { openSession } from '../src/app/open-session.js'
import type { SessionView } from '../src/app/session-view.js'

let testnetPromise: Promise<{ bootstrap: unknown[]; destroy(): Promise<void> } | null> | null = null

function bootstrap(): Promise<Array<{ host: string; port: number }>> {
  testnetPromise ??= createTestnet(4)
  return testnetPromise.then((net) => (net as unknown as { bootstrap: Array<{ host: string; port: number }> }).bootstrap)
}

after(async () => {
  const net = await testnetPromise
  if (net) await net.destroy()
})

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'linda-worker-boot-'))
}

function wireIdentity(): WireIdentity {
  const kp = generateKeypair()
  return {
    id: b4a.toString(kp.publicKey, 'hex'),
    publicKey: b4a.toString(kp.publicKey, 'hex'),
    secretKey: b4a.toString(kp.secretKey, 'hex')
  }
}

function createDuplexPair(): [Duplex, Duplex] {
  let a!: Duplex
  let b!: Duplex
  a = new Duplex({
    write(chunk, cb) { b.push(chunk); cb(null) },
    final(cb) { b.push(null); cb(null) }
  })
  b = new Duplex({
    write(chunk, cb) { a.push(chunk); cb(null) },
    final(cb) { a.push(null); cb(null) }
  })
  return [a, b]
}

/** A dispatcher started the way `src/worker/entry.ts` starts it: with no session at all. */
function bootWorker(): { client: RpcClient; dispatcher: WorkerDispatcher } {
  const [workerEnd, clientEnd] = createDuplexPair()
  return { client: new RpcClient(clientEnd), dispatcher: new WorkerDispatcher(workerEnd) }
}

test('a worker with no session refuses work until it is opened', async () => {
  const { client } = bootWorker()
  await assert.rejects(client.call('session.getState'), /not initialized/)
})

test('session.open boots a session inside the worker and returns state to answer reads from', async () => {
  const { client } = bootWorker()
  const identity = wireIdentity()
  const dir = tmpDir()

  const state = await client.call<RemoteSessionInitialState>('session.open', identity, dir, { bootstrap: await bootstrap() })

  // The reply is what the proxy's synchronous getters serve until the first pushed event, so it
  // has to arrive populated rather than empty.
  assert.ok(Array.isArray(state.bookmarks), 'bookmarks should come back as a list')
  assert.ok(Array.isArray(state.contacts), 'contacts should come back as a list')
  assert.ok(state.networkStatus, 'network status should come back')
  assert.equal(typeof state.networkStatus!.publicKey, 'string')

  const remote: SessionView = new RemoteSessionView(client, state)
  assert.deepEqual(remote.listBookmarks(), state.bookmarks)

  await client.call('session.close')
})

// The renderer re-sends `session.open` on reconnect. A second real open would leave the first
// session holding the storage lock, with nothing able to release it.
test('opening twice is idempotent rather than a second session on the same storage', async () => {
  const { client } = bootWorker()
  const identity = wireIdentity()
  const dir = tmpDir()

  const first = await client.call<RemoteSessionInitialState>('session.open', identity, dir, { bootstrap: await bootstrap() })
  const second = await client.call<RemoteSessionInitialState>('session.open', identity, dir, { bootstrap: await bootstrap() })

  assert.equal(second.networkStatus!.publicKey, first.networkStatus!.publicKey)
  await client.call('session.close')
})

test('the identity survives the crossing as the one the session actually runs on', async () => {
  const { client } = bootWorker()
  const identity = wireIdentity()

  const state = await client.call<RemoteSessionInitialState>('session.open', identity, tmpDir(), { bootstrap: await bootstrap() })

  // publicKey on the wire is hex; the worker rebuilds a Buffer from it. If that rebuild were
  // wrong — the `{type:'Buffer',data:[]}` shape, say — the swarm would come up under a different
  // key and this is where it would show.
  assert.equal(state.networkStatus!.publicKey, identity.id)
  await client.call('session.close')
})

test("the UI's own events arrive from the worker, not just the mirror updates", async () => {
  const { client, dispatcher } = bootWorker()
  await client.call('session.open', wireIdentity(), tmpDir(), { bootstrap: await bootstrap() })

  const seen: string[] = []
  const events: RemoteSessionEvents = {
    onTyping: () => seen.push('typing'),
    onReadReceipt: () => seen.push('readReceipt'),
    onPeerConnected: () => seen.push('peerConnected'),
    onPeerDisconnected: () => seen.push('peerDisconnected'),
    onPresence: () => seen.push('presence'),
    onBookmarksChange: () => seen.push('bookmarksChange')
  }
  const remote = new RemoteSessionView(client, undefined, events)
  assert.ok(remote)

  // Pushed the way the session's own callbacks push them, since driving two real peers into
  // typing and read receipts would test Hyperswarm, not this seam.
  dispatcher.pushEvent('typing', { roomId: 'r', userId: 'u', typing: true })
  dispatcher.pushEvent('readReceipt', { roomId: 'r', userId: 'u' })
  dispatcher.pushEvent('peerConnected', {})
  dispatcher.pushEvent('peerDisconnected', {})
  dispatcher.pushEvent('presence', { userId: 'u', online: true })
  dispatcher.pushEvent('bookmarksChange', [])
  await new Promise((resolve) => setTimeout(resolve, 50))

  // Before this change the first four had no push at all on the worker side and nowhere to land
  // on the proxy side: the UI simply never learned about them.
  assert.deepEqual(seen.sort(), [
    'bookmarksChange', 'peerConnected', 'peerDisconnected', 'presence', 'readReceipt', 'typing'
  ])
  await client.call('session.close')
})

test('a peer event carries fresh network status, since its real payload cannot cross', async () => {
  const { client, dispatcher } = bootWorker()
  await client.call('session.open', wireIdentity(), tmpDir(), { bootstrap: await bootstrap() })

  const remote = new RemoteSessionView(client, { networkStatus: { connections: 0, host: null, port: 0, firewalled: false, publicKey: '', lanDiscovery: false } })
  dispatcher.pushEvent('peerConnected', {
    networkStatus: { connections: 3, host: '1.2.3.4', port: 42, firewalled: false, publicKey: 'k', lanDiscovery: false }
  })
  await new Promise((resolve) => setTimeout(resolve, 50))

  assert.equal(remote.getNetworkStatus().connections, 3)
  await client.call('session.close')
})

// The launcher the Electron build gets. The headless smoke run stops at the login screen, so
// nothing else exercises it — and it is the path every existing user is on.
test('the in-process launcher opens on the testnet it was given, not the public DHT', async () => {
  const kp = generateKeypair()
  const session = await openSession(
    { ...kp, id: b4a.toString(kp.publicKey, 'hex') },
    tmpDir(),
    { bootstrap: await bootstrap() }
  )
  try {
    assert.equal(session.getNetworkStatus().publicKey, b4a.toString(kp.publicKey, 'hex'))
    assert.deepEqual(session.listBookmarks(), [])
  } finally {
    await session.close()
  }
})
