import test from 'node:test'
import assert from 'node:assert/strict'
import { peerAvatar, peerName } from '../src/app/peer-display.js'

// ---------------------------------------------------------------------------
// The app holds up to three versions of a peer's name and picture: what presence says now, the
// last presence it persisted, and a snapshot copied when the contact was made. Every surface that
// shows a peer picked its own order over those three, and they did not agree — so a contact who
// renamed themselves was current on one screen and stale on the next, in the same app.
// ---------------------------------------------------------------------------

const ID = 'ab12cd34ef567890'

test('presence wins over the snapshot taken when the contact was made', () => {
  // Mobile's contacts screen showed the snapshot, so a renamed contact never changed there.
  assert.equal(peerName(ID, { live: 'Ada Lovelace', snapshot: 'ada' }), 'Ada Lovelace')
  assert.equal(peerAvatar({ live: 'data:new', snapshot: 'data:old' }), 'data:new')
})

test('the stored value covers the gap before that peer reconnects', () => {
  // Between a restart and the peer's next presence, `live` is empty and the snapshot is older
  // still — what was persisted from the last presence is the best thing known.
  assert.equal(peerName(ID, { stored: 'Ada Lovelace', snapshot: 'ada' }), 'Ada Lovelace')
  assert.equal(peerAvatar({ stored: 'data:stored', snapshot: 'data:old' }), 'data:stored')
})

test('the snapshot is used when it is all there is', () => {
  assert.equal(peerName(ID, { snapshot: 'ada' }), 'ada')
  assert.equal(peerAvatar({ snapshot: 'data:old' }), 'data:old')
})

test('a blank snapshot does not win over nothing — it falls through', () => {
  // The snapshot is blank whenever the other side had not set a nickname yet, which is most of
  // them: it must not shadow the id fallback, or the row renders empty.
  assert.equal(peerName(ID, { snapshot: '' }), 'ab12cd34')
  assert.equal(peerName(ID, { live: '', stored: '', snapshot: '' }), 'ab12cd34')
  assert.equal(peerName(ID, {}), 'ab12cd34')
  assert.equal(peerName(ID, { live: null, snapshot: null }), 'ab12cd34')
})

test('no picture at all is undefined, so the caller can draw a generated one', () => {
  assert.equal(peerAvatar({}), undefined)
  assert.equal(peerAvatar({ live: '', stored: null, snapshot: '' }), undefined)
})

test('an empty live value falls through to the stored one rather than blanking the row', () => {
  // Presence with no nickname set is a real message, and it arrives with an empty string.
  assert.equal(peerName(ID, { live: '', stored: 'Ada', snapshot: 'ada' }), 'Ada')
  assert.equal(peerAvatar({ live: '', stored: 'data:stored' }), 'data:stored')
})
