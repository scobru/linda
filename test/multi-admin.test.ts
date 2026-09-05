import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Corestore from 'corestore'
import { Room } from '../src/rooms/room.js'
import { randomId } from '../src/util/id.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'linda-pear-multi-admin-test-'))
}

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

async function openWriter(
  store: Corestore,
  roomId: string | null,
  bootstrapKey: Buffer | null,
  identityId: string,
  storeId: string,
  keyHex?: string | null
): Promise<Room> {
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

test('multi-admin: creator promotes member to admin, both are recognized admins', async () => {
  const baseA = newWriter()
  const roomA = await openWriter(baseA.store, null, null, baseA.identityId, baseA.storeId)
  const a: Writer = { ...baseA, room: roomA }

  const baseB = newWriter()
  const roomB = await openWriter(baseB.store, a.room.id, a.room.bootstrapKey, baseB.identityId, baseB.storeId, a.room.currentKeyHex)
  const b: Writer = { ...baseB, room: roomB }

  assert.equal(a.room.isAdmin(a.identityId), true)
  assert.equal(a.room.isAdmin(b.identityId), false)

  await a.room.addWriter(b.room.localWriterKey, b.identityId)
  await sync(a.store, b.store)

  await a.room.promoteAdmin(b.identityId)
  await sync(a.store, b.store)

  await reopen(a)
  await reopen(b)

  assert.equal(a.room.isAdmin(a.identityId), true)
  assert.equal(a.room.isAdmin(b.identityId), true)
  assert.equal(b.room.isAdmin(a.identityId), true)
  assert.equal(b.room.isAdmin(b.identityId), true)

  const adminList = b.room.listAdmins()
  assert.ok(adminList.includes(a.identityId))
  assert.ok(adminList.includes(b.identityId))

  await closeWriter(a)
  await closeWriter(b)
})

test('multi-admin: second admin can add new writers and grant write access when creator is offline', async () => {
  const baseA = newWriter()
  const roomA = await openWriter(baseA.store, null, null, baseA.identityId, baseA.storeId)
  const a: Writer = { ...baseA, room: roomA }

  const baseB = newWriter()
  const roomB = await openWriter(baseB.store, a.room.id, a.room.bootstrapKey, baseB.identityId, baseB.storeId, a.room.currentKeyHex)
  const b: Writer = { ...baseB, room: roomB }

  await a.room.addWriter(b.room.localWriterKey, b.identityId)
  await a.room.promoteAdmin(b.identityId)
  await sync(a.store, b.store)
  await reopen(b)

  // Creator A goes completely offline
  await closeWriter(a)

  // New peer C arrives while creator is offline
  const baseC = newWriter()
  const roomC = await openWriter(baseC.store, b.room.id, b.room.bootstrapKey, baseC.identityId, baseC.storeId, b.room.currentKeyHex)
  const c: Writer = { ...baseC, room: roomC }

  // Admin B admits C and grants write access
  await b.room.addWriter(c.room.localWriterKey, c.identityId)
  await sync(b.store, c.store)
  if ((c.room as any).base?.update) await (c.room as any).base.update()
  await sync(b.store, c.store)
  if ((c.room as any).base?.update) await (c.room as any).base.update()

  await reopen(c)
  assert.equal(c.room.writable, true)

  // C can now send a message
  await c.room.send(c.identityId, 'Hello from C admitted by co-admin B')
  await sync(c.store, b.store)
  if ((b.room as any).base?.update) await (b.room as any).base.update()
  await sync(c.store, b.store)
  if ((b.room as any).base?.update) await (b.room as any).base.update()

  await reopen(b)
  const messages: string[] = []
  for await (const msg of b.room.messages()) {
    messages.push(msg.body)
  }
  assert.ok(messages.includes('Hello from C admitted by co-admin B'))

  await closeWriter(b)
  await closeWriter(c)
})

test('multi-admin: invite code replicates over autobase and can be validated by co-admin', async () => {
  const baseA = newWriter()
  const roomA = await openWriter(baseA.store, null, null, baseA.identityId, baseA.storeId)
  const a: Writer = { ...baseA, room: roomA }

  const baseB = newWriter()
  const roomB = await openWriter(baseB.store, a.room.id, a.room.bootstrapKey, baseB.identityId, baseB.storeId, a.room.currentKeyHex)
  const b: Writer = { ...baseB, room: roomB }

  await a.room.addWriter(b.room.localWriterKey, b.identityId)
  await a.room.promoteAdmin(b.identityId)

  // A issues an invite code and adds it to room
  await a.room.addInviteCode('invite-secret-abc')
  await sync(a.store, b.store)

  await reopen(b)
  assert.equal(b.room.isValidInvite('invite-secret-abc'), true)
  assert.equal(b.room.isValidInvite('invalid-code'), false)

  await closeWriter(a)
  await closeWriter(b)
})

test('multi-admin: sole admin cannot be demoted, but demotion works when multiple admins exist', async () => {
  const baseA = newWriter()
  const roomA = await openWriter(baseA.store, null, null, baseA.identityId, baseA.storeId)
  const a: Writer = { ...baseA, room: roomA }

  // Sole admin cannot demote themselves
  await assert.rejects(() => a.room.demoteAdmin(a.identityId), /sole admin/)

  const baseB = newWriter()
  const roomB = await openWriter(baseB.store, a.room.id, a.room.bootstrapKey, baseB.identityId, baseB.storeId, a.room.currentKeyHex)
  const b: Writer = { ...baseB, room: roomB }

  await a.room.addWriter(b.room.localWriterKey, b.identityId)
  await a.room.promoteAdmin(b.identityId)
  await sync(a.store, b.store)

  // With two admins, demoting one succeeds
  await a.room.demoteAdmin(b.identityId)
  await sync(a.store, b.store)

  await reopen(a)
  await reopen(b)

  assert.equal(a.room.isAdmin(b.identityId), false)
  assert.equal(a.room.isAdmin(a.identityId), true)

  await closeWriter(a)
  await closeWriter(b)
})
