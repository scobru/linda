import b4a from 'b4a'

/**
 * Shared length-prefixed frame encoder/decoder for RPC communication between
 * the desktop UI and the Bare worker process (as well as mobile RN <-> Bare).
 *
 * Frame layout (both directions):
 * [ 4-byte LE JSON length ][ JSON header bytes ][ optional binary tail ]
 */
export function packFrame(header: unknown, binary?: Uint8Array): Uint8Array {
  const json = b4a.from(JSON.stringify(header), 'utf8')
  const lenPrefix = new Uint8Array(4)
  new DataView(lenPrefix.buffer, lenPrefix.byteOffset, 4).setUint32(0, json.byteLength, true)
  return binary && binary.byteLength > 0 ? b4a.concat([lenPrefix, json, binary]) : b4a.concat([lenPrefix, json])
}

export function unpackFrame(buf: Uint8Array): { header: any; binary: Uint8Array } {
  const headerLen = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, true)
  const header = JSON.parse(b4a.toString(buf.subarray(4, 4 + headerLen), 'utf8'))
  return { header, binary: buf.subarray(4 + headerLen) }
}
