// Rejoining after a leave, when the grant cannot land in the same run.
//
// The happy path (leave, rejoin, owner online and reachable, grant arrives seconds later) is
// covered in session.test.ts. This file covers the case that actually strands people: the invite
// code is presented once at join time and the owner is not there to redeem it, so the write grant
// has to survive a restart of the joining device to ever arrive.
import test, { after } from 'node:test'
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

/** Longer than session.test.ts's: the grant here has to wait for a 15s write-request retry tick
 * on top of discovery, since the reconnect that would have triggered one happened before the
 * owner was back. */
const SETTLE_MS = USE_PUBLIC_DHT ? 90_000 : 60_000

let testnetPromise: Promise<{ bootstrap: unknown[]; destroy(): Promise<void> } | null> | null = null

function transport(): Promise<SwarmTransport> {
  if (USE_PUBLIC_DHT) return Promise.resolve({})
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

async function waitFor(check: () => boolean, label: string, timeoutMs = SETTLE_MS): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

test('a member who rejoins while the owner is away is granted write access once the owner returns', async (t) => {
  const net = await transport()
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-rejoin-test-'))
  const identityA = makeIdentity()
  const identityB = makeIdentity()
  const identityC = makeIdentity()
  const dirA = path.join(base, 'a')
  const dirB = path.join(base, 'b')

  const open = (identity: Identity, dir: string) => Session.create(identity, dir, { transport: net })

  let sessionA = await open(identityA, dirA)
  let sessionB = await open(identityB, dirB)
  // A third member so the room stays reachable while the owner is offline — otherwise the rejoin
  // cannot even open the room and the write grant never becomes the interesting part.
  const sessionC = await open(identityC, path.join(base, 'c'))

  const live = new Set<Session>([sessionA, sessionB, sessionC])
  t.after(async () => {
    for (const session of live) await session.close()
    fs.rmSync(base, { recursive: true, force: true })
  })
  const close = async (session: Session) => {
    live.delete(session)
    await session.close()
  }

  const roomA = await sessionA.createRoom('test-room')
  const invite = sessionA.inviteLinkFor(roomA.id)
  const roomId = roomA.id

  const roomB = await sessionB.joinRoomByKey('test-room', invite)
  const roomC = await sessionC.joinRoomByKey('test-room', invite)
  await waitFor(() => roomB.writable && roomC.writable, 'B and C to be granted write access')

  await sessionB.deleteRoom(roomId)
  await waitFor(() => !roomA.listMembers().some((m) => m.identityId === identityB.id), 'A to stop listing B')

  // The owner goes offline *before* B comes back, which is what makes the invite code outlive the
  // run it was presented in.
  await close(sessionA)

  const rejoined = await sessionB.joinRoomByKey('test-room', invite)
  assert.equal(rejoined.writable, false, 'nobody can grant write access while the owner is away')

  // B quits with the room bookmarked and read-only. Everything the rejoin knew that is not on
  // disk is gone from here on.
  await close(sessionB)
  sessionB = await open(identityB, dirB)
  live.add(sessionB)
  await sessionB.reopenBookmarkedRooms()

  sessionA = await open(identityA, dirA)
  live.add(sessionA)
  await sessionA.reopenBookmarkedRooms()

  await waitFor(() => sessionB.getRoom(roomId)?.writable === true, 'B to be granted write access once the owner is back')
})
