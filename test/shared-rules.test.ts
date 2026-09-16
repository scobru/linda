import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

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

/** Every source file in the two shells and the code they share. */
function sourceFiles(): string[] {
  const roots = ['src', 'mobile/src', 'mobile/worklet']
  const files: string[] = []

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue
        walk(full)
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(full)
      }
    }
  }

  for (const root of roots) walk(path.join(process.cwd(), root))
  return files.map((file) => path.relative(process.cwd(), file))
}

/**
 * The source with its comments removed.
 *
 * A comment is not a rival implementation, and these rules quote the sentences they replaced while
 * explaining why — including in this very file. Crude on purpose: a `//` inside a string literal
 * truncates that line, which can only ever hide a hit, never invent one.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Matches the sentence as something the code produces, rather than as prose about it. */
function saysLiterally(source: string, text: string): boolean {
  const code = codeOnly(source)
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
  { text: 'Voice message', owner: 'src/rooms/room-rules.ts', rule: 'lastMessagePreview' }
]

test('no shell keeps its own copy of a sentence a shared rule already owns', () => {
  const files = sourceFiles()
  assert.ok(files.length > 50, `expected to scan both shells, found ${files.length} files`)

  const rivals: string[] = []
  for (const { text, owner, rule, also = [] } of OWNED) {
    const allowed = also
    const found = files.filter((file) => saysLiterally(fs.readFileSync(file, 'utf8'), text))
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
  const offenders = sourceFiles().filter((file) => saysLiterally(fs.readFileSync(file, 'utf8'), 'Shared an image'))
  assert.deepEqual(offenders, [])
})

test('neither shell derives "unread" from the two timestamps itself', () => {
  // `isRoomUnread` owns the comparison, including the part three of the four copies left out: the
  // room on screen is not unread.
  const pattern = /lastMessageTime\s*(&&|>)[^\n]*lastReadAt/
  const offenders = sourceFiles().filter((file) => {
    if (file === 'src/rooms/room-rules.ts') return false
    return pattern.test(codeOnly(fs.readFileSync(file, 'utf8')))
  })
  assert.deepEqual(offenders, [])
})
