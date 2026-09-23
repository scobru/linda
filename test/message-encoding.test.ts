import test from 'node:test'
import assert from 'node:assert/strict'
import * as cenc from 'compact-encoding'
import type { Encoding } from 'compact-encoding'
import b4a from 'b4a'
import { messageEncoding } from '../src/network/message-encoding.js'
import {
  typingEncoding,
  presenceEncoding,
  readReceiptEncoding,
  requestWriteEncoding,
  roomKeyEncoding,
  roomAnnounceEncoding,
  contactRequestEncoding,
  contactResponseEncoding
} from '../src/network/encoding.js'
import {
  callOfferEncoding,
  callAnswerEncoding,
  callEndEncoding,
  callControlEncoding,
  mediaFrameEncoding
} from '../src/call/call-encoding.js'

// The wire had no round-trip test at all: thirteen messages, each three hand-written functions
// that had to agree on a field list nothing checked. A field added to the encoder and forgotten in
// the decoder writes bytes nobody reads, shifting every field after it — silently, and only
// between two peers on different builds.

function roundTrip<T>(encoding: Encoding<T>, message: T): T {
  return cenc.decode(encoding, cenc.encode(encoding, message))
}

test('every chat message survives a round trip with its values intact', () => {
  assert.deepEqual(
    roundTrip(typingEncoding, { roomId: 'r1', userId: 'u1', typing: true }),
    { roomId: 'r1', userId: 'u1', typing: true }
  )

  assert.deepEqual(
    roundTrip(presenceEncoding, { userId: 'u1', online: true, nickname: 'Ada', avatar: 'data:x' }),
    // A person: no bot profile, which the wire reads back as the empty string, like any absent
    // trailing field.
    { userId: 'u1', online: true, nickname: 'Ada', avatar: 'data:x', bot: '' }
  )

  assert.deepEqual(
    roundTrip(readReceiptEncoding, { roomId: 'r1', userId: 'u1', messageId: 'm1' }),
    { roomId: 'r1', userId: 'u1', messageId: 'm1' }
  )

  assert.deepEqual(
    roundTrip(requestWriteEncoding, {
      bootstrapKey: 'bk', writerKey: 'wk', identityId: 'id', inviteCode: 'code'
    }),
    { bootstrapKey: 'bk', writerKey: 'wk', identityId: 'id', inviteCode: 'code' }
  )

  assert.deepEqual(
    roundTrip(roomKeyEncoding, { roomId: 'r1', epoch: 7, key: 'deadbeef' }),
    { roomId: 'r1', epoch: 7, key: 'deadbeef' }
  )

  assert.deepEqual(
    roundTrip(roomAnnounceEncoding, {
      roomId: 'r1', name: 'Room', bootstrapKey: 'bk', authorId: 'a1',
      inviteCode: 'code', avatar: 'av', description: 'desc'
    }),
    {
      roomId: 'r1', name: 'Room', bootstrapKey: 'bk', authorId: 'a1',
      inviteCode: 'code', avatar: 'av', description: 'desc'
    }
  )

  assert.deepEqual(
    roundTrip(contactRequestEncoding, { fromId: 'f1', nickname: 'Ada', avatar: 'av' }),
    { fromId: 'f1', nickname: 'Ada', avatar: 'av' }
  )

  assert.deepEqual(
    roundTrip(contactResponseEncoding, {
      fromId: 'f1', accepted: true, roomId: 'r1', name: 'Room',
      bootstrapKey: 'bk', inviteCode: 'code', avatar: 'av'
    }),
    {
      fromId: 'f1', accepted: true, roomId: 'r1', name: 'Room',
      bootstrapKey: 'bk', inviteCode: 'code', avatar: 'av'
    }
  )
})

