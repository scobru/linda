import b4a from 'b4a'
import type { Keypair } from './keypair.js'
import { hasIdentity, saveIdentity, loadIdentity, revealMnemonic as revealMnemonicFromStorage, WrongPassphraseError } from './storage.js'
import { generateMnemonic, validateMnemonic, keypairFromMnemonic } from './mnemonic.js'

export { WrongPassphraseError, validateMnemonic }
export const revealMnemonic = revealMnemonicFromStorage

export interface Identity {
  publicKey: Buffer
  secretKey: Buffer
  id: string
}

function toIdentity(keypair: Keypair): Identity {
  return { ...keypair, id: b4a.toString(keypair.publicKey, 'hex') }
}

export function identityExists(storageDir: string): boolean {
  return hasIdentity(storageDir)
}

export function createIdentity(passphrase: string, storageDir: string): { identity: Identity; mnemonic: string } {
  const mnemonic = generateMnemonic()
  const keypair = keypairFromMnemonic(mnemonic)
  saveIdentity(keypair, passphrase, storageDir, mnemonic)
  return { identity: toIdentity(keypair), mnemonic }
}

export function unlockIdentity(passphrase: string, storageDir: string): Identity {
  const keypair = loadIdentity(passphrase, storageDir)
  return toIdentity(keypair)
}

export function recoverIdentity(mnemonic: string, passphrase: string, storageDir: string): Identity {
  if (!validateMnemonic(mnemonic)) throw new Error('invalid recovery phrase')
  const keypair = keypairFromMnemonic(mnemonic)
  saveIdentity(keypair, passphrase, storageDir, mnemonic)
  return toIdentity(keypair)
}

/** Persists a keypair received via device pairing (see `identity/pairing.ts`) — same storage path as recoverIdentity, minus the mnemonic derivation since the keypair already arrived directly. */
export function pairIdentity(keypair: Keypair, passphrase: string, storageDir: string): Identity {
  saveIdentity(keypair, passphrase, storageDir)
  return toIdentity(keypair)
}
