import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeInvite, decodeInvite } from '../src/ui/qr-core.js'

const KEY = 'a'.repeat(64) + ':' + 'b'.repeat(32)
const FROM = 'c'.repeat(64)

test('a contact link round-trips through encode and decode', () => {
  const link = encodeInvite({ kind: 'contact', name: 'Ada', key: KEY, from: FROM })
  const decoded = decodeInvite(link)

  assert.ok(decoded)
  assert.equal(decoded.kind, 'contact')
  assert.equal(decoded.from, FROM)
  assert.equal(decoded.key, KEY)
  assert.equal(decoded.name, 'Ada')
})

test('a room invite written before contact links still decodes as a room', () => {
  // The exact string older builds produced, and what every existing QR code out there holds.
  const legacy = `linda-pear://room?name=${encodeURIComponent('Team Chat')}&key=${KEY}`
  const decoded = decodeInvite(legacy)

  assert.ok(decoded)
  assert.equal(decoded.kind, 'room')
  assert.equal(decoded.from, undefined)
  assert.equal(decoded.key, KEY)
  assert.equal(decoded.name, 'Team Chat')
})

test('a contact link with no issuer falls back to being a room invite', () => {
  // Without a `from` there is nobody to record as a contact, so completing half the handshake
  // would leave a contact entry pointing at an identity we never learned.
  const decoded = decodeInvite(`linda-pear://contact?name=Ada&key=${KEY}`)

  assert.ok(decoded)
  assert.equal(decoded.kind, 'room')
  assert.equal(decoded.from, undefined)
})

test('names with characters that need escaping survive the round trip', () => {
  const name = 'Ada & Bob / #1'
  const decoded = decodeInvite(encodeInvite({ kind: 'contact', name, key: KEY, from: FROM }))

  assert.ok(decoded)
  assert.equal(decoded.name, name)
})

test('a bare key is not a link', () => {
  assert.equal(decodeInvite(KEY), null)
  assert.equal(decodeInvite(''), null)
})
