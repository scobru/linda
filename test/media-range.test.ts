import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { planRange, rangeHeaders, mimeFromName } from '../src/files/media-range.js'
import { createMediaHandler, mediaPath } from '../src/files/media-server.js'

test('no Range header serves the whole file', () => {
  assert.deepEqual(planRange(undefined, 1000), { status: 200, range: { start: 0, end: 999 } })
})

test('open and closed ranges', () => {
  assert.deepEqual(planRange('bytes=0-499', 1000), { status: 206, range: { start: 0, end: 499 } })
  assert.deepEqual(planRange('bytes=500-', 1000), { status: 206, range: { start: 500, end: 999 } })
  // Players guess at chunk sizes and routinely overshoot the end; that is a clamp, not an error.
  assert.deepEqual(planRange('bytes=900-9999', 1000), { status: 206, range: { start: 900, end: 999 } })
})

test('a suffix range counts back from the end', () => {
  assert.deepEqual(planRange('bytes=-100', 1000), { status: 206, range: { start: 900, end: 999 } })
  // Larger than the file: still just the whole file, not a negative start.
  assert.deepEqual(planRange('bytes=-5000', 1000), { status: 206, range: { start: 0, end: 999 } })
})

test('unsatisfiable ranges', () => {
  assert.deepEqual(planRange('bytes=1000-', 1000), { status: 416 })
  assert.deepEqual(planRange('bytes=500-499', 1000), { status: 416 })
  assert.deepEqual(planRange('bytes=-0', 1000), { status: 416 })
})

test('anything unparseable falls back to the whole file', () => {
  assert.equal(planRange('bytes=abc-def', 1000).status, 200)
  // Multi-range: legal HTTP, answered whole rather than as multipart/byteranges.
  assert.equal(planRange('bytes=0-99, 200-299', 1000).status, 200)
  assert.equal(planRange('seconds=0-10', 1000).status, 200)
})

test('an empty file is never partial content', () => {
  assert.deepEqual(planRange('bytes=0-100', 0), { status: 200, range: { start: 0, end: 0 } })
  assert.equal(rangeHeaders(planRange('bytes=0-100', 0), 0, 'video/mp4')['Content-Length'], '0')
})

test('headers describe the slice being sent', () => {
  const size = 1000
  const partial = rangeHeaders(planRange('bytes=200-299', size), size, 'video/mp4')
  assert.equal(partial['Content-Range'], 'bytes 200-299/1000')
  assert.equal(partial['Content-Length'], '100')
  assert.equal(partial['Accept-Ranges'], 'bytes')

  const full = rangeHeaders(planRange(undefined, size), size, 'video/mp4')
  assert.equal(full['Content-Range'], undefined)
  assert.equal(full['Content-Length'], '1000')

  assert.equal(rangeHeaders({ status: 416 }, size, 'video/mp4')['Content-Range'], 'bytes */1000')
})

test('content type comes from the extension', () => {
  assert.equal(mimeFromName('clip.MP4'), 'video/mp4')
  assert.equal(mimeFromName('/room/123-song.m4a'), 'audio/mp4')
  assert.equal(mimeFromName('notes.txt'), 'application/octet-stream')
  assert.equal(mimeFromName('noextension'), 'application/octet-stream')
})

// --- the request handler, against a stub source (no corestore involved) -------------------

const DRIVE_KEY = 'a'.repeat(64)
const source = {
  statFile: async (_key: string, path: string) => (path === '/room/clip.mp4' ? { size: 1000 } : null),
  createFileStream: async () => Readable.from(['x'])
}

test('the handler serves only its own token', async () => {
  const handle = createMediaHandler(source, 'sekret')
  const ok = await handle(mediaPath('sekret', DRIVE_KEY, '/room/clip.mp4'))
  assert.equal(ok.status, 200)
  assert.equal(ok.headers['Content-Type'], 'video/mp4')

  // A wrong token is indistinguishable from a wrong path: both 404.
  const wrongToken = await handle(mediaPath('guessed', DRIVE_KEY, '/room/clip.mp4'))
  assert.equal(wrongToken.status, 404)
  assert.equal(wrongToken.stream, undefined)
  const missing = await handle(mediaPath('sekret', DRIVE_KEY, '/room/gone.mp4'))
  assert.equal(missing.status, 404)
})

test('the handler rejects anything that is not a drive key', async () => {
  const handle = createMediaHandler(source, 'sekret')
  assert.equal((await handle(`/sekret/../../etc/passwd`)).status, 404)
  assert.equal((await handle(`/sekret/${DRIVE_KEY}`)).status, 404)
  assert.equal((await handle('/')).status, 404)
})

test('the handler turns a Range header into a partial response', async () => {
  const handle = createMediaHandler(source, 'sekret')
  const partial = await handle(mediaPath('sekret', DRIVE_KEY, '/room/clip.mp4'), 'bytes=100-199')
  assert.equal(partial.status, 206)
  assert.equal(partial.headers['Content-Range'], 'bytes 100-199/1000')
  assert.ok(partial.stream)

  const past = await handle(mediaPath('sekret', DRIVE_KEY, '/room/clip.mp4'), 'bytes=5000-')
  assert.equal(past.status, 416)
  assert.equal(past.stream, undefined)
})
