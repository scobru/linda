// Two real Sessions, talking to each other.
//
// Everything below the seam is production code: the real Hyperswarm, the real RPC channel, real
// Corestore replication, real peer discovery. The only thing swapped is *which* DHT they bootstrap
// from — an in-process testnet instead of the public network — because the flows worth covering are
// the ones where a join produces a write grant over RPC, and faking the swarm would remove exactly
// the discovery timing those flows depend on.
//
// Set LINDA_TEST_DHT=public to run the same assertions against the real network instead.
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

/** Generous: a real grant crosses a DHT lookup, a hole-punch and an RPC round trip. */
const SETTLE_MS = USE_PUBLIC_DHT ? 60_000 : 30_000

/** One testnet for the whole file. Spinning up DHT nodes is the expensive part, and two tests
 * sharing a DHT do not contaminate each other the way two sharing an identity would. */
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

interface Pair {
  sessionA: Session
  sessionB: Session
  identityA: Identity
  identityB: Identity
}

/** A room owned by A that B has joined and can post to — the starting point for every case here. */
async function joinedPair(t: { after(fn: () => Promise<void>): void }): Promise<Pair & {
  roomId: string
  invite: string
}> {
  const net = await transport()
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-session-test-'))
  const identityA = makeIdentity()
  const identityB = makeIdentity()

  const sessionA = await Session.create(identityA, path.join(base, 'a'), { transport: net })
  const sessionB = await Session.create(identityB, path.join(base, 'b'), { transport: net })

  t.after(async () => {
    await sessionA.close()
    await sessionB.close()
    fs.rmSync(base, { recursive: true, force: true })
  })

  const roomA = await sessionA.createRoom('test-room')
  const invite = sessionA.inviteLinkFor(roomA.id)
  const roomB = await sessionB.joinRoomByKey('test-room', invite)

  await waitFor(() => sessionA.peers.size > 0 && sessionB.peers.size > 0, 'the two sessions to find each other')
  await waitFor(() => roomB.writable && roomB.hasKey, 'B to be granted write access and the room key')

  return { sessionA, sessionB, identityA, identityB, roomId: roomA.id, invite }
}

test('a peer joining by invite is granted write access and replicates messages', async (t) => {
  const { sessionA, sessionB, identityA, identityB, roomId } = await joinedPair(t)
  const roomA = sessionA.getRoom(roomId)!
  const roomB = sessionB.getRoom(roomId)!

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

test('leaving removes the room from this device and tells the room', async (t) => {
  const { sessionA, sessionB, identityB, roomId } = await joinedPair(t)
  const roomA = sessionA.getRoom(roomId)!

  await sessionB.deleteRoom(roomId)

  assert.equal(sessionB.listBookmarks().some((b) => b.id === roomId), false,
    'the room is gone from the leaver, even though purging storage is best effort')
  assert.equal(sessionB.getRoom(roomId), undefined, 'and it is no longer open')

  await waitFor(
    () => !roomA.listMembers().some((m) => m.identityId === identityB.id),
    'A to stop listing the member who left'
  )
})

test('rejoining by invite after leaving restores write access', async (t) => {
  const { sessionB, roomId, invite } = await joinedPair(t)

  await sessionB.deleteRoom(roomId)

  // Leaving purges the local writer core. Rejoining under the same corestore namespace would
  // regenerate the identical writer key — one the room already lists, so there is nothing for the
  // owner to add and nothing that can restore write access. Joins take a fresh namespace for
  // exactly this reason.
  const rejoined = await sessionB.joinRoomByKey('test-room', invite)
  await waitFor(() => rejoined.writable && rejoined.hasKey, 'B to be granted write access again')
})

test('an unbanned member can be let back in with an invite', async (t) => {
  const { sessionA, sessionB, identityB, roomId, invite } = await joinedPair(t)
  const roomA = sessionA.getRoom(roomId)!
  const roomB = sessionB.getRoom(roomId)!

  const removedKey = b4a.toString(roomB.localWriterKey, 'hex')
  await sessionA.banMember(roomId, removedKey, identityB.id)

  await waitFor(() => !roomB.writable, 'B to lose write access')
  await waitFor(
    () => !roomA.listMembers().some((m) => m.identityId === identityB.id),
    'A to stop listing the banned member'
  )

  // Lifting the ban does not restore write access by itself — the invite code is what gets them
  // back past the grant gate now that their identity is no longer a known member.
  await sessionA.unbanMember(roomId, identityB.id)
  await waitFor(() => !roomA.isBanned(identityB.id), 'the ban to be lifted')

  const rejoined = await sessionB.joinRoomByKey('test-room', invite)
  await waitFor(() => rejoined.writable && rejoined.hasKey, 'the unbanned member to be let back in')
})

test('an unbanned member cannot get back in without presenting a valid invite code', async (t) => {
  const { sessionA, sessionB, identityB, roomId } = await joinedPair(t)
  const roomB = sessionB.getRoom(roomId)!
  const bootstrapKeyHex = b4a.toString(roomB.bootstrapKey, 'hex')

  const removedKey = b4a.toString(roomB.localWriterKey, 'hex')
  await sessionA.banMember(roomId, removedKey, identityB.id)
  await waitFor(() => !roomB.writable, 'B to lose write access')
  await sessionA.unbanMember(roomId, identityB.id)
  await waitFor(() => !sessionA.getRoom(roomId)!.isBanned(identityB.id), 'the ban to be lifted')

  // Same bootstrap key, no ':code' suffix — what a bare reconnect (or a background retry with no
  // invite in hand) presents. Removal is meant to require a fresh invite to reverse, same as the
  // UI's "You'll need a new invite to rejoin" copy says for a plain leave. If a removed member gets
  // back in on identity alone, removal is not a moderation action — it's a 15-second delay.
  const rejoined = await sessionB.joinRoomByKey('test-room', bootstrapKeyHex)

  // No waitFor here: waiting for a negative can only time out at the ceiling, which is the point —
  // give the grant every chance it would get in real use, then check it never arrived.
  await new Promise((resolve) => setTimeout(resolve, 3000))
  assert.equal(rejoined.writable, false, 'a removed identity must not be re-admitted without a valid invite code')
})

test('a session that fails to open gives its storage back', async (t) => {
  const net = await transport()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-storage-lock-test-'))
  const identity = makeIdentity()
  t.after(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  const first = await Session.create(identity, dir, { transport: net })
  await first.close()

  // A corrupt legacy bookmarks file fails the open from inside `migrateJsonIfNeeded` — that is,
  // after the corestore is already open and holding its exclusive lock on the directory, and after
  // the swarm exists. The half-built session is unreachable from here, so unless `create` closes it
  // on the way out, that lock is held by nothing anyone can address: every later open of the same
  // directory then fails too, for the lifetime of the process. On mobile that is the whole app —
  // the unlock screen has no way in and no way to release it.
  fs.writeFileSync(path.join(dir, 'rooms.json'), 'not json')
  await assert.rejects(
    Session.create(identity, dir, { transport: net }),
    'the corrupt migration file fails the open'
  )

  fs.unlinkSync(path.join(dir, 'rooms.json'))
  const second = await Session.create(identity, dir, { transport: net })
  t.after(async () => { await second.close() })
  assert.equal(second.listBookmarks().length, 0, 'the same storage opens again once the cause is gone')
})
