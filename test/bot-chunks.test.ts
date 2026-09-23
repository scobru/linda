import test from 'node:test'
import assert from 'node:assert/strict'
import { splitMessage, MessageSegmenter } from '../src/bot/chunks.js'

// ---------------------------------------------------------------------------
// Long answers as several messages, cut where a person would cut them.
// ---------------------------------------------------------------------------

const para = (n: number, char = 'a') => `${char.repeat(n)}`

test('a short answer is one message, trimmed; an empty one is none', () => {
  assert.deepEqual(splitMessage('  hello  '), ['hello'])
  assert.deepEqual(splitMessage('   '), [])
})

test('a long answer is cut between paragraphs first', () => {
  const text = `${para(60)}\n\n${para(60, 'b')}\n\n${para(60, 'c')}`
  assert.deepEqual(splitMessage(text, 130), [`${para(60)}\n\n${para(60, 'b')}`, para(60, 'c')])
})

test('then between lines, then between words, then anywhere', () => {
  assert.deepEqual(splitMessage(`${para(70)}\n${para(70, 'b')}`, 100), [para(70), para(70, 'b')])
  assert.deepEqual(splitMessage(`${para(70)} ${para(70, 'b')}`, 100), [para(70), para(70, 'b')])
  assert.deepEqual(splitMessage(para(250), 100), [para(100), para(100), para(50)])
})

test('no part is ever over the limit or empty, and nothing is lost', () => {
  const words = Array.from({ length: 900 }, (_, i) => (i % 37 === 0 ? `word${i}\n\n` : i % 11 === 0 ? `w${i}\n` : `w${i} `)).join('')
  const parts = splitMessage(words, 300)
  assert.ok(parts.length > 5)
  for (const part of parts) {
    assert.ok(part.length > 0 && part.length <= 300, `part of ${part.length}`)
  }
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), words.trim().replace(/\s+/g, ' '))
})

test('a stream goes out a paragraph at a time, once enough has built up', () => {
  const segmenter = new MessageSegmenter(50, 1000)
  assert.deepEqual(segmenter.push('Short intro.\n\n'), [], 'not enough yet')
  assert.deepEqual(segmenter.push(`${para(60)} and more`), [], 'no paragraph break after enough text')
  assert.deepEqual(segmenter.push('\n\nNext'), [`Short intro.\n\n${para(60)} and more`])
  assert.deepEqual(segmenter.push(' paragraph'), [])
  assert.deepEqual(segmenter.flush(), ['Next paragraph'])
  assert.deepEqual(segmenter.flush(), [], 'nothing twice')
})

test('a stream with no breaks still goes out once it passes the limit', () => {
  const segmenter = new MessageSegmenter(50, 100)
  const ready = segmenter.push(para(250))
  assert.deepEqual(ready, [para(100), para(100)])
  assert.deepEqual(segmenter.flush(), [para(50)])
})
