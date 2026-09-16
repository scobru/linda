import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import b4a from 'b4a'
import { sourceFiles } from './source-scan.js'
import { packFrame, unpackFrame } from '../src/transport/frame.js'

// ---------------------------------------------------------------------------
// The frame both runtimes use to talk to their backend, which existed in two copies: the desktop
// read `src/transport/frame.ts` and mobile read `mobile/src/bare/frame.ts`, sixteen lines that had
// already drifted apart in two places. Neither drift changed a byte — but nothing on either bridge
// negotiates a version, so the first one that did would be an unparseable frame on one runtime and
// a session that never answers, with no error naming the format.
//
// The layout is pinned here byte by byte rather than round-tripped, because a round-trip passes
// just as happily against a codec that has changed on both sides at once.
// ---------------------------------------------------------------------------

test('the frame is a 4-byte little-endian header length, the header, then the tail', () => {
  const packed = packFrame({ ok: true }, b4a.from([0xde, 0xad]))
  const json = '{"ok":true}'

  assert.equal(packed[0], json.length)
  assert.equal(packed[1], 0)
  assert.equal(packed[2], 0)
  assert.equal(packed[3], 0)
  assert.equal(b4a.toString(packed.subarray(4, 4 + json.length), 'utf8'), json)
  assert.deepEqual([...packed.subarray(4 + json.length)], [0xde, 0xad])
  assert.equal(packed.byteLength, 4 + json.length + 2)
})

test('a header past 255 bytes still fits the prefix, low byte first', () => {
  // The one place endianness is observable without a second runtime to disagree with.
  const header = { pad: 'x'.repeat(300) }
  const jsonLen = b4a.byteLength(JSON.stringify(header), 'utf8')
  const packed = packFrame(header)

  assert.ok(jsonLen > 255, `expected a multi-byte length, got ${jsonLen}`)
  assert.equal(packed[0], jsonLen & 0xff)
  assert.equal(packed[1], jsonLen >> 8)
  assert.deepEqual(unpackFrame(packed).header, header)
})

test('a frame read out of a pooled buffer reads its own prefix, not its neighbour', () => {
  // This is what the byte offset in `unpackFrame` is for. A socket hands over a `Buffer`, which is
  // a window into a shared ~8 KB pool: `buf.buffer` alone starts at byte zero of that pool, which
  // is whatever was allocated before this frame. Dropping the offset here reads a length from
  // somebody else's bytes and the JSON.parse fails on a frame that is perfectly well formed.
  const header = { method: 'session.sendMessage', args: ['room', 'hi'] }
  const packed = packFrame(header, b4a.from('tail', 'utf8'))

  const pool = b4a.allocUnsafe(8192)
  const offset = 4848
  pool.fill(0xff, 0, offset) // a neighbour's bytes, which would decode as a 4-gigabyte header
  const framed = pool.subarray(offset, offset + packed.byteLength)
  framed.set(packed)

  assert.notEqual(framed.byteOffset, 0, 'the fixture must be a view into the pool, not a fresh buffer')
  const unpacked = unpackFrame(framed)
  assert.deepEqual(unpacked.header, header)
  assert.equal(b4a.toString(unpacked.binary, 'utf8'), 'tail')
})

test('an empty binary tail is the same frame as no tail at all', () => {
  // The two copies wrote this condition differently (`binary.byteLength > 0` against
  // `binary.byteLength`). They agreed, and now there is one of them.
  const header = { method: 'noop' }
  assert.deepEqual([...packFrame(header, new Uint8Array(0))], [...packFrame(header)])
  assert.equal(unpackFrame(packFrame(header)).binary.byteLength, 0)
})

test('there is one frame codec, and both bridges import it', () => {
  // The duplicate is gone; this is what keeps the next one from being written. A runtime that
  // wants a frame imports this module — it does not define `packFrame` for itself.
  const definers = sourceFiles().filter((file) => /function packFrame\b/.test(fs.readFileSync(file, 'utf8')))
  assert.deepEqual(definers, ['src/transport/frame.ts'])

  // And both backends are still wired to it, so the check above cannot pass by nobody using it.
  for (const importer of ['src/worker/dispatcher.ts', 'mobile/src/bare/client.ts', 'mobile/worklet/entry.ts']) {
    const source = fs.readFileSync(importer, 'utf8')
    assert.match(source, /import \{ packFrame, unpackFrame \} from '[^']*(transport\/frame|@core\/transport\/frame)/, `${importer} no longer imports the shared frame codec`)
  }
})
