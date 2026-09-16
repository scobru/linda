import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { codeOf, codeOnly, sourceFiles } from './source-scan.js'

// ---------------------------------------------------------------------------
// The scans that guard against rival implementations are only as good as their comment stripper,
// and the first one was defeated by an HTML attribute. These test the stripper itself rather than
// trusting it, because a stripper that quietly removes too much makes every scan built on it pass.
// ---------------------------------------------------------------------------

test('a slash-star inside a string is not a comment', () => {
  // The exact shape that hid a third of `src/ui/app-shell.ts`: the `/*` in this attribute opened a
  // comment that the old regex closed at the next real `*/`, 55,255 characters further down.
  const source = `const html = '<input accept="image/*" />'\nconst after = 'still here'`
  const code = codeOnly(source)
  assert.ok(code.includes('accept="image/*"'), 'the attribute was eaten')
  assert.ok(code.includes("'still here'"), 'everything after the attribute was eaten')
})

test('a double slash inside a string is not a comment either', () => {
  const code = codeOnly(`const url = 'https://example.com/path'\nconst after = 1`)
  assert.ok(code.includes("'https://example.com/path'"))
  assert.ok(code.includes('const after = 1'))
})

test('real comments are removed, in both spellings', () => {
  const code = codeOnly(`const a = 1 // trailing\n/* block\n   comment */\nconst b = 2`)
  assert.doesNotMatch(code, /trailing/)
  assert.doesNotMatch(code, /block/)
  assert.match(code, /const a = 1/)
  assert.match(code, /const b = 2/)
})

test('line numbers survive, so a failure can name a real line', () => {
  const source = `const a = 1\n/* two\n   lines */\nconst b = 2`
  assert.equal(codeOnly(source).split('\n').length, source.split('\n').length)
  assert.equal(codeOnly(source).split('\n')[3], 'const b = 2')
})

test('a template literal keeps its text and still sees the code in its holes', () => {
  const code = codeOnly('const t = `a /* not a comment */ ${value} tail`\nconst after = 2')
  assert.ok(code.includes('/* not a comment */'), 'template text was stripped as a comment')
  assert.ok(code.includes('${value}'))
  assert.ok(code.includes('const after = 2'))
})

test('a nested template does not lose track of where it is', () => {
  const code = codeOnly('const t = `outer ${ inner ? `yes /* x */` : `no` } end`\nconst after = 3')
  assert.ok(code.includes('/* x */'))
  assert.ok(code.includes('const after = 3'))
})

test('a quote inside a regular expression does not open a string', () => {
  // `/['"]/` would otherwise leave the stripper inside a string for the rest of the file.
  const code = codeOnly(`const re = /['"]/\nconst after = 'visible'`)
  assert.ok(code.includes("'visible'"), 'a regex character class swallowed the rest of the file')
})

test('division is not mistaken for a regular expression', () => {
  const code = codeOnly(`const half = total / 2\nconst other = count / 4 // note\nconst after = 5`)
  assert.ok(code.includes('total / 2'))
  assert.ok(code.includes('count / 4'))
  assert.doesNotMatch(code, /note/)
  assert.ok(code.includes('const after = 5'))
})

test('an unterminated string does not swallow the rest of the file', () => {
  const code = codeOnly(`const broken = 'oops\nconst after = 6`)
  assert.ok(code.includes('const after = 6'))
})

test('the output lines up with the input, character for character', () => {
  // Everything below depends on this: a comment becomes spaces of its own length, so an offset in
  // the stripped text is the same offset in the file.
  for (const file of sourceFiles()) {
    const raw = fs.readFileSync(file, 'utf8')
    assert.equal(codeOnly(raw).length, raw.length, `${file} changed length`)
  }
})

test('nothing in either shell is blanked in one implausible run', () => {
  // The canary for the next runaway. A percentage would be the wrong measure — this codebase is
  // deliberately comment-heavy and several small files are more than half prose. What went wrong
  // was one span: a single `/*` that ran for 55,255 characters. So that is what is measured.
  const offenders: string[] = []
  for (const file of sourceFiles()) {
    const raw = fs.readFileSync(file, 'utf8')
    const code = codeOnly(raw)
    let longest = 0
    let run = 0
    for (let i = 0; i < raw.length; i++) {
      run = raw[i] !== code[i] ? run + 1 : 0
      if (run > longest) longest = run
    }
    if (longest > 5000) offenders.push(`${file} blanked ${longest} characters in one run`)
  }
  assert.deepEqual(offenders, [])
})

test('the file that defeated the old stripper is now read whole', () => {
  const file = 'src/ui/app-shell.ts'
  const raw = fs.readFileSync(file, 'utf8')
  const code = codeOf(file)

  assert.equal(code.split('\n').length, raw.split('\n').length)
  assert.equal(code.match(/accept="image\/\*"/g)?.length, 4, 'every file input must survive')
  // Markup from well inside the 55,255 characters the old stripper ate — it began at the first of
  // those file inputs and ran to the next real `*/`, taking the whole settings pane with it.
  assert.ok(code.includes('id="copyPublicKey"'), 'the swallowed region is still swallowed')
  assert.ok(code.includes('id="hideMnemonicBtn"'), 'the swallowed region is still swallowed')
})
