import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Corestore from 'corestore'
import b4a from 'b4a'
import sodium from 'sodium-universal'
import { Room } from '../src/rooms/room.js'
import { randomId } from '../src/util/id.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'linda-pear-room-test-'))
}

function randomWriterKey(): Buffer {
  const buf = b4a.allocUnsafe(32)
  sodium.randombytes_buf(buf)
  return buf
}

test('creator is owner and sole member', async () => {
  const dir = tmpDir()
  const store = new Corestore(dir)
  const storeId = randomId(8)
  const identityA = randomId(32)

  const room = await Room.open(store, null, null, identityA, undefined, storeId)
  assert.equal(room.isOwner(identityA), true)
  assert.deepEqual(room.listMembers().map((m) => m.identityId), [identityA])

  await room.close()
  await store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('membership survives reopen with zero new log entries (regression: 0 members bug)', async () => {
  const dir = tmpDir()
  const identityA = randomId(32)
  const storeId = randomId(8)

  const store1 = new Corestore(dir)
  const room1 = await Room.open(store1, null, null, identityA, undefined, storeId)
  const roomId = room1.id
  const bootstrapKey = room1.bootstrapKey
  await room1.close()
  await store1.close()

  const store2 = new Corestore(dir)
  const room2 = await Room.open(store2, roomId, bootstrapKey, identityA, undefined, storeId)
  assert.equal(room2.isOwner(identityA), true)
  assert.deepEqual(room2.listMembers().map((m) => m.identityId), [identityA])
  assert.equal(room2.ownerId, identityA)

  await room2.close()
  await store2.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('added writer survives reopen', async () => {
  const dir = tmpDir()
  const identityA = randomId(32)
  const identityB = randomId(32)
  const storeId = randomId(8)
  const writerKeyB = randomWriterKey()

  const store1 = new Corestore(dir)
  const room1 = await Room.open(store1, null, null, identityA, undefined, storeId)
  const roomId = room1.id
  const bootstrapKey = room1.bootstrapKey
  await room1.addWriter(writerKeyB, identityB)
  assert.equal(room1.listMembers().length, 2)
  await room1.close()
  await store1.close()

  const store2 = new Corestore(dir)
  const room2 = await Room.open(store2, roomId, bootstrapKey, identityA, undefined, storeId)
  const members = room2.listMembers().map((m) => m.identityId).sort()
  assert.deepEqual(members, [identityA, identityB].sort())

  await room2.close()
  await store2.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('mute/ban/promote state survives reopen', async () => {
  const dir = tmpDir()
  const identityA = randomId(32)
  const identityB = randomId(32)
  const storeId = randomId(8)
  const writerKeyB = randomWriterKey()

  const store1 = new Corestore(dir)
  const room1 = await Room.open(store1, null, null, identityA, undefined, storeId)
  const roomId = room1.id
  const bootstrapKey = room1.bootstrapKey
  await room1.addWriter(writerKeyB, identityB)
  await room1.promote(identityB)
  await room1.muteMember(identityB)
  await room1.banMember(identityB)
  assert.equal(room1.isModerator(identityB), true)
  assert.equal(room1.isMuted(identityB), true)
  assert.equal(room1.isBanned(identityB), true)
  await room1.close()
  await store1.close()

  const store2 = new Corestore(dir)
  const room2 = await Room.open(store2, roomId, bootstrapKey, identityA, undefined, storeId)
  assert.equal(room2.isModerator(identityB), true)
  assert.equal(room2.isMuted(identityB), true)
  assert.equal(room2.isBanned(identityB), true)

  await room2.close()
  await store2.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('room meta (name/avatar/description) survives reopen', async () => {
  const dir = tmpDir()
  const identityA = randomId(32)
  const storeId = randomId(8)

  const store1 = new Corestore(dir)
  const room1 = await Room.open(store1, null, null, identityA, undefined, storeId)
  const roomId = room1.id
  const bootstrapKey = room1.bootstrapKey
  await room1.updateMeta({ name: 'General', avatar: 'emoji:🚀', description: 'main room' })
  await room1.close()
  await store1.close()

  const store2 = new Corestore(dir)
  const room2 = await Room.open(store2, roomId, bootstrapKey, identityA, undefined, storeId)
  assert.equal(room2.name, 'General')
  assert.equal(room2.avatar, 'emoji:🚀')
  assert.equal(room2.description, 'main room')

  await room2.close()
  await store2.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('messages survive reopen and decrypt correctly', async () => {
  const dir = tmpDir()
  const identityA = randomId(32)
  const storeId = randomId(8)

  const store1 = new Corestore(dir)
  const room1 = await Room.open(store1, null, null, identityA, undefined, storeId)
  const roomId = room1.id
  const bootstrapKey = room1.bootstrapKey
  await room1.send(identityA, 'hello world')
  const keyHex = room1.currentKeyHex
  await room1.close()
  await store1.close()

  const store2 = new Corestore(dir)
  const room2 = await Room.open(store2, roomId, bootstrapKey, identityA, keyHex ? [{ epoch: 0, keyHex }] : undefined, storeId)
  assert.equal(room2.messageCount, 1)
  const msg = await room2.getMessage(0)
  assert.equal(msg.body, 'hello world')

  await room2.close()
  await store2.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('edits, deletes and reactions survive reopen (regression: overlay lost outside the view)', async () => {
  const dir = tmpDir()
  const identityA = randomId(32)
  const storeId = randomId(8)

  const store1 = new Corestore(dir)
  const room1 = await Room.open(store1, null, null, identityA, undefined, storeId)
  const roomId = room1.id
  const bootstrapKey = room1.bootstrapKey
  const edited = await room1.send(identityA, 'before edit')
  const removed = await room1.send(identityA, 'before delete')
  await room1.editMessage(edited.id, 'after edit')
  await room1.toggleReaction(identityA, edited.id, '\u{1F44D}')
  await room1.deleteMessage(removed.id)
  const keyHex = room1.currentKeyHex
  await room1.close()
  await store1.close()

  const store2 = new Corestore(dir)
  const room2 = await Room.open(store2, roomId, bootstrapKey, identityA, keyHex ? [{ epoch: 0, keyHex }] : undefined, storeId)
  const reopenedEdit = await room2.getMessage(0)
  assert.equal(reopenedEdit.body, 'after edit')
  assert.equal(reopenedEdit.edited, true)
  assert.deepEqual(reopenedEdit.reactions, { '\u{1F44D}': [identityA] })
  assert.equal((await room2.getMessage(1)).deleted, true)

  // Authorization for edit/delete keys off the writer that appended the message. That binding used
  // to live in a JS map rebuilt from nothing on reopen, so every message sent before a restart
  // became permanently uneditable by its own author.
  await room2.editMessage(edited.id, 'edited after reopen')
  assert.equal((await room2.getMessage(0)).body, 'edited after reopen')

  await room2.close()
  await store2.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('cached message reflects a later edit, delete and reaction', async () => {
  const dir = tmpDir()
  const store = new Corestore(dir)
  const identityA = randomId(32)
  const room = await Room.open(store, null, null, identityA, undefined, randomId(8))

  const sent = await room.send(identityA, 'first draft')
  // Read once so the message is cached, then mutate it — a stale cache would keep serving the
  // pre-edit body here.
  assert.equal((await room.getMessage(0)).body, 'first draft')

  await room.editMessage(sent.id, 'second draft')
  assert.equal((await room.getMessage(0)).body, 'second draft')
  assert.equal((await room.getMessage(0)).edited, true)

  await room.toggleReaction(identityA, sent.id, '👍')
  assert.deepEqual((await room.getMessage(0)).reactions, { '👍': [identityA] })

  await room.deleteMessage(sent.id)
  assert.equal((await room.getMessage(0)).deleted, true)

  await room.close()
  await store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('reactions add and remove per user rather than blind-toggling', async () => {
  const dir = tmpDir()
  const store = new Corestore(dir)
  const identityA = randomId(32)
  const identityB = randomId(32)
  const room = await Room.open(store, null, null, identityA, undefined, randomId(8))

  const sent = await room.send(identityA, 'react to me')
  await room.toggleReaction(identityA, sent.id, '\u{1F389}')
  await room.toggleReaction(identityB, sent.id, '\u{1F389}')
  assert.deepEqual((await room.getMessage(0)).reactions, { '\u{1F389}': [identityA, identityB] })

  await room.toggleReaction(identityA, sent.id, '\u{1F389}')
  assert.deepEqual((await room.getMessage(0)).reactions, { '\u{1F389}': [identityB] })

  await room.toggleReaction(identityB, sent.id, '\u{1F389}')
  assert.equal((await room.getMessage(0)).reactions, undefined)

  await room.close()
  await store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('broadcast mode survives reopen and still lets the owner post', async () => {
  const dir = tmpDir()
  const identityA = randomId(32)
  const storeId = randomId(8)

  const store1 = new Corestore(dir)
  const room1 = await Room.open(store1, null, null, identityA, undefined, storeId)
  const roomId = room1.id
  const bootstrapKey = room1.bootstrapKey
  await room1.setBroadcast(true)
  assert.equal(room1.isBroadcast, true)
  const keyHex = room1.currentKeyHex
  await room1.close()
  await store1.close()

  const store2 = new Corestore(dir)
  const room2 = await Room.open(store2, roomId, bootstrapKey, identityA, keyHex ? [{ epoch: 0, keyHex }] : undefined, storeId)
  assert.equal(room2.isBroadcast, true)
  assert.equal(room2.canPost(identityA), true)
  await room2.send(identityA, 'owner post')
  assert.equal((await room2.getMessage(0)).body, 'owner post')

  await room2.setBroadcast(false)
  assert.equal(room2.isBroadcast, false)

  await room2.close()
  await store2.close()
  fs.rmSync(dir, { recursive: true, force: true })
})
