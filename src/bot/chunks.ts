// ---------------------------------------------------------------------------
// Long answers as several messages.
//
// Nothing in Linda caps a message's length, but a phone screen does: an assistant's thousand-word
// answer as one bubble is a wall to scroll, and one that arrives only when the whole of it has been
// generated is a long wait on "typing…". So a long reply goes out as several messages, cut where a
// person would cut it — between paragraphs, then between lines, then between words — and a
// streamed reply goes out a paragraph or so at a time, as it is produced.
// ---------------------------------------------------------------------------

/** Past this, a reply is split. About a screenful on a phone; Telegram's own cap is 4096. */
export const MAX_MESSAGE_CHARS = 3000

/** A streamed reply is not cut before this much has built up, or every short paragraph would be its own message. */
export const MIN_STREAMED_CHARS = 400

/**
 * Where to cut `text` so the first part is at most `max` characters: the last paragraph break,
 * else the last line break, else the last space, within the limit — but not so early that the
 * first part is a sliver (under half the limit); failing all that, at the limit itself.
 */
function cutPoint(text: string, max: number): number {
  const window = text.slice(0, max + 1)
  for (const separator of ['\n\n', '\n', ' ']) {
    const at = window.lastIndexOf(separator)
    if (at >= max / 2) return at
  }
  return max
}

/** `text` as messages of at most `max` characters, cut at natural boundaries, none of them empty. */
export function splitMessage(text: string, max = MAX_MESSAGE_CHARS): string[] {
  const parts: string[] = []
  let rest = text.trim()
  while (rest.length > max) {
    const at = cutPoint(rest, max)
    const part = rest.slice(0, at).trim()
    if (part) parts.push(part)
    rest = rest.slice(at).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

/**
 * Turns a stream of text fragments (an LLM's tokens, say) into whole messages.
 *
 * `push` returns the messages that are ready: once at least `minChars` have built up, everything up
 * to the last paragraph break goes out; past `maxChars` a message goes out whether or not a break
 * has come. `flush` returns what is left at the end.
 */
export class MessageSegmenter {
  private buffer = ''

  constructor(private readonly minChars = MIN_STREAMED_CHARS, private readonly maxChars = MAX_MESSAGE_CHARS) {}

  push(fragment: string): string[] {
    this.buffer += fragment
    const ready: string[] = []
    while (this.buffer.length > this.maxChars) {
      const at = cutPoint(this.buffer, this.maxChars)
      ready.push(this.buffer.slice(0, at))
      this.buffer = this.buffer.slice(at)
    }
    if (this.buffer.length >= this.minChars) {
      const at = this.buffer.lastIndexOf('\n\n')
      if (at >= this.minChars / 2) {
        ready.push(this.buffer.slice(0, at))
        this.buffer = this.buffer.slice(at)
      }
    }
    return ready.map((part) => part.trim()).filter(Boolean)
  }

  flush(): string[] {
    const rest = this.buffer
    this.buffer = ''
    return splitMessage(rest, this.maxChars)
  }
}
