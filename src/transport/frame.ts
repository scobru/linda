import b4a from 'b4a'

/**
 * The length-prefixed frame both runtimes speak to their backend.
 *
 * Frame layout, both directions:
 * [ 4-byte LE JSON length ][ JSON header bytes ][ optional binary tail ]
 *
 * One codec, two bridges: the desktop UI to its Bare worker (`src/worker/dispatcher.ts`), and
 * React Native to its Bare worklet (`mobile/src/bare/client.ts` <-> `mobile/worklet/entry.ts`).
 * This was written twice — `mobile/src/bare/frame.ts` held a second copy of the same sixteen
 * lines — and the two had already drifted apart cosmetically without either side noticing, which
 * is the state a wire format is in just before it drifts substantively. Nothing on either bridge
 * negotiates a version: a header length written one way and read another is an unparseable frame
 * and a dead session, on the runtime whose copy moved.
 */
export function packFrame(header: unknown, binary?: Uint8Array): Uint8Array {
  const json = b4a.from(JSON.stringify(header), 'utf8')
  const lenPrefix = new Uint8Array(4)
  // `new Uint8Array(4)` owns its buffer at offset 0, so the offset is redundant here — unlike in
  // `unpackFrame`, where it is load-bearing. It is passed anyway: the two differ only in where
  // their bytes came from, and a reader who has to work that out for each one is a reader who
  // eventually gets it wrong.
  new DataView(lenPrefix.buffer, lenPrefix.byteOffset, 4).setUint32(0, json.byteLength, true)
  return binary && binary.byteLength > 0 ? b4a.concat([lenPrefix, json, binary]) : b4a.concat([lenPrefix, json])
}

/**
 * Reads a frame back.
 *
 * `buf` arrives from the socket, so under Node and Bare alike it is routinely a `Buffer`: a view
 * into a shared ~8 KB pool at whatever offset the allocator handed out. `buf.buffer` alone is that
 * whole pool starting at byte zero — somebody else's bytes. The offset is what makes this read the
 * frame's own prefix rather than a neighbour's.
 */
export function unpackFrame(buf: Uint8Array): { header: any; binary: Uint8Array } {
  const headerLen = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, true)
  const header = JSON.parse(b4a.toString(buf.subarray(4, 4 + headerLen), 'utf8'))
  return { header, binary: buf.subarray(4 + headerLen) }
}
