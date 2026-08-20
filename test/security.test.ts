// Adversarial tests for Room's authorization gates (src/rooms/room.ts `apply()`).
// Unlike room.test.ts (which checks that state survives reopen), these check that the
// *enforcement* actually holds against a second, real writer — every check here is keyed off
// `node.from.key`, the Autobase-verified signer of a log entry, not a claimed field a hostile
// peer could forge. Two real Corestores are wired together with a local (non-network)
// replication stream so entries genuinely cross from one identity's writer core to the other's.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Corestore from 'corestore'
import { Room } from '../src/rooms/room.js'
import { randomId } from '../src/util/id.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'linda-pear-security-test-'))
}

/** Replicates two local corestores over an in-memory (non-network) stream pair just long enough
 * for pending blocks to cross, then tears the link down. */
async function sync(storeA: Corestore, storeB: Corestore): Promise<void> {
  const s1 = storeA.replicate(true)
  const s2 = storeB.replicate(false)
  s1.pipe(s2).pipe(s1)
  await new Promise((resolve) => setTimeout(resolve, 400))
  s1.destroy()
  s2.destroy()
  await new Promise((resolve) => setTimeout(resolve, 100))
}

interface Writer {
  dir: string
  store: Corestore
  identityId: string
  storeId: string
  room: Room
}

/** Opens a fresh writer against an existing room. Autobase holds an exclusive lock on a writer
 * core's storage, so a writer's `room` must never have two live `Room.open` instances at once —
 * callers that need to re-observe state after a write must go through `reopen`, not open a
 * second instance directly. */
async function openWriter(store: Corestore, roomId: string | null, bootstrapKey: Buffer | null, identityId: string, storeId: string, keyHex?: string | null): Promise<Room> {
  return Room.open(store, roomId, bootstrapKey, identityId, keyHex ? [{ epoch: 0, keyHex }] : undefined, storeId)
}

async function reopen(w: Writer): Promise<Room> {
  const keyHex = w.room.currentKeyHex
  await w.room.close()
  w.room = await openWriter(w.store, w.room.id, w.room.bootstrapKey, w.identityId, w.storeId, keyHex)
  return w.room
}

function newWriter(): { dir: string; store: Corestore; identityId: string; storeId: string } {
  const dir = tmpDir()
  return { dir, store: new Corestore(dir), identityId: randomId(32), storeId: randomId(8) }
}

async function closeWriter(w: Writer): Promise<void> {
  await w.room.close()
  await w.store.close()
  fs.rmSync(w.dir, { recursive: true, force: true })
}

/** A owns the room; B is added as an ordinary (non-mod) writer and synced in. */
async function setupTwoWriterRoom(): Promise<{ a: Writer; b: Writer }> {
  const base = newWriter()
  const roomA = await openWriter(base.store, null, null, base.identityId, base.storeId)
  const a: Writer = { ...base, room: roomA }

  const baseB = newWriter()
  const roomB = await openWriter(baseB.store, roomA.id, roomA.bootstrapKey, baseB.identityId, baseB.storeId, roomA.currentKeyHex)
  const b: Writer = { ...baseB, room: roomB }

  await a.room.addWriter(b.room.localWriterKey, b.identityId)
  await sync(a.store, b.store)

  return { a, b }
}

test('security: a removed writer\'s later message never reaches the room', async () => {
  const { a, b } = await setupTwoWriterRoom()

  await b.room.send(b.identityId, 'legit message before kick')
  await sync(a.store, b.store)

  // A kicks B: revokes B's write access at the Autobase level.
  await a.room.removeWriter(b.room.localWriterKey)
  await sync(a.store, b.store)

  // B tries to keep talking after being kicked. Autobase itself refuses the local append once
  // B's own instance has synced its own removal — enforcement doesn't even need to wait for the
  // apply()-time filter other tests in this file exercise.
  await assert.rejects(() => b.room.send(b.identityId, 'message after kick'))
  await sync(a.store, b.store)

  await reopen(a)
  const bodies: string[] = []
  for (let i = 0; i < a.room.messageCount; i++) bodies.push((await a.room.getMessage(i)).body)
  assert.deepEqual(bodies, ['legit message before kick'], 'the post-kick message must not appear in the shared view')

  await closeWriter(a)
  await closeWriter(b)
})

