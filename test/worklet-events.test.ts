import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Mobile's two halves talk through named events: the worklet calls `pushEvent('x', …)` and the app
// calls `bareClient.on('x', …)`. Nothing connects the two names, so a listener whose producer was
// never written is silent — not broken, not logged, just never called.
//
// That is what happened to `callEnded` and `callRemoteControl`: `useSession` has listened for both
// since calls landed, and `entry.ts` passed neither of them to `Session`. The end-of-call haptic
// never fired, and a peer's mute only reached the phone if the state change that follows it
// happened to carry the flag.
// ---------------------------------------------------------------------------

function read(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8')
}

function sourcesUnder(dir: string): string[] {
  const root = path.join(process.cwd(), dir)
  const out: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true, recursive: true } as { withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    out.push(path.join((entry as unknown as { parentPath?: string; path?: string }).parentPath
      ?? (entry as unknown as { path: string }).path, entry.name))
  }
  return out
}

function names(source: string, pattern: RegExp): Set<string> {
  const found = new Set<string>()
  for (const match of source.matchAll(pattern)) found.add(match[1]!)
  return found
}

test('every event the mobile app listens for is one the worklet actually sends', () => {
  const worklet = fs.readdirSync(path.join(process.cwd(), 'mobile/worklet'))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => read(path.join('mobile/worklet', file)))
    .join('\n')
  const pushed = names(worklet, /pushEvent\(\s*'([a-zA-Z]+)'/g)

  const listened = new Set<string>()
  for (const file of sourcesUnder('mobile/src')) {
    for (const name of names(fs.readFileSync(file, 'utf8'), /bareClient\.on\(\s*'([a-zA-Z]+)'/g)) {
      listened.add(name)
    }
  }

  assert.ok(pushed.size > 0, 'found no pushEvent calls — the scan is looking in the wrong place')
  assert.ok(listened.size > 0, 'found no bareClient.on calls — the scan is looking in the wrong place')

  const silent = [...listened].filter((name) => !pushed.has(name)).sort()
  assert.deepEqual(silent, [], 'the mobile app listens for these events and nothing sends them')
})
