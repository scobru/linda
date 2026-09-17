import test from 'node:test'
import assert from 'node:assert/strict'
import {
  OPUS, PCM16, DEFAULT_AUDIO_CODEC, PREFERRED_AUDIO_CODECS,
  audioCodecSpec, audioCodecForFrameKind, encodeAudioCodecList,
  parseAudioCodecList, negotiateAudioCodec, readNegotiatedCodec
} from '../src/call/audio-codec.js'
import { AUDIO_PCM16_FRAME, AUDIO_OPUS_FRAME, VIDEO_FRAME } from '../src/call/call-encoding.js'

test('two peers that both speak Opus use it', () => {
  const offered = encodeAudioCodecList([OPUS, PCM16])
  assert.equal(negotiateAudioCodec(offered, [OPUS, PCM16]), OPUS)
})

test('a peer that predates negotiation gets PCM16 without either side checking a version', () => {
  // The whole compatibility story: an older build sends a shorter frame, so the decoder reads `''`.
  assert.equal(negotiateAudioCodec(undefined, [OPUS, PCM16]), PCM16)
  assert.equal(negotiateAudioCodec('', [OPUS, PCM16]), PCM16)

  // And the mirror: a new caller offering Opus to an answerer that cannot run it.
  assert.equal(negotiateAudioCodec(encodeAudioCodecList([OPUS, PCM16]), []), PCM16)
  assert.equal(negotiateAudioCodec(encodeAudioCodecList([OPUS]), [PCM16]), PCM16)
})

test('the floor is available even to an answerer that advertised nothing', () => {
  // PCM16 has no runtime requirement, so it is never absent from what we can answer with.
  assert.equal(negotiateAudioCodec(encodeAudioCodecList([PCM16]), []), PCM16)
})

test("the offerer's preference order decides among codecs both support", () => {
  // A caller on a metered link asking for the cheap codec first must be given it, even by an
  // answerer whose own order says otherwise.
  assert.equal(negotiateAudioCodec('pcm16,opus', [OPUS, PCM16]), PCM16)
  assert.equal(negotiateAudioCodec('opus,pcm16', [PCM16, OPUS]), OPUS)
})

test('codec names nobody knows are ignored rather than agreed to', () => {
  // A future build offering something this one has never heard of must not have its name echoed
  // back as if it were understood.
  assert.equal(negotiateAudioCodec('flac,opus', [OPUS]), OPUS)
  assert.equal(negotiateAudioCodec('flac', [OPUS]), PCM16)
  assert.equal(negotiateAudioCodec('opus', ['flac'] as string[]), PCM16)
  assert.equal(encodeAudioCodecList([OPUS, 'flac', PCM16]), 'opus,pcm16')
})

test('an offered list round trips through the one string field it travels in', () => {
  const field = encodeAudioCodecList([OPUS, PCM16])
  assert.equal(field, 'opus,pcm16')
  assert.deepEqual(parseAudioCodecList(field), [OPUS, PCM16])
  assert.deepEqual(parseAudioCodecList(' opus , pcm16 '), [OPUS, PCM16], 'whitespace is not a codec')
})

test('an empty or unreadable list reads as the floor, not as nothing', () => {
  assert.deepEqual(parseAudioCodecList(undefined), [DEFAULT_AUDIO_CODEC])
  assert.deepEqual(parseAudioCodecList(''), [DEFAULT_AUDIO_CODEC])
  assert.deepEqual(parseAudioCodecList('flac,speex'), [DEFAULT_AUDIO_CODEC])
})

test("the answer's chosen codec is read the same forgiving way", () => {
  assert.equal(readNegotiatedCodec('opus'), OPUS)
  assert.equal(readNegotiatedCodec(''), PCM16, 'an older answerer said nothing')
  assert.equal(readNegotiatedCodec(undefined), PCM16)
  assert.equal(readNegotiatedCodec('flac'), PCM16, 'a codec we do not know is not one we will speak')
})

test('each codec owns a distinct frame kind, and video is not one of them', () => {
  assert.equal(audioCodecSpec(PCM16).frameKind, AUDIO_PCM16_FRAME)
  assert.equal(audioCodecSpec(OPUS).frameKind, AUDIO_OPUS_FRAME)
  assert.notEqual(AUDIO_PCM16_FRAME, AUDIO_OPUS_FRAME)

  assert.equal(audioCodecForFrameKind(AUDIO_PCM16_FRAME)?.name, PCM16)
  assert.equal(audioCodecForFrameKind(AUDIO_OPUS_FRAME)?.name, OPUS)
  assert.equal(audioCodecForFrameKind(VIDEO_FRAME), null)
  assert.equal(audioCodecForFrameKind(99), null, 'a kind from a future build is not audio we can play')
})

test('the kinds already on the wire keep the values every installed build assigned them', () => {
  // Nothing may renumber these: they are fixed by every build already out there, and a frame is
  // just a number and some bytes.
  assert.equal(AUDIO_PCM16_FRAME, 0)
  assert.equal(VIDEO_FRAME, 1)
})

test('an unknown codec name falls back to a spec that works rather than to undefined', () => {
  const spec = audioCodecSpec('flac')
  assert.equal(spec.name, PCM16)
  assert.ok(spec.sampleRate > 0 && spec.frameSamples > 0)
})

test('Opus packetises at a duration it is actually allowed to code', () => {
  const spec = audioCodecSpec(OPUS)
  const durationMs = (spec.frameSamples / spec.sampleRate) * 1000
  assert.ok(
    [2.5, 5, 10, 20, 40, 60].includes(durationMs),
    `${durationMs}ms is not an Opus frame duration`
  )
})

test('Opus is preferred over the raw floor, and both are listed', () => {
  assert.deepEqual([...PREFERRED_AUDIO_CODECS], [OPUS, PCM16])
  assert.equal(PREFERRED_AUDIO_CODECS.indexOf(OPUS) < PREFERRED_AUDIO_CODECS.indexOf(PCM16), true)
})
