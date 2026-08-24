import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import b4a from 'b4a'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'linda-pear-drive-reuse-test-'))
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timed-out'> {
  return Promise.race([
    promise,
    new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), ms))
  ])
}

/**
 * Pins down why `Session.downloadFile` keeps one Hyperdrive per drive key instead of opening a
 * fresh one per download. Hyperdrive opens its metadata core with `exclusive: true`, taking a
 * mutex that is only released when the drive is closed — so a second open of the same key while
 * the first is still around never resolves. That deadlock was silent: it hung inside `ready()`
 * before any request went out, so no retry ran, nothing threw, and downloads simply did nothing
 * from the second one onward.
 */
test('a second open of the same drive key deadlocks while the first is still open', async () => {
  const dir = tmpDir()
  const store = new Corestore(dir)

  const source = new Hyperdrive(store.namespace('files'))
  await source.ready()
  await source.put('/hello.txt', b4a.from('hi', 'utf8'))
  const key = source.key
  await source.close()

  const first = new Hyperdrive(store, key)
  assert.notEqual(await withTimeout(first.ready(), 3000), 'timed-out', 'first open should resolve')

  // Deliberately leaves `first` open, reproducing a download that never closed its drive.
  const second = new Hyperdrive(store, key)
  assert.equal(
    await withTimeout(second.ready(), 3000),
    'timed-out',
    'second open is expected to block on the exclusive lock the first still holds'
  )

  // Reusing the drive that is already open — what the session does now — stays responsive.
  const reused = await withTimeout(first.get('/hello.txt'), 3000)
  assert.notEqual(reused, 'timed-out', 'reusing the open drive should not block')
  assert.equal(b4a.toString(reused as Buffer, 'utf8'), 'hi')

  await store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})
