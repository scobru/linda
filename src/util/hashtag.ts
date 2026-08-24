/**
 * Hashtags turn a chat message into a lightweight note: writing "buy milk #todo" tags it, and
 * the room can then be filtered down to just the messages carrying a given tag.
 *
 * Deliberately narrow: a tag must start with a letter (so "#1" and "#2026" aren't tags) and is
 * matched only at a word boundary, so a URL fragment such as "example.com/page#section" is left
 * alone. A hex colour written as "#fff" does read as a tag — not worth special-casing, since it
 * costs one stray pill in a chat that happens to discuss CSS.
 */
const HASHTAG_PATTERN = /(^|[\s(])#([\p{L}][\p{L}\p{N}_-]{0,63})/gu

/** Distinct tags in the order they first appear, lowercased so "#Todo" and "#todo" are one tag. */
export function extractHashtags(body: string): string[] {
  if (!body) return []
  const found: string[] = []
  for (const match of body.matchAll(HASHTAG_PATTERN)) {
    const tag = match[2]?.toLowerCase()
    if (tag && !found.includes(tag)) found.push(tag)
  }
  return found
}

export function hasHashtag(body: string, tag: string): boolean {
  return extractHashtags(body).includes(tag.toLowerCase())
}

export interface HashtagPart {
  text: string
  /** The normalised tag when this part is one, absent for plain runs of text. */
  tag?: string
}

/**
 * Splits a message into alternating plain and tag parts. React Native renders text as nodes
 * rather than markup, so it can't use `linkifyHashtags` — this gives it the same split without
 * duplicating the matching rule.
 */
export function splitOnHashtags(body: string): HashtagPart[] {
  const parts: HashtagPart[] = []
  let cursor = 0
  for (const match of body.matchAll(HASHTAG_PATTERN)) {
    const lead = match[1] ?? ''
    const tag = match[2]
    if (!tag) continue
    const tagStart = match.index! + lead.length
    if (tagStart > cursor) parts.push({ text: body.slice(cursor, tagStart) })
    parts.push({ text: `#${tag}`, tag: tag.toLowerCase() })
    cursor = tagStart + tag.length + 1
  }
  if (cursor < body.length) parts.push({ text: body.slice(cursor) })
  return parts
}

/**
 * Rewrites the tags in already-HTML-escaped text into clickable spans. Takes escaped input
 * because the caller escapes before linkifying, and re-escaping here would double-encode.
 */
export function linkifyHashtags(escaped: string): string {
  return escaped.replace(HASHTAG_PATTERN, (_full, lead: string, tag: string) =>
    `${lead}<span class="hashtag" data-hashtag="${tag.toLowerCase()}">#${tag}</span>`)
}
