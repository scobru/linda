import test from 'node:test'
import assert from 'node:assert/strict'
import {
  attachmentKind,
  isAudio,
  isImage,
  isVideo,
  isVoiceMessage,
  voiceMessageName
} from '../src/rooms/attachment-kind.js'
import { canDeleteMessage, composerBlock, countHashtags, isRoomUnread, survivingHashtag } from '../src/rooms/room-rules.js'

// These rules were written twice, once per platform, and nothing ran either copy: `app-shell.ts`
// needs a DOM and the mobile screens need a device, so both were beyond the suite's reach. Pulled
// out as plain functions they are ordinary unit tests.

test('attachment kinds agree across every extension the two platforms accepted', () => {
  for (const name of ['a.png', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.svg', 'a.bmp']) {
    assert.equal(attachmentKind({ name }), 'image', name)
  }
  for (const name of ['a.mp3', 'a.wav', 'a.ogg', 'a.m4a', 'a.aac', 'a.flac', 'a.opus']) {
    assert.equal(attachmentKind({ name }), 'audio', name)
  }
  for (const name of ['a.mp4', 'a.m4v', 'a.mov', 'a.webm', 'a.mkv', 'a.avi']) {
    assert.equal(attachmentKind({ name }), 'video', name)
  }
  for (const name of ['a.zip', 'a.tar', 'a.gz', 'a.7z', 'a.rar']) {
    assert.equal(attachmentKind({ name }), 'archive', name)
  }
  assert.equal(attachmentKind({ name: 'a.pdf' }), 'pdf')
  assert.equal(attachmentKind({ name: 'notes.txt' }), 'other')
})

test('the extensions the files tabs used to miss are classified like the chat views', () => {
  // The defect this module removes: `.aac` had a play button in the chat and a document icon in
  // the files tab, on both platforms, because the two regexes disagreed.
  for (const name of ['clip.aac', 'clip.opus']) assert.equal(attachmentKind({ name }), 'audio', name)
  for (const name of ['clip.m4v', 'clip.avi']) assert.equal(attachmentKind({ name }), 'video', name)
  assert.equal(attachmentKind({ name: 'shot.bmp' }), 'image')
})

test('MIME type wins over a misleading extension', () => {
  assert.equal(attachmentKind({ name: 'recording.dat', mimeType: 'audio/mpeg' }), 'audio')
  assert.equal(attachmentKind({ name: 'clip.dat', mimeType: 'video/mp4' }), 'video')
  assert.equal(attachmentKind({ name: 'scan.dat', mimeType: 'application/pdf' }), 'pdf')
})

test('a poster thumbnail never turns a video into an image', () => {
  const clip = { name: 'holiday.mp4', mimeType: 'video/mp4', thumbnail: 'data:image/jpeg;base64,/9j/' }
  assert.equal(attachmentKind(clip), 'video')
  assert.ok(isVideo(clip))
  assert.ok(!isImage(clip))

  // …while a thumbnail with nothing else to go on is the sender telling us it is a picture.
  assert.equal(attachmentKind({ name: 'blob', thumbnail: 'data:image/jpeg;base64,/9j/' }), 'image')
  assert.equal(attachmentKind({ name: 'blob' }), 'other')
})

test('case does not matter', () => {
  assert.ok(isImage({ name: 'PHOTO.JPG' }))
  assert.ok(isAudio({ name: 'Voice.M4A' }))
  assert.ok(isVideo({ name: 'MOVIE.MOV' }))
})

test('the voice-message name is written and read by the same module', () => {
  const at = new Date('2026-09-14T21:22:23.456Z')
  const name = voiceMessageName('m4a', at)

  assert.equal(name, 'voice-2026-09-14T21-22-23-456Z.m4a')
  assert.ok(isVoiceMessage({ name }), 'the detector recognises what the producer writes')
  assert.equal(attachmentKind({ name }), 'audio', 'a voice message is still an audio attachment')

  for (const ext of ['webm', 'ogg', 'm4a']) {
    assert.ok(isVoiceMessage({ name: voiceMessageName(ext, at) }), ext)
  }

  assert.ok(!isVoiceMessage({ name: 'voice-memo.m4a' }), 'the year is what makes it ours')
  assert.ok(!isVoiceMessage({ name: 'my-voice-2026-09-14.m4a' }))
})

test('authors delete their own messages; owners and moderators delete anyone s', () => {
  const mine = { authorId: 'me' }
  const theirs = { authorId: 'them' }
  const plain = { identityId: 'me', isOwner: false, isModerator: false }

  assert.ok(canDeleteMessage(mine, plain), 'own message')
  assert.ok(!canDeleteMessage(theirs, plain), 'someone else s, as a plain member')

  // The mobile copy stopped here, at owner-only, and hid a capability moderators actually have.
  assert.ok(canDeleteMessage(theirs, { ...plain, isOwner: true }))
  assert.ok(canDeleteMessage(theirs, { ...plain, isModerator: true }))
})

test('hashtags are counted over live messages, most used first', () => {
  const messages = [
    { body: 'buy milk #todo' },
    { body: 'and eggs #todo #shopping' },
    { body: 'gone #todo', deleted: true },
    { body: 'read this #articles' }
  ]

  assert.deepEqual(countHashtags(messages), [
    ['todo', 2],
    ['articles', 1],
    ['shopping', 1]
  ])
})

test('a selected hashtag survives only while the room still has it', () => {
  const tags: [string, number][] = [['todo', 2], ['shopping', 1]]

  assert.equal(survivingHashtag('todo', tags), 'todo')
  assert.equal(survivingHashtag('gone', tags), null, 'its last message was deleted or cleared')
  assert.equal(survivingHashtag(null, tags), null)
  assert.equal(survivingHashtag('todo', []), null)
})

// ---------------------------------------------------------------------------
// The composer ladder. Both shells had one and they disagreed on the order, so the same room
// explained itself differently depending on the device — and each order hid a case the other
// showed. These are the rungs, and the two mistakes.
// ---------------------------------------------------------------------------

const open = {
  banned: false, muted: false, broadcast: false, canModerate: false,
  hasKey: true, writable: true, isAdmin: false
}

test('a room you can post in blocks nothing', () => {
  assert.equal(composerBlock(open), null)
})

test('keys still arriving are not a refusal of access', () => {
  // Mobile tested `!writable || !hasKey` first and called it "You do not have write access to this
  // room yet". On a fresh join that is a few seconds of key exchange, so the member was told their
  // access was denied and to go ask for something they already had.
  const block = composerBlock({ ...open, hasKey: false })
  assert.equal(block?.kind, 'waiting-key')
  assert.match(block!.text, /Waiting for room encryption keys/)
})

test('a ban says so, in a room that is not a broadcast room', () => {
  // Desktop had no rung for it, and `Room.canPost()` is false for a banned member, so a ban came
  // out as "Only admins can send messages in this broadcast room" — in an ordinary room.
  const block = composerBlock({ ...open, banned: true })
  assert.equal(block?.kind, 'banned')
  assert.doesNotMatch(block!.text, /broadcast/)
})

test('what was decided about you outranks what is still in flight', () => {
  // A muted member whose keys have not arrived is still muted once they do. Naming the transient
  // state first means the message changes into another message rather than into a composer.
  assert.equal(composerBlock({ ...open, muted: true, hasKey: false, writable: false })?.kind, 'muted')
  assert.equal(composerBlock({ ...open, banned: true, muted: true })?.kind, 'banned')
})

test('a broadcast room blocks members and lets moderators through', () => {
  assert.equal(composerBlock({ ...open, broadcast: true })?.kind, 'broadcast')
  assert.equal(composerBlock({ ...open, broadcast: true, canModerate: true }), null)
})

test('an admin waiting on write access is syncing, not refused', () => {
  // An admin already has the right; what is missing is a peer to replicate it from. Telling them
  // they lack access points at a fix that does not exist.
  assert.equal(composerBlock({ ...open, writable: false, isAdmin: true })?.kind, 'syncing')
  assert.equal(composerBlock({ ...open, writable: false })?.kind, 'no-access')
})

test('every rung carries a sentence a user can act on', () => {
  const states = [
    { ...open, banned: true },
    { ...open, muted: true },
    { ...open, broadcast: true },
    { ...open, hasKey: false },
    { ...open, writable: false, isAdmin: true },
    { ...open, writable: false }
  ]
  const kinds = states.map((state) => composerBlock(state)?.kind)
  assert.deepEqual(kinds, ['banned', 'muted', 'broadcast', 'waiting-key', 'syncing', 'no-access'])
  for (const state of states) assert.ok((composerBlock(state)?.text.length ?? 0) > 10)
})

// ---------------------------------------------------------------------------
// The unread rule, which was written four times and agreed on three of them.
// ---------------------------------------------------------------------------

test('a room is unread when its newest message postdates the last look', () => {
  assert.equal(isRoomUnread({ id: 'r1', lastMessageTime: 200, lastReadAt: 100 }, null), true)
  assert.equal(isRoomUnread({ id: 'r1', lastMessageTime: 100, lastReadAt: 200 }, null), false)
})

test('a room nobody has written in is not unread, however long ago you looked', () => {
  assert.equal(isRoomUnread({ id: 'r1', lastReadAt: 0 }, null), false)
  assert.equal(isRoomUnread({ id: 'r1', lastMessageTime: null, lastReadAt: null }, null), false)
})

test('a room never opened is unread as soon as it has a message', () => {
  assert.equal(isRoomUnread({ id: 'r1', lastMessageTime: 1 }, null), true)
})

test('the room you are reading is not unread', () => {
  // Only the desktop excluded it. On the phone a message arriving in the conversation you had
  // open bumped the app-icon badge while you were looking at the message.
  assert.equal(isRoomUnread({ id: 'r1', lastMessageTime: 200, lastReadAt: 100 }, 'r1'), false)
  assert.equal(isRoomUnread({ id: 'r1', lastMessageTime: 200, lastReadAt: 100 }, 'r2'), true)
})
