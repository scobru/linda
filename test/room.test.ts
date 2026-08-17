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
