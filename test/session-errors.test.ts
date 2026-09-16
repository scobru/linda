import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { codeOf, sourceFiles } from './source-scan.js'
import { classifySessionError, describeSessionError, type SessionFailure, type Shell } from '../src/app/session-errors.js'

// Anchored on the repo root rather than this module: the suite runs as a CJS bundle, where
// `import.meta.url` is undefined, and resolving from the root is what finds the root install anyway.
const require = createRequire(path.join(process.cwd(), 'package.json'))

// ---------------------------------------------------------------------------
// Both shells classified the same storage failures over the same storage layer, with matchers that
// were not supersets of each other, so each one fell through on cases the other caught — and the
// desktop had no case at all for a store belonging to another device, which is the one failure
// where guessing wrong costs the user their identity.
// ---------------------------------------------------------------------------

const SHELLS: Shell[] = ['desktop', 'mobile']

test('the messages this classifier reads are still the ones the storage layer throws', () => {
  // The lock matcher reads text because `fd-lock` throws plain Errors — which makes it a coupling to
  // somebody else's wording, of the kind that breaks silently on an upgrade and shows a user a raw
  // error instead of a remedy. This is that coupling, written down: it fails here on the upgrade
  // rather than in the field.
  const fdLock = fs.readFileSync(require.resolve('fd-lock'), 'utf8')
  assert.match(fdLock, /'File descriptor could not be locked'/, 'fd-lock reworded its lock failure')
  assert.match(fdLock, /'Lock has already been transferred'/, 'fd-lock reworded its transfer failure')

  const deviceFile = fs.readFileSync(require.resolve('device-file'), 'utf8')
  assert.match(deviceFile, /code = 'DEVICE_FILE'/, 'device-file no longer tags its errors with a code')
  assert.match(deviceFile, /err\.fatal = fatal/, 'device-file no longer marks which failures are fatal')
  // The one non-fatal case, which must not be read as a foreign store.
  assert.match(deviceFile, /'No device file present', false/)
})

test('every way the store can be held open is one failure, on both shells', () => {
  // The first two are fd-lock's own literals. `FDLock` is what the desktop matched and mobile did
  // not; `already held` and the errno text are what mobile matched and the desktop did not. All of
  // them now land in the same place, which is the point.
  for (const message of [
    'File descriptor could not be locked',
    'Lock has already been transferred',
    'FDLock: failed to acquire',
    'storage lock already held by another process',
    'EAGAIN: Resource temporarily unavailable'
  ]) {
    assert.equal(classifySessionError(new Error(message)), 'storage-locked', message)
    for (const shell of SHELLS) assert.match(describeSessionError(new Error(message), shell), /storage/i)
  }
})

test('a store that belongs to another device is recognised by its tag, not its wording', () => {
  // `device-file` tags the error, and the tag survives wherever the error has not crossed a wire —
  // which is Electron, where the Session runs in-process. No string matching involved.
  const tagged = Object.assign(new Error('something device-file decided to say'), { code: 'DEVICE_FILE', fatal: true })
  assert.equal(classifySessionError(tagged), 'storage-foreign')
})

test('and by its wording once the tag has been dropped on the wire', () => {
  // Both worker bridges serialise an error to `err.message` alone, so this is what mobile and Pear
  // actually see. All four fatal spellings device-file throws:
  for (const message of [
    'Invalid device file, was moved unsafely',
    'Invalid device file, was modified',
    'Invalid device file, was made on different platform',
    'Invalid device file, publicKey has changed. Was a, is b'
  ]) {
    assert.equal(classifySessionError(new Error(message)), 'storage-foreign', message)
  }
})

test('a missing device file is not a foreign one, and gets no invented remedy', () => {
  // device-file raises this with fatal:false when asked to open without creating. Linda never opens
  // a store that way, so it cannot reach a user — and mobile's old matcher, a bare /device file/i,
  // would have told them their storage was restored from a backup, which it was not.
  const absent = Object.assign(new Error('No device file present'), { code: 'DEVICE_FILE', fatal: false })
  assert.equal(classifySessionError(absent), 'unknown')
  assert.equal(describeSessionError(absent, 'desktop'), 'No device file present')
})

test('a runtime that stopped answering is its own failure', () => {
  // Raised by mobile's own client. The desktop's Pear worker has no deadline at all, so it cannot
  // report this yet — the kind is shared anyway, rather than waiting for a second copy to be written.
  assert.equal(classifySessionError(new Error('the background runtime did not answer session.send in time')), 'runtime-stopped')
  assert.equal(classifySessionError(new Error('the background runtime has stopped — restart the app')), 'runtime-stopped')
})

test('an unrecognised failure keeps its own text rather than being dressed up', () => {
  // The desktop's "Failed to unlock" fitted every failure and helped with none. Text the user can
  // quote is worth more than a sentence that reads the same whatever went wrong.
  assert.equal(describeSessionError(new Error('ENOSPC: no space left on device'), 'desktop'), 'ENOSPC: no space left on device')
  assert.equal(describeSessionError('a thrown string', 'mobile'), 'a thrown string')
  assert.equal(classifySessionError(null), 'unknown')
})

test('every failure is worded for every shell, and the two shells differ', () => {
  // A new kind cannot be added and worded on one platform only — which is how this drifted apart.
  const kinds: Exclude<SessionFailure, 'unknown'>[] = ['storage-locked', 'storage-foreign', 'runtime-stopped']
  for (const kind of kinds) {
    const sentences = SHELLS.map((shell) => {
      // Reach each kind through a message that classifies to it, so the table cannot be right here
      // while being unreachable in practice.
      const probe = { 'storage-locked': 'File descriptor could not be locked', 'storage-foreign': 'Invalid device file, was modified', 'runtime-stopped': 'the background runtime has stopped' }[kind]
      const sentence = describeSessionError(new Error(probe), shell)
      assert.ok(sentence.length > 20, `${kind}/${shell} has no sentence`)
      assert.notEqual(sentence, probe, `${kind}/${shell} fell through to the raw message`)
      return sentence
    })
    // The remedy is the part that has to differ: a desktop user has no recent-apps list.
    assert.notEqual(sentences[0], sentences[1], `${kind} gives both shells the same instruction`)
  }
  assert.doesNotMatch(describeSessionError(new Error('File descriptor could not be locked'), 'desktop'), /recent-apps/)
})

test('neither shell keeps its own matcher for a failure this module classifies', () => {
  const rivals = sourceFiles().filter((file) => {
    if (file === 'src/app/session-errors.ts') return false
    return /FDLock|could not be locked|device file/i.test(codeOf(file))
  })
  assert.deepEqual(rivals, [])
})
