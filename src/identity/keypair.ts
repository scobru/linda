import crypto from 'hypercore-crypto'

export interface Keypair {
  publicKey: Buffer
  secretKey: Buffer
}

export function generateKeypair(seed?: Buffer): Keypair {
  return crypto.keyPair(seed)
}
