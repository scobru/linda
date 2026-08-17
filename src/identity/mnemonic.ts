import * as bip39 from 'bip39'
import type { Keypair } from './keypair.js'
import { generateKeypair } from './keypair.js'

export function generateMnemonic(): string {
  return bip39.generateMnemonic(128)
}

export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic.trim())
}

export function keypairFromMnemonic(mnemonic: string): Keypair {
  const seed = bip39.mnemonicToSeedSync(mnemonic.trim()).subarray(0, 32)
  return generateKeypair(seed)
}
