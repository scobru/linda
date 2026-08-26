import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Corestore from 'corestore'
import b4a from 'b4a'
import { Room } from '../src/rooms/room.js'
import { FileStore } from '../src/files/drive.js'
import { randomId } from '../src/util/id.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'linda-pear-room-files-test-'))
}

test('a file sent in the chat shows up in the room file index', async () => {
  const dir = tmpDir()
  const store = new Corestore(dir)
  const storeId = randomId(8)
  const identityA = randomId(32)

  const room = await Room.open(store, null, null, identityA, undefined, storeId)

  // File bytes live in the sender's own drive, not a shared per-room one — each peer writes to
  // its own writable Hyperdrive; the room log only tracks the pointer.
  const fileStore = await FileStore.open(store)
  const fileData = b4a.from('Hello P2P World!', 'utf8')
  const entry = await fileStore.addBuffer('/documents/hello.txt', fileData)

  const message = await room.sendFile(identityA, {
    driveKey: b4a.toString(fileStore.key, 'hex'),
    path: entry.path,
    size: entry.size,
    name: 'hello.txt',
    mimeType: 'text/plain'
  })

  const files = await room.listFiles()
  assert.equal(files.length, 1)
  assert.equal(files[0].name, 'hello.txt')
  assert.equal(files[0].size, fileData.length)
  assert.equal(files[0].authorId, identityA)
  assert.equal(files[0].messageId, message.id)

  const fetched = await fileStore.drive.get('/documents/hello.txt')
  assert.ok(fetched)
  assert.equal(b4a.toString(fetched, 'utf8'), 'Hello P2P World!')

  await room.close()
  await store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('deleting the message drops the file from the index', async () => {
  const dir = tmpDir()
  const store = new Corestore(dir)
  const storeId = randomId(8)
  const identityA = randomId(32)

  const room = await Room.open(store, null, null, identityA, undefined, storeId)
  const fileStore = await FileStore.open(store)
  const entry = await fileStore.addBuffer('/documents/bye.txt', b4a.from('bye', 'utf8'))

  const message = await room.sendFile(identityA, {
    driveKey: b4a.toString(fileStore.key, 'hex'),
    path: entry.path,
    size: entry.size,
    name: 'bye.txt',
    mimeType: 'text/plain'
  })
  assert.equal((await room.listFiles()).length, 1)

  await room.deleteMessage(message.id)
  assert.equal((await room.listFiles()).length, 0)
  assert.equal(await room.getFile(message.id), null)

  // The message keeps its file field after a delete — the renderer must key off `deleted`, not
  // off the presence of `file`, or a deleted attachment stays on screen and downloadable.
  const deletedMsg = await room.getMessage(0)
  assert.equal(deletedMsg.deleted, true)
  assert.ok(deletedMsg.file, 'the raw message still carries its attachment')

  await room.close()
  await store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('the file index survives a room reopen', async () => {
  const dir = tmpDir()
  const store1 = new Corestore(dir)
  const storeId = randomId(8)
  const identityA = randomId(32)

  const room1 = await Room.open(store1, null, null, identityA, undefined, storeId)
  const roomId = room1.id
  const bootstrapKey = room1.bootstrapKey

  const fileStore = await FileStore.open(store1)
  const entry = await fileStore.addBuffer('/documents/keep.txt', b4a.from('keep', 'utf8'))
  await room1.sendFile(identityA, {
    driveKey: b4a.toString(fileStore.key, 'hex'),
    path: entry.path,
    size: entry.size,
    name: 'keep.txt',
    mimeType: 'text/plain'
  })

  await room1.close()
  await store1.close()

  const store2 = new Corestore(dir)
  const room2 = await Room.open(store2, roomId, bootstrapKey, identityA, undefined, storeId)
  const files = await room2.listFiles()
  assert.equal(files.length, 1)
  assert.equal(files[0].name, 'keep.txt')

  await room2.close()
  await store2.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('the indexed path matches the drive key exactly (orphan sweep depends on it)', async () => {
  const dir = tmpDir()
  const store = new Corestore(dir)
  const storeId = randomId(8)
  const identityA = randomId(32)

  const room = await Room.open(store, null, null, identityA, undefined, storeId)
  const fileStore = await FileStore.open(store)

  // The sweep decides what to delete by comparing the room index against the drive listing. If
  // these two ever disagree about a path's shape, a live file reads as an orphan and gets deleted.
  const entry = await fileStore.addBuffer('/room-1/1700000000-report.pdf', b4a.from('pdf', 'utf8'))
  await room.sendFile(identityA, {
    driveKey: b4a.toString(fileStore.key, 'hex'),
    path: entry.path,
    size: entry.size,
    name: 'report.pdf',
    mimeType: 'application/pdf'
  })

  const indexed = (await room.listFiles()).map((f) => f.path)
  const onDrive: string[] = []
  for await (const e of fileStore.drive.list('/')) onDrive.push(e.key)

  assert.deepEqual(indexed, onDrive, 'a path in the room index must match its drive key verbatim')

  await room.close()
  await store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})
