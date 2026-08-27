// Two real Sessions, talking to each other.
//
// Everything below the seam is production code: the real Hyperswarm, the real RPC channel, real
// Corestore replication, real peer discovery. The only thing swapped is *which* DHT they bootstrap
// from — an in-process testnet instead of the public network — because the flow worth covering is
// the one where a join produces a write grant over RPC, and faking the swarm would remove exactly
// the discovery timing that flow depends on.
//
// Set LINDA_TEST_DHT=public to run the same assertions against the real network instead.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import b4a from 'b4a'
import createTestnet from 'hyperdht/testnet.js'
import { generateKeypair } from '../src/identity/keypair.js'
import { Session } from '../src/app/session.js'
import type { Identity } from '../src/identity/index.js'
import type { SwarmTransport } from '../src/network/swarm.js'

const USE_PUBLIC_DHT = process.env.LINDA_TEST_DHT === 'public'

/** Generous: a real grant crosses a DHT lookup, a hole-punch and an RPC round trip. */
const SETTLE_MS = USE_PUBLIC_DHT ? 60_000 : 30_000

function makeIdentity(): Identity {
  const kp = generateKeypair()
  return { ...kp, id: b4a.toString(kp.publicKey, 'hex') }
}

/**
 * Polls a predicate rather than sleeping a fixed span. A fixed sleep in a peer-to-peer test is an
 * intermittent failure waiting to happen, and the label is what makes a timeout say which step
 * never arrived instead of just "timed out".
 */
async function waitFor(check: () => boolean, label: string, timeoutMs = SETTLE_MS): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

test('a peer joining by invite is granted write access and replicates messages', async (t) => {
  // One testnet for the file: spinning up DHT nodes is the expensive part, and two tests sharing a
  // DHT do not contaminate each other the way two tests sharing an identity would.
  const testnet = USE_PUBLIC_DHT ? null : await createTestnet(4)
  const transport: SwarmTransport = testnet ? { bootstrap: testnet.bootstrap } : {}

  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-session-test-'))
  const identityA = makeIdentity()
  const identityB = makeIdentity()

  const sessionA = await Session.create(identityA, path.join(base, 'a'), { transport })
  const sessionB = await Session.create(identityB, path.join(base, 'b'), { transport })

  t.after(async () => {
    await sessionA.close()
    await sessionB.close()
    if (testnet) await testnet.destroy()
    fs.rmSync(base, { recursive: true, force: true })
  })

  const roomA = await sessionA.createRoom('test-room')
  const invite = sessionA.inviteLinkFor(roomA.id)

  const roomB = await sessionB.joinRoomByKey('test-room', invite)

  await waitFor(() => sessionA.peers.size > 0 && sessionB.peers.size > 0, 'the two sessions to find each other')

  // The part with no coverage until now: write access and the room's content key both arrive over
  // the RPC grant the invite code triggers. No manual addWriter — if the grant path breaks, this
  // is where it shows.
  await waitFor(() => roomB.writable, 'B to be granted write access')
  await waitFor(() => roomB.hasKey, 'B to receive the room key')

  await roomB.send(identityB.id, 'hello from B')
  await waitFor(() => roomA.messageCount > 0, "B's message to replicate to A")

  const received = await roomA.getMessage(0)
  assert.equal(received.body, 'hello from B')
  assert.equal(received.authorId, identityB.id)

  assert.deepEqual(
    roomA.listMembers().map((m) => m.identityId).sort(),
    [identityA.id, identityB.id].sort(),
    'both identities are members once the grant has applied'
  )
})
