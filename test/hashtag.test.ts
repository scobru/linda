import test from 'node:test'
import assert from 'node:assert/strict'
import { extractHashtags, hasHashtag, linkifyHashtags, splitOnHashtags } from '../src/util/hashtag.js'

test('extracts tags, de-duplicated and case-folded, in order of appearance', () => {
  assert.deepEqual(extractHashtags('devo comprare la spesa #todo'), ['todo'])
  assert.deepEqual(extractHashtags('multi #todo #idea #bug'), ['todo', 'idea', 'bug'])
  assert.deepEqual(extractHashtags('#todo and #Todo are one tag'), ['todo'])
  assert.deepEqual(extractHashtags('(#parens) and accented #perché'), ['parens', 'perché'])
  assert.deepEqual(extractHashtags('no tags here'), [])
  assert.deepEqual(extractHashtags(''), [])
})

test('leaves things that only look like tags alone', () => {
  // A URL fragment is not a tag — the # is not at a word boundary.
  assert.deepEqual(extractHashtags('see https://example.com/page#section'), [])
  assert.deepEqual(extractHashtags('a#b is not a tag'), [])
  // Tags must start with a letter, so bare numbers never qualify.
  assert.deepEqual(extractHashtags('released in #2026'), [])
})

test('hasHashtag ignores case', () => {
  assert.equal(hasHashtag('buy milk #TODO', 'todo'), true)
  assert.equal(hasHashtag('buy milk #todo', 'TODO'), true)
  assert.equal(hasHashtag('buy milk', 'todo'), false)
})

test('linkifyHashtags wraps only the tag and keeps the leading character', () => {
  assert.equal(
    linkifyHashtags('buy milk #todo now'),
    'buy milk <span class="hashtag" data-hashtag="todo">#todo</span> now'
  )
  // The character before the tag is part of the match and must survive.
  assert.equal(linkifyHashtags('x (#a)').includes('(<span'), true)
  assert.equal(linkifyHashtags('nothing to do here'), 'nothing to do here')
})

test('splitOnHashtags round-trips the original text', () => {
  const cases = [
    'devo comprare la spesa #todo',
    '#todo at the start',
    'multi #todo and #idea together',
    'plain text with no tags',
    '(#parens) mid sentence',
  ]
  for (const body of cases) {
    assert.equal(splitOnHashtags(body).map((p) => p.text).join(''), body, `round-trip failed for ${body}`)
  }
})

test('splitOnHashtags marks only the tag parts', () => {
  const parts = splitOnHashtags('buy milk #todo now')
  assert.deepEqual(parts, [
    { text: 'buy milk ' },
    { text: '#todo', tag: 'todo' },
    { text: ' now' },
  ])
  // The tag is normalised even though the displayed text keeps the original case.
  assert.deepEqual(splitOnHashtags('#Todo')[0], { text: '#Todo', tag: 'todo' })
  assert.deepEqual(splitOnHashtags('no tags'), [{ text: 'no tags' }])
})
