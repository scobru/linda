import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { codeOf, codeOnly, sourceFiles } from './source-scan.js'

// ---------------------------------------------------------------------------
// Every rule in `room-rules.ts` is tested as a function, and none of those tests can tell whether
// a shell still answers the question for itself somewhere. That is how all sixteen divergences
// happened in the first place: nobody wrote a second implementation on purpose, they wrote the
// first one twice, months apart, in files that never mention each other.
//
// A sentence a user reads is the one part of a rule that cannot be paraphrased by accident. So the
// check is: each of these lives in exactly one file. A second copy anywhere means someone answered
// a question that already had an answer — and the failure names the file and the sentence.
//
// This does not prove a shell calls the rule in the right place; nothing here can. It proves it no
// longer contains a rival.
// ---------------------------------------------------------------------------

// The comment stripper these scans depend on lives in `./source-scan.ts` and is tested there. It
// used to be a regular expression defined here, which `accept="image/*"` in `src/ui/app-shell.ts`
// defeated: the `/*` in that attribute opened a comment it closed 55,255 characters later, so a
// third of that file was invisible to every check below from the day they were written.

/** Matches the sentence as something the code produces, rather than as prose about it. */
function saysLiterally(file: string, text: string): boolean {
  const code = codeOf(file)
  return code.includes(`'${text}`) || code.includes(`"${text}`) || code.includes(`\`${text}`)
}

/** The sentences each rule owns, and the file that is allowed to say them. */
const OWNED: { text: string; owner: string; rule: string; also?: string[] }[] = [
  // `room.ts` throws this same sentence from `send()`. Deliberately not listed: that is an
  // exception for a caller that posted anyway, not a sentence rendered in a bar, and the log
  // should not import a shell's wording to raise it.
  { text: 'You are muted in this room', owner: 'src/rooms/room-rules.ts', rule: 'composerBlock', also: ['src/rooms/room.ts'] },
  { text: 'Only admins can send messages in this broadcast room', owner: 'src/rooms/room-rules.ts', rule: 'composerBlock' },
  { text: 'You do not have write access to this room yet', owner: 'src/rooms/room-rules.ts', rule: 'composerBlock' },
  { text: 'Waiting for room encryption keys', owner: 'src/rooms/room-rules.ts', rule: 'composerBlock' },
  { text: 'Connecting to sync room access', owner: 'src/rooms/room-rules.ts', rule: 'composerBlock' },
  { text: 'You have been removed from this room', owner: 'src/rooms/room-rules.ts', rule: 'composerBlock' },
  { text: '(No subject)', owner: 'src/rooms/room-rules.ts', rule: 'mailboxSubject' },
  { text: 'Message deleted', owner: 'src/rooms/room-rules.ts', rule: 'mailboxSubject' },
  { text: 'Voice message', owner: 'src/rooms/room-rules.ts', rule: 'lastMessagePreview' },
  // The vault had five strings for one feature: the room's name, a stored description, and three
  // labels — two on the desktop, one on mobile that read "Single-Writer Sovereign Vault", which is
  // what a vault is in the log rather than what it is to the person who owns it.
  { text: 'Personal Vault', owner: 'src/rooms/room-rules.ts', rule: 'PERSONAL_VAULT_NAME' },
  { text: 'Private storage only you can write to', owner: 'src/rooms/room-rules.ts', rule: 'PERSONAL_VAULT_DESCRIPTION' },
  { text: 'File not yet available on connected peers', owner: 'src/rooms/room-rules.ts', rule: 'FILE_NOT_YET_AVAILABLE' },
  { text: 'Could not load or resize image', owner: 'src/util/avatar.ts', rule: 'IMAGE_LOAD_FAILED' }
]

test('no shell keeps its own copy of a sentence a shared rule already owns', () => {
  const files = sourceFiles()
  assert.ok(files.length > 50, `expected to scan both shells, found ${files.length} files`)

  const rivals: string[] = []
  for (const { text, owner, rule, also = [] } of OWNED) {
    const allowed = also
    const found = files.filter((file) => saysLiterally(file, text))
    assert.ok(found.includes(owner), `${rule} no longer says "${text}" — update this list with it`)

    for (const file of found) {
      if (file !== owner && !allowed.includes(file)) {
        rivals.push(`${file} says "${text}" — ${rule} in ${owner} already does`)
      }
    }
  }

  assert.deepEqual(rivals, [])
})

test('the string that called every attachment an image is gone', () => {
  // The desktop rendered "Shared an image" for a PDF, a zip and a voice note, in the room list and
  // again in notifications. `lastMessagePreview` names the file instead.
  const offenders = sourceFiles().filter((file) => saysLiterally(file, 'Shared an image'))
  assert.deepEqual(offenders, [])
})

test('neither shell derives "unread" from the two timestamps itself', () => {
  // `isRoomUnread` owns the comparison, including the part three of the four copies left out: the
  // room on screen is not unread.
  const pattern = /lastMessageTime\s*(&&|>)[^\n]*lastReadAt/
  const offenders = sourceFiles().filter((file) => {
    if (file === 'src/rooms/room-rules.ts') return false
    return pattern.test(codeOf(file))
  })
  assert.deepEqual(offenders, [])
})

test('the vault is not described by how it is implemented', () => {
  // "Single-Writer" is an Autobase property, not a product name, and it was mobile's header for a
  // room the same user's room list calls Personal Vault.
  const offenders = sourceFiles().filter((file) => /Single-Writer|Sovereign Vault/i.test(codeOf(file)))
  assert.deepEqual(offenders, [])
})

test('no shell tells a user a room file is gone when it is only offline', () => {
  // The desktop said "not yet available"; mobile said "Download failed" over "File not available".
  // Same condition — `downloadFile` returning nothing — and opposite advice about whether to retry.
  const offenders = sourceFiles().filter((file) => /File not available on connected peers/.test(codeOf(file)))
  assert.deepEqual(offenders, [])
})
