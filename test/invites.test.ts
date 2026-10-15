import test from 'node:test'
import assert from 'node:assert/strict'
import { InviteBook } from '../src/app/invites.js'
import type { Room } from '../src/rooms/room.js'

function fakeStore(): { saved: Array<{ roomId: string; code: string; usedCount: number }>; saveInviteToken(t: { roomId: string; code: string; usedCount: number }): Promise<void> } {
  const saved: Array<{ roomId: string; code: string; usedCount: number }> = []
  return { saved, saveInviteToken: async (t) => { saved.push({ ...t }) } }
}

function fakeRoom(opts: { writable: boolean; admin: boolean }): { room: Room; codes: string[] } {
  const codes: string[] = []
  const room = {
    writable: opts.writable,
    isAdmin: () => opts.admin,
    addInviteCode: async (code: string) => { codes.push(code) }
  } as unknown as Room
  return { room, codes }
}

test('issuing replaces the room token, saves it, and replicates it for an admin', () => {
  const store = fakeStore()
  const book = new InviteBook(store)
  const { room, codes } = fakeRoom({ writable: true, admin: true })

  const first = book.issue('room', room, 'me')
  const second = book.issue('room', room, 'me')

  assert.notEqual(first.code, second.code)
  assert.equal(book.get('room')?.code, second.code)
  assert.equal(store.saved.length, 2)
  assert.deepEqual(codes, [first.code, second.code])
})

test('a non-admin or read-only member does not replicate the code', () => {
  const store = fakeStore()
  const book = new InviteBook(store)
  const readOnly = fakeRoom({ writable: false, admin: true })
  const notAdmin = fakeRoom({ writable: true, admin: false })

  book.issue('a', readOnly.room, 'me')
  book.issue('b', notAdmin.room, 'me')
  book.issue('c', undefined, 'me')

  assert.deepEqual(readOnly.codes, [])
  assert.deepEqual(notAdmin.codes, [])
})

test('redeeming counts a use of the current code only', () => {
  const store = fakeStore()
  const book = new InviteBook(store)
  const token = book.issue('room', undefined, 'me')

  assert.equal(book.redeem('room', 'wrong'), false)
  assert.equal(book.redeem('other-room', token.code), false)
  assert.equal(book.redeem('room', token.code), true)
  assert.equal(book.redeem('room', token.code), true)

  assert.equal(book.get('room')?.usedCount, 2)
  assert.equal(store.saved.at(-1)?.usedCount, 2)
})

test('a replaced code no longer redeems', () => {
  const book = new InviteBook(fakeStore())
  const old = book.issue('room', undefined, 'me')
  book.issue('room', undefined, 'me')

  assert.equal(book.redeem('room', old.code), false)
})

test('restore brings a saved token back without saving it again', () => {
  const store = fakeStore()
  const book = new InviteBook(store)

  book.restore('room', { code: 'abc', usedCount: 3 })

  assert.deepEqual(book.get('room'), { code: 'abc', usedCount: 3 })
  assert.equal(store.saved.length, 0)
})
