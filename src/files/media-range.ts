/**
 * HTTP byte-range handling for the local media server (see `media-server.ts`).
 *
 * Split out from the server because this is the part with all the edge cases and none of the
 * I/O: a player's seek is a `Range` header, and getting the arithmetic wrong shows up as a
 * video that plays once and then refuses to scrub.
 */

/** Inclusive at both ends, the way HTTP counts bytes — `bytes=0-1` is two bytes. */
export interface ByteRange {
  start: number
  end: number
}

export type RangePlan =
  /** Whole file: no `Range` header, or one we decline to honour. */
  | { status: 200; range: ByteRange }
  /** Partial content, the normal case once a player starts seeking. */
  | { status: 206; range: ByteRange }
  /** Asked for bytes past the end of the file. */
  | { status: 416 }

/**
 * Resolves a `Range` request header against a known file size.
 *
 * Multi-range requests (`bytes=0-99, 200-299`) are answered with the whole file rather than a
 * `multipart/byteranges` body: no media player asks for them, and the multipart encoding is a
 * lot of code to carry for a case that never fires.
 */
export function planRange(header: string | undefined, size: number): RangePlan {
  const whole: RangePlan = { status: 200, range: { start: 0, end: Math.max(0, size - 1) } }
  if (!header || size === 0) return whole

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return whole
  const [, rawStart, rawEnd] = match

  // `bytes=-500` means the *last* 500 bytes, not "up to byte 500" — the one piece of this
  // grammar that reads backwards from every other range expression.
  if (rawStart === '') {
    if (rawEnd === '') return whole
    const suffix = Number(rawEnd)
    if (suffix === 0) return { status: 416 }
    return { status: 206, range: { start: Math.max(0, size - suffix), end: size - 1 } }
  }

  const start = Number(rawStart)
  if (start >= size) return { status: 416 }
  // An end past the last byte is not an error: the spec says clamp it, and players routinely
  // ask for more than is there when they guess at a chunk size.
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  if (end < start) return { status: 416 }
  return { status: 206, range: { start, end } }
}

/** Response headers for a plan. `Accept-Ranges` is what tells a player seeking is available
 * at all — without it Chromium will not even show a scrubbable timeline. */
export function rangeHeaders(plan: RangePlan, size: number, mimeType: string): Record<string, string> {
  if (plan.status === 416) {
    return { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' }
  }
  const length = plan.range.end - plan.range.start + 1
  const headers: Record<string, string> = {
    'Content-Type': mimeType,
    'Content-Length': String(size === 0 ? 0 : length),
    'Accept-Ranges': 'bytes',
    // The stream is peer-to-peer and the URL is single-session; a cached copy in the player
    // would just be a second thing to invalidate.
    'Cache-Control': 'no-store'
  }
  if (plan.status === 206) {
    headers['Content-Range'] = `bytes ${plan.range.start}-${plan.range.end}/${size}`
  }
  return headers
}

const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  flac: 'audio/flac'
}

/** Content type for a filename. Deliberately derived here rather than taken from the message's
 * `mimeType`: that value crosses the network from another peer, and this one only ever has to
 * be good enough for the local player to pick a decoder. */
export function mimeFromName(name: string): string {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
}
