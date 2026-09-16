import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Shared machinery for the tests that scan the two shells for rival implementations.
//
// These scans strip comments before searching, because the rules they guard quote the sentences
// they replaced while explaining why — including in the guards themselves. The first version did it
// with `source.replace(/\/\*[\s\S]*?\*\//g, '')`, and said of itself that it could only ever hide a
// hit, never invent one. That was true, and not harmless: `src/ui/app-shell.ts` contains
// `accept="image/*"`, whose `/*` opened a comment the regex then closed at the next real `*/`,
// 55,255 characters later. A third of the largest file in the repo was invisible to every scan built
// on it, silently, from the day it was written.
//
// The replacement is a lexer rather than a better pattern, because the thing that has to be known
// here — whether a `/*` is inside a string — is not something a regular expression can know. It is
// small enough to read in one sitting and is tested directly in `test/source-scan.test.ts`,
// including against the attribute that defeated its predecessor.
//
// (The compiler's own scanner would be better than either. TypeScript 7 is the Go port and exposes
// no JS API — no `createScanner`, no `SyntaxKind` — so it is not available to reach for.)
// ---------------------------------------------------------------------------

/** Characters after which a `/` opens a regular expression rather than dividing. */
const REGEX_MAY_FOLLOW = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', ''])

/**
 * The source with its comments blanked out, and everything else — strings, templates, regular
 * expressions — left exactly as it was.
 *
 * Comments become runs of spaces rather than vanishing, so offsets and line numbers still line up
 * with the file on disk and a failing scan can name a real line.
 */
export function codeOnly(source: string): string {
  const out: string[] = []
  /** Template-literal nesting: each entry is the `${` brace depth of one enclosing template. */
  const templates: number[] = []
  let braces = 0
  let lastSignificant = ''
  let i = 0

  const blank = (text: string): string => text.replace(/[^\n]/g, ' ')

  while (i < source.length) {
    const char = source[i]!
    const next = source[i + 1]

    // --- comments: the only thing removed ---
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      out.push(blank(source.slice(i, stop)))
      i = stop
      continue
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      out.push(blank(source.slice(i, stop)))
      i = stop
      continue
    }

    // --- strings and templates: kept whole, and nothing inside them is read as code ---
    if (char === "'" || char === '"') {
      const end = scanQuoted(source, i, char)
      out.push(source.slice(i, end))
      i = end
      lastSignificant = char
      continue
    }
    if (char === '`') {
      // A template can hold `${ ... }` holding another template, so this tracks depth rather than
      // scanning to the closing backtick.
      templates.push(braces)
      out.push(char)
      i++
      const end = scanTemplateChunk(source, i)
      out.push(source.slice(i, end))
      i = end
      continue
    }
    if (templates.length > 0 && char === '}' && braces === templates[templates.length - 1]) {
      // Closing a `${`: back inside the template's text.
      out.push(char)
      i++
      const end = scanTemplateChunk(source, i)
      out.push(source.slice(i, end))
      i = end
      continue
    }
    if (templates.length > 0 && char === '`' ) {
      templates.pop()
      out.push(char)
      i++
      lastSignificant = char
      continue
    }

    // --- regular expressions: a body may hold quotes, which must not open a string ---
    if (char === '/' && REGEX_MAY_FOLLOW.has(lastSignificant)) {
      const end = scanRegex(source, i)
      if (end > i) {
        out.push(source.slice(i, end))
        i = end
        lastSignificant = '/'
        continue
      }
    }

    if (char === '{') braces++
    else if (char === '}') braces--

    out.push(char)
    if (!/\s/.test(char)) lastSignificant = char
    i++
  }

  return out.join('')
}

/** Index just past the closing quote. */
function scanQuoted(source: string, start: number, quote: string): number {
  let i = start + 1
  while (i < source.length) {
    const char = source[i]!
    if (char === '\\') { i += 2; continue }
    if (char === quote) return i + 1
    if (char === '\n') return i // unterminated; do not run away
    i++
  }
  return source.length
}

/** Index of the next `` ` `` or `${` that ends this run of template text. */
function scanTemplateChunk(source: string, start: number): number {
  let i = start
  while (i < source.length) {
    const char = source[i]!
    if (char === '\\') { i += 2; continue }
    if (char === '`') return i
    if (char === '$' && source[i + 1] === '{') return i + 2
    i++
  }
  return source.length
}

/** Index just past the closing `/` and flags, or `start` if this is not a regular expression. */
function scanRegex(source: string, start: number): number {
  let i = start + 1
  let inClass = false
  while (i < source.length) {
    const char = source[i]!
    if (char === '\\') { i += 2; continue }
    if (char === '\n') return start // a regex cannot span lines: this was a division
    if (char === '[') inClass = true
    else if (char === ']') inClass = false
    else if (char === '/' && !inClass) {
      i++
      while (i < source.length && /[a-z]/.test(source[i]!)) i++
      return i
    }
    i++
  }
  return start
}

/** Every TypeScript source file in the two shells and the code they share. */
export function sourceFiles(roots = ['src', 'mobile/src', 'mobile/worklet']): string[] {
  const files: string[] = []

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue
        walk(full)
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(path.relative(process.cwd(), full))
      }
    }
  }

  for (const root of roots) walk(path.join(process.cwd(), root))
  return files
}

/** A file's code with its comments gone, read from disk. */
export function codeOf(file: string): string {
  return codeOnly(fs.readFileSync(file, 'utf8'))
}