test('security: a plain member cannot change the room name/avatar', async () => {
  const { a, b } = await setupTwoWriterRoom()

  await b.room.updateMeta({ name: 'Hijacked', avatar: 'evil.png' })
  await sync(a.store, b.store)

  await reopen(a)
  assert.equal(a.room.name, '', 'member-authored setMeta must be ignored')
  assert.equal(a.room.avatar, '')

  await closeWriter(a)
  await closeWriter(b)
})

test('security: a plain member cannot promote themself to moderator', async () => {
  const { a, b } = await setupTwoWriterRoom()

  await b.room.promote(b.identityId)
  await sync(a.store, b.store)

  await reopen(a)
  assert.equal(a.room.isModerator(b.identityId), false, 'only the owner-authored promote may take effect')

  await closeWriter(a)
  await closeWriter(b)
})

test('security: a plain member cannot ban another member', async () => {
  const { a, b } = await setupTwoWriterRoom()

  const cBase = newWriter()
  const roomC = await openWriter(cBase.store, a.room.id, a.room.bootstrapKey, cBase.identityId, cBase.storeId)
  const c: Writer = { ...cBase, room: roomC }
  await a.room.addWriter(c.room.localWriterKey, c.identityId)
  await sync(a.store, b.store)
  await sync(a.store, c.store)

  // B (plain member, not owner/mod) tries to ban C.
  await b.room.banMember(c.identityId)
  await sync(a.store, b.store)

  await reopen(a)
  assert.equal(a.room.isBanned(c.identityId), false, 'a non-privileged member cannot ban anyone')

  await closeWriter(a)
  await closeWriter(b)
  await closeWriter(c)
})

test('security: a moderator cannot ban the owner or another moderator', async () => {
  const { a, b } = await setupTwoWriterRoom()

  // A promotes B to moderator.
  await a.room.promote(b.identityId)
  await sync(a.store, b.store)

  // Third writer C, also promoted to moderator.
  const cBase = newWriter()
  const roomC = await openWriter(cBase.store, a.room.id, a.room.bootstrapKey, cBase.identityId, cBase.storeId)
  const c: Writer = { ...cBase, room: roomC }
  await a.room.addWriter(c.room.localWriterKey, c.identityId)
  await a.room.promote(c.identityId)
  await sync(a.store, c.store)
  await sync(a.store, b.store)

  await reopen(b)
  // Mod B tries to ban the owner A.
  await b.room.banMember(a.identityId)
  // Mod B tries to ban fellow mod C.
  await b.room.banMember(c.identityId)
  await sync(a.store, b.store)

  await reopen(a)
  assert.equal(a.room.isBanned(a.identityId), false, 'a moderator cannot ban the owner')
  assert.equal(a.room.isBanned(c.identityId), false, 'a moderator cannot ban another moderator')

  await closeWriter(a)
  await closeWriter(b)
  await closeWriter(c)
})

test('security: a member cannot delete or edit someone else\'s message', async () => {
  const { a, b } = await setupTwoWriterRoom()

  const sent = await a.room.send(a.identityId, 'A said this')
  await sync(a.store, b.store)

  await reopen(b)
  await b.room.deleteMessage(sent.id)
  await b.room.editMessage(sent.id, 'tampered by B')
  await sync(a.store, b.store)

  await reopen(a)
  const msg = await a.room.getMessage(0)
  assert.equal(msg.deleted, undefined, 'a non-author delete must be ignored')
  assert.equal(msg.body, 'A said this', 'a non-author edit must be ignored')

  await closeWriter(a)
  await closeWriter(b)
})

test('security: a non-owner cannot grant write access to a third party', async () => {
  const { a, b } = await setupTwoWriterRoom()

  const cBase = newWriter()
  const roomC = await openWriter(cBase.store, a.room.id, a.room.bootstrapKey, cBase.identityId, cBase.storeId)
  const c: Writer = { ...cBase, room: roomC }

  // B (not the owner) tries to grant C write access.
  await b.room.addWriter(c.room.localWriterKey, c.identityId)
  await sync(a.store, b.store)

  await reopen(a)
  assert.deepEqual(a.room.listMembers().map((m) => m.identityId).sort(), [a.identityId, b.identityId].sort(),
    'only the owner-authored addWriter may add a member')

  await closeWriter(a)
  await closeWriter(b)
  await closeWriter(c)
})
