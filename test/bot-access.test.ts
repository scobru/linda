import test from 'node:test'
import assert from 'node:assert/strict'
import { BotAccessPolicy, roomIdOf } from '../src/bot/access.js'
import { encodeInvite } from '../src/ui/qr-core.js'

// ---------------------------------------------------------------------------
// Who a bot listens to, and where. The integration side — a stranger's command going unanswered, a
// room off the list refused before joining — is in `bot.test.ts`.
// ---------------------------------------------------------------------------

const KEY = 'ab'.repeat(32)
const ROOM = KEY.slice(0, 16)
const ALICE = 'aa'.repeat(32)
const BOB = 'bb'.repeat(32)

test('a room id reads the same from every way of naming the room', () => {
  assert.equal(roomIdOf(ROOM), ROOM)
  assert.equal(roomIdOf(KEY), ROOM)
  assert.equal(roomIdOf(`${KEY}:invitecode`), ROOM)
  assert.equal(roomIdOf(encodeInvite({ name: 'Home', key: `${KEY}:invitecode` })), ROOM)
  assert.equal(roomIdOf(`  ${KEY.toUpperCase()}  `), ROOM)
  for (const bad of ['', 'home', 'xyz:abc', 'ab'.repeat(10), 'https://example.com']) assert.equal(roomIdOf(bad), null, bad)
})

test('no access rules: everyone, everywhere', () => {
  const open = new BotAccessPolicy()
  assert.ok(open.allowsMessage(BOB, 'anyroom00000000', null))
})

test('an allowed-users list: only those authors, anywhere', () => {
  const policy = new BotAccessPolicy({ users: [ALICE.toUpperCase()] })
  assert.ok(policy.allowsMessage(ALICE, 'anyroom00000000', null))
  assert.ok(!policy.allowsMessage(BOB, 'anyroom00000000', null))
})

test('an allowed-rooms list: only those rooms, whoever writes', () => {
  const policy = new BotAccessPolicy({ rooms: [encodeInvite({ name: 'Home', key: `${KEY}:code` })] })
  assert.ok(policy.allowsMessage(BOB, ROOM, null))
  assert.ok(!policy.allowsMessage(BOB, 'otherroom000000', null))
  assert.ok(!policy.allowsRoom('dmroom000000000', BOB), 'without a users list, a direct chat is just another room')
})

test('both: allowed users, in allowed rooms or in a direct chat with one of them', () => {
  const policy = new BotAccessPolicy({ users: [ALICE], rooms: [ROOM] })
  assert.ok(policy.allowsMessage(ALICE, ROOM, null))
  assert.ok(!policy.allowsMessage(BOB, ROOM, null), 'a stranger in an allowed room')
  assert.ok(!policy.allowsMessage(ALICE, 'otherroom000000', null), 'an allowed user elsewhere')
  assert.ok(policy.allowsMessage(ALICE, 'dmroom000000000', ALICE), 'a direct chat with an allowed user')
  assert.ok(!policy.allowsMessage(BOB, 'dmroom000000000', BOB), 'a direct chat with a stranger')
})

test('a room list that names something that is not a room fails up front', () => {
  assert.throws(() => new BotAccessPolicy({ rooms: ['the kitchen'] }), /not a room id or invite/)
})
