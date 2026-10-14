import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { RoomDirectory } from '../src/app/directory.js'
import type { RoomAnnounceMessage } from '../src/network/encoding.js'

function announce(roomId: string, bootstrapKey: string, authorId = 'author'): RoomAnnounceMessage {
  return { roomId, name: roomId, bootstrapKey, authorId, inviteCode: '', avatar: '', description: '' }
}

function setup(): { dir: string; changes: { count: number }; open: () => RoomDirectory } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-directory-test-'))
  const changes = { count: 0 }
  return { dir, changes, open: () => new RoomDirectory(dir, () => { changes.count++ }) }
}

test('a gossiped announce replaces an older entry for the same room key and notifies', () => {
  const { dir, changes, open } = setup()
  const directory = open()
  directory.receive(announce('old-id', 'key-1'))
  directory.receive(announce('new-id', 'key-1'))

  assert.deepEqual(directory.list().map((a) => a.roomId), ['new-id'])
  assert.equal(directory.get('old-id'), undefined)
  assert.equal(changes.count, 2)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('our own announce is stored and survives a restart without notifying', () => {
  const { dir, changes, open } = setup()
  open().set(announce('mine', 'key-2', 'me'))

  assert.equal(changes.count, 0, 'the caller made this change itself')
  assert.deepEqual(open().list().map((a) => a.roomId), ['mine'])
  fs.rmSync(dir, { recursive: true, force: true })
})

test('removing an entry notifies once, and removing a missing one does nothing', () => {
  const { dir, changes, open } = setup()
  const directory = open()
  directory.set(announce('room', 'key-3'))

  assert.equal(directory.remove('room'), true)
  assert.equal(directory.remove('room'), false)
  assert.equal(changes.count, 1)
  assert.deepEqual(open().list(), [], 'the removal is on disk too')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('pruneOrphans drops only our own announces for rooms we no longer hold', () => {
  const { dir, open } = setup()
  const directory = open()
  directory.set(announce('kept', 'key-4', 'me'))
  directory.set(announce('orphan', 'key-5', 'me'))
  directory.set(announce('theirs', 'key-6', 'someone-else'))

  directory.pruneOrphans('me', (roomId) => roomId === 'kept')

  assert.deepEqual(open().list().map((a) => a.roomId).sort(), ['kept', 'theirs'])
  fs.rmSync(dir, { recursive: true, force: true })
})
