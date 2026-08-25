import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import b4a from 'b4a'
import { LocalMediaServer } from '../src/files/media-server-node.js'

/**
 * End-to-end over a real Hyperdrive and a real socket: the parts a unit test of the range
 * arithmetic cannot reach — that hyperblobs interprets `{ start, end }` the way HTTP means it,
 * and that the bytes come back off the wire unshifted.
 */

const CONTENT = b4a.from(Array.from({ length: 100_000 }, (_, i) => i % 251))

async function serveOneDrive(): Promise<{ server: LocalMediaServer; driveKey: string; close: () => Promise<void> }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-pear-media-test-'))
  const store = new Corestore(dir)
  const drive = new Hyperdrive(store)
  await drive.ready()
  await drive.put('/room/clip.mp4', CONTENT)

  const driveKey = b4a.toString(drive.key, 'hex')
  const server = await LocalMediaServer.start({
    statFile: async (_key, filePath) => {
      const entry = await drive.entry(filePath)
      const size = entry?.value.blob?.byteLength
      return typeof size === 'number' ? { size } : null
    },
    createFileStream: async (_key, filePath, range) => drive.createReadStream(filePath, range)
  })

  return {
    server,
    driveKey,
    close: async () => {
      server.close()
      await drive.close()
      await store.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
}

test('serves whole files and exact byte ranges over HTTP', async () => {
  const { server, driveKey, close } = await serveOneDrive()
  try {
    const url = server.url(driveKey, '/room/clip.mp4')

    const whole = await fetch(url)
    assert.equal(whole.status, 200)
    assert.equal(whole.headers.get('content-type'), 'video/mp4')
    assert.equal(whole.headers.get('accept-ranges'), 'bytes')
    assert.deepEqual(b4a.from(await whole.arrayBuffer()), CONTENT)

    // The request a player makes when the user scrubs to the middle.
    const middle = await fetch(url, { headers: { Range: 'bytes=50000-50099' } })
    assert.equal(middle.status, 206)
    assert.equal(middle.headers.get('content-range'), 'bytes 50000-50099/100000')
    assert.deepEqual(b4a.from(await middle.arrayBuffer()), CONTENT.subarray(50000, 50100))

    // Open-ended, and the suffix form some players use to probe the trailing metadata.
    const tail = await fetch(url, { headers: { Range: 'bytes=99990-' } })
    assert.equal(tail.status, 206)
    assert.deepEqual(b4a.from(await tail.arrayBuffer()), CONTENT.subarray(99990))

    const suffix = await fetch(url, { headers: { Range: 'bytes=-10' } })
    assert.equal(suffix.status, 206)
    assert.deepEqual(b4a.from(await suffix.arrayBuffer()), CONTENT.subarray(99990))

    const past = await fetch(url, { headers: { Range: 'bytes=100000-' } })
    assert.equal(past.status, 416)
  } finally {
    await close()
  }
})

test('the session token gates the server', async () => {
  const { server, driveKey, close } = await serveOneDrive()
  try {
    const url = new URL(server.url(driveKey, '/room/clip.mp4'))
    const [, , ...rest] = url.pathname.split('/')
    const forged = `http://127.0.0.1:${server.port}/${'0'.repeat(32)}/${rest.join('/')}`
    assert.equal((await fetch(forged)).status, 404)

    // A real token but a path the drive does not have.
    assert.equal((await fetch(server.url(driveKey, '/room/nope.mp4'))).status, 404)
  } finally {
    await close()
  }
})
