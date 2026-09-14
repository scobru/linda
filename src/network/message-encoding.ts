import * as cenc from 'compact-encoding'
import type { Encoding } from 'compact-encoding'

// ---------------------------------------------------------------------------
// Wire messages from one declaration.
//
// Every message on both Protomux channels was three hand-written functions — `preencode`,
// `encode`, `decode` — that had to agree on the field list and its order, with nothing checking
// that they did. Thirteen messages came to 461 lines, and a field added to two of the three is a
// silent corruption: the encoder writes bytes the decoder never reads, so every later field on
// that message shifts. There was no round-trip test on any of them.
//
// A field list is the whole truth about a message, so that is what a message declares here.
// ---------------------------------------------------------------------------

/**
 * `optionalString` is the one rule worth naming rather than repeating. Four messages grew a
 * trailing string after they were already in the wild — an avatar, a description — and each
 * hand-written decoder wrapped the extra reads in a `try/catch` so a peer running the older build,
 * whose frame simply ends early, still decodes. Encoding sends `''` for a missing value, which
 * older peers ignore. Optional fields must therefore come last and never be reordered: a frame
 * carries no field names, only their order.
 */
export type FieldType = 'string' | 'uint' | 'bool' | 'buffer' | 'optionalString'

/** Maps a property's type to the wire tags that can carry it, so a mismatched tag fails the build. */
type TagsFor<V> = [V] extends [string | undefined]
  ? (undefined extends V ? 'optionalString' : 'string' | 'optionalString')
  : [V] extends [number] ? 'uint'
  : [V] extends [boolean] ? 'bool'
  : [V] extends [Uint8Array] ? 'buffer'
  : never

/** One `[name, type]` pair for some property of `T`, with the type constrained to that property. */
export type Field<T> = { [K in keyof T & string]: readonly [K, TagsFor<T[K]>] }[keyof T & string]

const PRIMITIVES = {
  string: cenc.string,
  uint: cenc.uint,
  bool: cenc.bool,
  buffer: cenc.buffer,
  optionalString: cenc.string
} as const

/**
 * Builds the three functions from the field list, which is the point: they cannot disagree about
 * the fields or their order, because there is only one list.
 */
export function messageEncoding<T extends object>(
  fields: readonly Field<T>[]
): Encoding<T> {
  const required = fields.filter(([, type]) => type !== 'optionalString')
  const optional = fields.filter(([, type]) => type === 'optionalString')

  // Optional fields are positional, so they have to sit at the end of the frame — otherwise an
  // older peer's short frame would strand a required field mid-read rather than at the boundary.
  const firstOptional = fields.findIndex(([, type]) => type === 'optionalString')
  if (firstOptional !== -1 && firstOptional + optional.length !== fields.length) {
    throw new Error('optionalString fields must come last')
  }

  const write = (method: 'preencode' | 'encode') => (state: never, message: T): void => {
    const record = message as Record<string, unknown>
    for (const [name, type] of fields) {
      const value = type === 'optionalString' ? (record[name] ?? '') : record[name]
      ;(PRIMITIVES[type][method] as (s: never, v: unknown) => void)(state, value)
    }
  }

  return {
    preencode: write('preencode'),
    encode: write('encode'),
    decode(state: never): T {
      const message: Record<string, unknown> = {}
      for (const [name, type] of required) {
        message[name] = (PRIMITIVES[type].decode as (s: never) => unknown)(state)
      }
      // Trailing optionals are read one at a time until the frame runs out, so a peer that predates
      // the second of two extra fields still delivers the first. Each is defaulted before its read
      // and the loop stops at the first short one — a decode that threw past a `break` would leave
      // the remaining fields undefined rather than empty.
      for (const [name] of optional) {
        message[name] = ''
        try {
          message[name] = cenc.string.decode(state)
        } catch {
          break
        }
      }
      return message as T
    }
  }
}