test('every call message survives a round trip with its values intact', () => {
  // The codec fields are trailing optionals, so a message built without them encodes as `''` and
  // decodes as `''` — which `audio-codec.ts` reads as the floor. That is the whole mechanism by
  // which a peer predating codec negotiation keeps working.
  assert.deepEqual(
    roundTrip(callOfferEncoding, { callId: 'c1', fromId: 'f1', roomId: 'r1', audio: true, video: false }),
    { callId: 'c1', fromId: 'f1', roomId: 'r1', audio: true, video: false, audioCodecs: '' }
  )

  assert.deepEqual(
    roundTrip(callOfferEncoding, {
      callId: 'c1', fromId: 'f1', roomId: 'r1', audio: true, video: false, audioCodecs: 'opus,pcm16'
    }),
    { callId: 'c1', fromId: 'f1', roomId: 'r1', audio: true, video: false, audioCodecs: 'opus,pcm16' }
  )

  assert.deepEqual(
    roundTrip(callAnswerEncoding, { callId: 'c1', fromId: 'f1', accepted: false }),
    { callId: 'c1', fromId: 'f1', accepted: false, audioCodec: '' }
  )

  assert.deepEqual(
    roundTrip(callAnswerEncoding, { callId: 'c1', fromId: 'f1', accepted: true, audioCodec: 'opus' }),
    { callId: 'c1', fromId: 'f1', accepted: true, audioCodec: 'opus' }
  )

  assert.deepEqual(
    roundTrip(callEndEncoding, { callId: 'c1', fromId: 'f1', reason: 'busy' }),
    { callId: 'c1', fromId: 'f1', reason: 'busy' }
  )

  assert.deepEqual(
    roundTrip(callControlEncoding, { callId: 'c1', fromId: 'f1', action: 'camera-off' }),
    { callId: 'c1', fromId: 'f1', action: 'camera-off' }
  )
})

test('a media frame keeps its bytes, including the ones that look like delimiters', () => {
  const payload = new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x0a, 0x7f, 0x80, 0xff])
  const decoded = roundTrip(mediaFrameEncoding, {
    callId: 'c1', seq: 42, timestamp: 1_700_000_000, kind: 1, keyframe: true, payload
  })

  assert.equal(decoded.callId, 'c1')
  assert.equal(decoded.seq, 42)
  assert.equal(decoded.timestamp, 1_700_000_000)
  assert.equal(decoded.kind, 1)
  assert.equal(decoded.keyframe, true)
  assert.deepEqual([...decoded.payload], [...payload])
})

test('an empty media payload is not mistaken for a missing one', () => {
  const decoded = roundTrip(mediaFrameEncoding, {
    callId: 'c1', seq: 0, timestamp: 0, kind: 0, keyframe: false, payload: new Uint8Array(0)
  })
  assert.equal(decoded.payload.byteLength, 0)
})

test('unicode and empty strings survive', () => {
  const decoded = roundTrip(presenceEncoding, {
    userId: '', online: false, nickname: 'Ada 👩‍💻 Lovelace — naïve', avatar: ''
  })
  assert.equal(decoded.nickname, 'Ada 👩‍💻 Lovelace — naïve')
  assert.equal(decoded.userId, '')
  assert.equal(decoded.avatar, '')
})

test('an omitted optional field encodes as empty rather than breaking the frame', () => {
  // The sender has no avatar. Every field after it must still decode, which is the whole reason
  // the encoder substitutes '' instead of skipping the field.
  const decoded = roundTrip(contactResponseEncoding, {
    fromId: 'f1', accepted: true, roomId: 'r1', name: 'Room', bootstrapKey: 'bk', inviteCode: 'code'
  })
  assert.equal(decoded.avatar, '')
  assert.equal(decoded.inviteCode, 'code')
})

test('a frame from a peer that predates an optional field still decodes', () => {
  // This is the compatibility rule the four hand-written decoders each wrapped in a try/catch.
  // An older peer sends a shorter frame: the fields it knows, and nothing after them.
  const older = messageEncoding<{ fromId: string; nickname: string }>([
    ['fromId', 'string'],
    ['nickname', 'string']
  ])
  const shortFrame = cenc.encode(older, { fromId: 'f1', nickname: 'Ada' })

  const decoded = cenc.decode(contactRequestEncoding, shortFrame)
  assert.deepEqual(decoded, { fromId: 'f1', nickname: 'Ada', avatar: '' })
})

