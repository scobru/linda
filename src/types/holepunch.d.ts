declare module 'b4a' {
  function from(input: string | Buffer | Uint8Array | ArrayLike<number>, encoding?: string): Buffer
  function toString(buf: Buffer | Uint8Array, encoding?: string): string
  function allocUnsafe(size: number): Buffer
  function alloc(size: number): Buffer
  function equals(a: Uint8Array, b: Uint8Array): boolean
  function isBuffer(value: unknown): boolean
  function concat(buffers: Buffer[] | Uint8Array[]): Buffer
  export { from, toString, allocUnsafe, alloc, equals, isBuffer, concat }
}

declare module 'hypercore-crypto' {
  export interface KeyPair {
    publicKey: Buffer
    secretKey: Buffer
  }
  function keyPair(seed?: Buffer): KeyPair
  function sign(message: Buffer, secretKey: Buffer): Buffer
  function verify(message: Buffer, signature: Buffer, publicKey: Buffer): boolean
  function discoveryKey(publicKey: Buffer): Buffer
  function hash(data: Buffer): Buffer
  const _default: { keyPair: typeof keyPair; sign: typeof sign; verify: typeof verify; discoveryKey: typeof discoveryKey; hash: typeof hash }
  export default _default
}

declare module 'sodium-universal' {
  const sodium: {
    crypto_secretbox_easy(ciphertext: Buffer, message: Buffer, nonce: Buffer, key: Buffer): void
    crypto_secretbox_open_easy(message: Buffer, ciphertext: Buffer, nonce: Buffer, key: Buffer): boolean
    crypto_secretbox_KEYBYTES: number
    crypto_secretbox_NONCEBYTES: number
    crypto_secretbox_MACBYTES: number
    crypto_pwhash(
      output: Buffer,
      passwd: Buffer,
      salt: Buffer,
      opslimit: number,
      memlimit: number,
      algorithm: number
    ): void
    crypto_pwhash_SALTBYTES: number
    crypto_pwhash_OPSLIMIT_MODERATE: number
    crypto_pwhash_MEMLIMIT_MODERATE: number
    crypto_pwhash_ALG_DEFAULT: number
    randombytes_buf(buf: Buffer): void
    sodium_memzero(buf: Buffer): void
  }
  export default sodium
}
