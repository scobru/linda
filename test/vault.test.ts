import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Corestore from 'corestore'
import b4a from 'b4a'
import { Room } from '../src/rooms/room.js'
import { RoomVault } from '../src/files/vault.js'
import { randomId } from '../src/util/id.js'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'linda-pear-vault-test-'))
}

test('vault is disabled by default and can be enabled by owner', async () => {
  const dir = tmpDir()
  const store = new Corestore(dir)
  const storeId = randomId(8)
  const identityA = randomId(32)

  const room = await Room.open(store, null, null, identityA, undefined, storeId)
  assert.equal(room.isVaultEnabled, false)
  assert.equal(room.vaultDriveKey, null)

  const vault = await RoomVault.open(store, room.id)
  await room.setVault(true, vault.keyHex)

  assert.equal(room.isVaultEnabled, true)
  assert.equal(room.vaultDriveKey, vault.keyHex)

  await room.close()
  await vault.close()
  await store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('vault state survives room reopen', async () => {
  const dir = tmpDir()
  const store1 = new Corestore(dir)
  const storeId = randomId(8)
  const identityA = randomId(32)

  const room1 = await Room.open(store1, null, null, identityA, undefined, storeId)
  const roomId = room1.id
  const bootstrapKey = room1.bootstrapKey
  const vault1 = await RoomVault.open(store1, roomId)
  await room1.setVault(true, vault1.keyHex)

  await room1.close()
  await vault1.close()
  await store1.close()

  const store2 = new Corestore(dir)
  const room2 = await Room.open(store2, roomId, bootstrapKey, identityA, undefined, storeId)
  assert.equal(room2.isVaultEnabled, true)
  assert.equal(room2.vaultDriveKey, vault1.keyHex)

  await room2.close()
  await store2.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('adding and removing files in Room Vault', async () => {
  const dir = tmpDir()
  const store = new Corestore(dir)
  const storeId = randomId(8)
  const identityA = randomId(32)

  const room = await Room.open(store, null, null, identityA, undefined, storeId)
  const vault = await RoomVault.open(store, room.id)
  await room.setVault(true, vault.keyHex)

  const fileData = b4a.from('Hello P2P Vault World!', 'utf8')
  const entry = await vault.put('/documents/hello.txt', fileData)
  assert.equal(entry.path, '/documents/hello.txt')
  assert.equal(entry.size, fileData.length)

  await room.addVaultFile({
    path: entry.path,
    name: 'hello.txt',
    size: entry.size,
    mimeType: 'text/plain',
    authorId: identityA,
    timestamp: Date.now(),
    driveKey: vault.keyHex
  })

  let files = await room.listVaultFiles()
  assert.equal(files.length, 1)
  assert.equal(files[0].name, 'hello.txt')
  assert.equal(files[0].size, fileData.length)
  assert.equal(files[0].authorId, identityA)

  const fetched = await vault.get('/documents/hello.txt')
  assert.ok(fetched)
  assert.equal(b4a.toString(fetched, 'utf8'), 'Hello P2P Vault World!')

  await room.removeVaultFile('/documents/hello.txt')
  files = await room.listVaultFiles()
  assert.equal(files.length, 0)

  await room.close()
  await vault.close()
  await store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})