test('two trailing optionals degrade one at a time', () => {
  // A peer that has the avatar but not the description must still deliver the avatar: the frame
  // simply ends after it.
  const middleAged = messageEncoding<Omit<Parameters<typeof roomAnnounceEncoding.encode>[1], 'description'>>([
    ['roomId', 'string'],
    ['name', 'string'],
    ['bootstrapKey', 'string'],
    ['authorId', 'string'],
    ['inviteCode', 'string'],
    ['avatar', 'optionalString']
  ])
  const frame = cenc.encode(middleAged, {
    roomId: 'r1', name: 'Room', bootstrapKey: 'bk', authorId: 'a1', inviteCode: 'code', avatar: 'av'
  })

  const decoded = cenc.decode(roomAnnounceEncoding, frame)
  assert.equal(decoded.avatar, 'av', 'the field the older peer did send')
  assert.equal(decoded.description, '', 'the field it did not')
})

test('a newer peer sending an extra trailing field does not corrupt the known ones', () => {
  const newer = messageEncoding<{ roomId: string; userId: string; messageId: string; extra?: string }>([
    ['roomId', 'string'],
    ['userId', 'string'],
    ['messageId', 'string'],
    ['extra', 'optionalString']
  ])
  const frame = cenc.encode(newer, { roomId: 'r1', userId: 'u1', messageId: 'm1', extra: 'future' })

  assert.deepEqual(
    cenc.decode(readReceiptEncoding, frame),
    { roomId: 'r1', userId: 'u1', messageId: 'm1' }
  )
})

test('optional fields must be declared last', () => {
  // Positional fields: an optional in the middle would strand a required field mid-read on an
  // older peer's short frame, rather than at the boundary. Better to refuse at startup.
  assert.throws(
    () => messageEncoding<{ a?: string; b: string }>([['a', 'optionalString'], ['b', 'string']]),
    /optionalString fields must come last/
  )
})

test('the derived codec is byte-identical to the hand-written one it replaced', () => {
  // The frames are what other builds already speak, so the change has to be invisible on the wire.
  // This is the previous roomKeyEncoding, transcribed.
  const handWritten: Encoding<{ roomId: string; epoch: number; key: string }> = {
    preencode(state, m) {
      cenc.string.preencode(state, m.roomId)
      cenc.uint.preencode(state, m.epoch)
      cenc.string.preencode(state, m.key)
    },
    encode(state, m) {
      cenc.string.encode(state, m.roomId)
      cenc.uint.encode(state, m.epoch)
      cenc.string.encode(state, m.key)
    },
    decode(state) {
      return {
        roomId: cenc.string.decode(state),
        epoch: cenc.uint.decode(state),
        key: cenc.string.decode(state)
      }
    }
  }

  const message = { roomId: 'r1', epoch: 7, key: 'deadbeef' }
  assert.ok(b4a.equals(cenc.encode(roomKeyEncoding, message), cenc.encode(handWritten, message)))

  // …and the same for one carrying an optional field, where the `?? ''` substitution lives.
  const handWrittenContact: Encoding<{ fromId: string; nickname: string; avatar?: string }> = {
    preencode(state, m) {
      cenc.string.preencode(state, m.fromId)
      cenc.string.preencode(state, m.nickname)
      cenc.string.preencode(state, m.avatar ?? '')
    },
    encode(state, m) {
      cenc.string.encode(state, m.fromId)
      cenc.string.encode(state, m.nickname)
      cenc.string.encode(state, m.avatar ?? '')
    },
    decode: () => ({ fromId: '', nickname: '' })
  }

  const contact = { fromId: 'f1', nickname: 'Ada' }
  assert.ok(
    b4a.equals(cenc.encode(contactRequestEncoding, contact), cenc.encode(handWrittenContact, contact))
  )
})
