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
    Session.create(identity, dir, { transport: net })
  )

  fs.unlinkSync(path.join(dir, 'rooms.json'))
  const second = await Session.create(identity, dir, { transport: net })
  t.after(async () => { await second.close() })
  assert.equal(second.listBookmarks().length, 0, 'the same storage opens again once the cause is gone')
})

test('a member left holding write access but no room key asks for it again', async (t) => {
  const { sessionB, roomId } = await joinedPair(t)
  const roomB = sessionB.getRoom(roomId)!
  assert.equal(roomB.writable, true, 'B starts out granted')
  assert.equal(roomB.hasKey, true, 'and keyed')

  // The grant and the key are two separate steps of the owner's reply, and only the first one is
  // replicated: the key rides back over RPC best-effort (rpc.ts's safeSend) and is persisted
  // fire-and-forget. Losing just the second leaves exactly this state — a writer with no content
  // key, for whom every message in the room reads "locked message" and nothing can be posted.
  // Reached here by dropping the keys directly, since nothing in the API can un-send them.
  const internals = roomB as unknown as { contentKeys: Map<number, Buffer>; currentEpoch: number }
  internals.contentKeys.clear()
  internals.currentEpoch = -1
  assert.equal(roomB.writable, true, 'still a writer')
  assert.equal(roomB.hasKey, false, 'with no key to read or write messages with')

  // What the reconnect and the background retry both call. It used to return early here, because
  // being writable was taken to mean there was nothing left to ask for.
  const askAgain = sessionB as unknown as { requestWriteIfNeeded(room: unknown, peer: unknown): void }
  for (const peer of sessionB.peers.values()) askAgain.requestWriteIfNeeded(roomB, peer)

  await waitFor(() => roomB.hasKey, 'the owner to send the room key again')
})

test('a room key pushed by a non-admin member is ignored', async (t) => {
  const { sessionA, sessionB, roomId } = await joinedPair(t)
  const roomA = sessionA.getRoom(roomId)!
  const epochBefore = roomA.keyEpoch
  const keyBefore = roomA.currentKeyHex

  const toA = [...sessionB.peers.values()][0]!
  toA.rpc.sendRoomKey({ roomId, epoch: epochBefore + 5, key: 'ab'.repeat(32) })

  // Nothing to poll for: the assertion is that nothing happens, so give the message time to land.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  assert.equal(roomA.keyEpoch, epochBefore, 'a member cannot move the room to a key of its choosing')
  assert.equal(roomA.currentKeyHex, keyBefore)
})

test('a moderator ban makes the owner rotate the room key, and the banned member does not get it', async (t) => {
  const { sessionA, sessionB, identityB, roomId, invite } = await joinedPair(t)
  const roomA = sessionA.getRoom(roomId)!
  const roomB = sessionB.getRoom(roomId)!

  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-session-test-'))
  const identityC = makeIdentity()
  const sessionC = await Session.create(identityC, path.join(base, 'c'), { transport: await transport() })
  t.after(async () => {
    await sessionC.close()
    fs.rmSync(base, { recursive: true, force: true })
  })
  const roomC = await sessionC.joinRoomByKey('test-room', invite)
  await waitFor(() => roomC.writable && roomC.hasKey, 'C to be granted write access and the room key')

  await sessionA.promoteToModerator(roomId, identityB.id)
  await waitFor(() => roomB.isModerator(identityB.id), 'B to see itself promoted')

  const epochBefore = roomA.keyEpoch
  await sessionB.banMember(roomId, b4a.toString(roomC.localWriterKey, 'hex'), identityC.id)

  await waitFor(() => roomA.keyEpoch > epochBefore, 'the owner to rotate after the moderator ban')
  await waitFor(() => roomB.keyEpoch === roomA.keyEpoch, 'the remaining moderator to receive the new key')
  await new Promise((resolve) => setTimeout(resolve, 1000))
  assert.equal(roomC.keyEpoch, epochBefore, 'the banned member is left on the old key')
})

test('a contact request is accepted into a shared 1:1 room', async (t) => {
  const { sessionA, sessionB, identityA, identityB } = await joinedPair(t)

  assert.equal(await sessionA.sendContactRequest(identityB.id, 'B'), true)
  await waitFor(() => sessionB.listContacts().some((c) => c.userId === identityA.id && c.status === 'incoming'), 'B to see the incoming request')

  await sessionB.respondToContact(identityA.id, true)
  await waitFor(
    () => sessionA.listContacts().some((c) => c.userId === identityB.id && c.status === 'accepted' && !!c.roomId),
    'A to see the request accepted, with a room'
  )
  assert.equal(sessionB.listContacts().find((c) => c.userId === identityA.id)?.status, 'accepted')
})

test('a declined contact request is dropped on both sides', async (t) => {
  const { sessionA, sessionB, identityA, identityB } = await joinedPair(t)

  await sessionA.sendContactRequest(identityB.id, 'B')
  await waitFor(() => sessionB.listContacts().some((c) => c.userId === identityA.id), 'B to see the request')

  await sessionB.respondToContact(identityA.id, false)
  await waitFor(() => !sessionA.listContacts().some((c) => c.userId === identityB.id), 'A to drop the declined request')
  assert.equal(sessionB.listContacts().some((c) => c.userId === identityA.id), false)
})

test('a contact link binds its issuer and its first claimant as contacts', async (t) => {
  const { sessionA, sessionB, identityA, identityB } = await joinedPair(t)

  const { key } = await sessionA.createContactInvite()
  const room = await sessionB.acceptContactInvite({ from: identityA.id, name: 'A', key })
  assert.equal(sessionB.listContacts().find((c) => c.userId === identityA.id)?.roomId, room.id)

  await waitFor(
    () => sessionA.listContacts().some((c) => c.userId === identityB.id && c.status === 'accepted'),
    'the issuer to bind the first claimant as a contact'
  )
})

test('a peer downloads, stats and streams a file from another session\'s file store, more than once', async (t) => {
  const { sessionA, sessionB } = await joinedPair(t)

  const store = await sessionA.fileStore()
  const content = b4a.from('hello from the file store', 'utf8')
  await store.addBuffer('/hello.txt', content)
  const driveKey = b4a.toString(store.key, 'hex')

  // The owner reads its own drive without going through the network.
  assert.deepEqual(await sessionA.downloadFile(driveKey, 'hello.txt'), content)

  // A second download of the same remote drive used to hang forever, so each one is raced against
  // a timeout instead of being left to stall the run.
  const withTimeout = <T>(promise: Promise<T>, label: string) => Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out: ${label}`)), SETTLE_MS))
  ])
  assert.deepEqual(await withTimeout(sessionB.downloadFile(driveKey, '/hello.txt'), 'first download'), content)
  assert.deepEqual(await withTimeout(sessionB.downloadFile(driveKey, 'hello.txt'), 'second download'), content)

  assert.deepEqual(await withTimeout(sessionB.statFile(driveKey, 'hello.txt'), 'stat'), { size: content.length })

  const chunks: Buffer[] = []
  const stream = await withTimeout(sessionB.createFileStream(driveKey, '/hello.txt', { start: 0, end: 4 }), 'stream')
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  assert.equal(b4a.toString(b4a.concat(chunks), 'utf8'), 'hello', 'a byte range comes back whole')
})
