// A moderator bans a member while the owner is offline. Moderators cannot rotate the room key, so
// the banned member keeps the live key until the owner is back and has synced the ban; the owner
// then rotates once, and not again after a further restart.
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test('the owner rotates the key once it returns and syncs a moderator ban made while it was away', async (t) => {
  const net = await transport()
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-mod-ban-offline-test-'))
  const identityA = makeIdentity()
  const identityB = makeIdentity()
  const identityC = makeIdentity()
  const dirA = path.join(base, 'a')

  const open = (identity: Identity, dir: string) => Session.create(identity, dir, { transport: net })

  let sessionA = await open(identityA, dirA)
  const sessionB = await open(identityB, path.join(base, 'b'))
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
  await waitFor(() => roomB.writable && roomB.hasKey && roomC.writable && roomC.hasKey, 'B and C to join with the key')

  await sessionA.promoteToModerator(roomId, identityB.id)
  await waitFor(() => roomB.isModerator(identityB.id), 'B to see itself promoted')
  const epochBefore = roomA.keyEpoch

  // The owner goes away, then the moderator bans C.
  await close(sessionA)
  await sessionB.banMember(roomId, b4a.toString(roomC.localWriterKey, 'hex'), identityC.id)
  await waitFor(() => roomB.isBanned(identityC.id), 'B to record the ban')
  await sleep(1500)
  assert.equal(roomB.keyEpoch, epochBefore, 'a moderator cannot rotate the key')
  assert.equal(roomC.keyEpoch, epochBefore)

  // The owner comes back and syncs the ban.
  sessionA = await open(identityA, dirA)
  live.add(sessionA)
  await sessionA.reopenBookmarkedRooms()
  const reopened = sessionA.getRoom(roomId)!
  await waitFor(() => reopened.keyEpoch > epochBefore, 'the returning owner to rotate after the moderator ban')
  const rotatedEpoch = reopened.keyEpoch
  await waitFor(() => roomB.keyEpoch === rotatedEpoch, 'the moderator to receive the new key')
  assert.equal(roomC.keyEpoch, epochBefore, 'the banned member is left on the old key')

  // Restarting again must not rotate for the same ban a second time. Autobase does not re-apply an
  // indexed entry on reopen, so this checks the behaviour, not the epoch guard in `onModBan`, which
  // only matters if a reorg re-applies the ban.
  await close(sessionA)
  sessionA = await open(identityA, dirA)
  live.add(sessionA)
  await sessionA.reopenBookmarkedRooms()
  await sleep(3000)
  assert.equal(sessionA.getRoom(roomId)!.keyEpoch, rotatedEpoch, 'the same ban does not rotate the key again')
})
