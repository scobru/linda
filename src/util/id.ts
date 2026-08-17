import sodium from 'sodium-universal'
import b4a from 'b4a'

export function randomId(bytes = 16): string {
  const buf = b4a.allocUnsafe(bytes)
  sodium.randombytes_buf(buf)
  return b4a.toString(buf, 'hex')
}
