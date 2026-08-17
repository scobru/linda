import fs from 'node:fs'
import path from 'node:path'
import sodium from 'sodium-universal'
import b4a from 'b4a'
import type { Keypair } from './keypair.js'

interface EncryptedIdentityFile {
  publicKey: string
  salt: string
  nonce: string
  ciphertext: string
  /** Present only for mnemonic-derived identities (absent for paired-in identities, which never had one) — same derived key as `ciphertext`, separate nonce. */
  mnemonicNonce?: string
  mnemonicCiphertext?: string
}

const IDENTITY_FILE = 'identity.json'

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  const key = b4a.allocUnsafe(sodium.crypto_secretbox_KEYBYTES)
  sodium.crypto_pwhash(
    key,
    b4a.from(passphrase, 'utf8'),
    salt,
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    sodium.crypto_pwhash_ALG_DEFAULT
  )
  return key
}

function identityPath(storageDir: string): string {
  return path.join(storageDir, IDENTITY_FILE)
}

export function hasIdentity(storageDir: string): boolean {
  return fs.existsSync(identityPath(storageDir))
}

export function saveIdentity(keypair: Keypair, passphrase: string, storageDir: string, mnemonic?: string): void {
  const salt = b4a.allocUnsafe(sodium.crypto_pwhash_SALTBYTES)
  sodium.randombytes_buf(salt)

  const nonce = b4a.allocUnsafe(sodium.crypto_secretbox_NONCEBYTES)
  sodium.randombytes_buf(nonce)

  const key = deriveKey(passphrase, salt)
  const ciphertext = b4a.allocUnsafe(keypair.secretKey.length + sodium.crypto_secretbox_MACBYTES)
  sodium.crypto_secretbox_easy(ciphertext, keypair.secretKey, nonce, key)

  const file: EncryptedIdentityFile = {
    publicKey: b4a.toString(keypair.publicKey, 'hex'),
    salt: b4a.toString(salt, 'hex'),
    nonce: b4a.toString(nonce, 'hex'),
    ciphertext: b4a.toString(ciphertext, 'hex')
  }

  if (mnemonic) {
    const mnemonicNonce = b4a.allocUnsafe(sodium.crypto_secretbox_NONCEBYTES)
    sodium.randombytes_buf(mnemonicNonce)
    const mnemonicPlain = b4a.from(mnemonic, 'utf8')
    const mnemonicCiphertext = b4a.allocUnsafe(mnemonicPlain.length + sodium.crypto_secretbox_MACBYTES)
    sodium.crypto_secretbox_easy(mnemonicCiphertext, mnemonicPlain, mnemonicNonce, key)
    file.mnemonicNonce = b4a.toString(mnemonicNonce, 'hex')
    file.mnemonicCiphertext = b4a.toString(mnemonicCiphertext, 'hex')
  }

  sodium.sodium_memzero(key)

  fs.mkdirSync(storageDir, { recursive: true })
  fs.writeFileSync(identityPath(storageDir), JSON.stringify(file), { mode: 0o600 })
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('wrong passphrase')
  }
}

export function loadIdentity(passphrase: string, storageDir: string): Keypair {
  const raw = fs.readFileSync(identityPath(storageDir), 'utf8')
  const file: EncryptedIdentityFile = JSON.parse(raw)

  const salt = b4a.from(file.salt, 'hex')
  const nonce = b4a.from(file.nonce, 'hex')
  const ciphertext = b4a.from(file.ciphertext, 'hex')

  const key = deriveKey(passphrase, salt)
  const secretKey = b4a.allocUnsafe(ciphertext.length - sodium.crypto_secretbox_MACBYTES)
  const ok = sodium.crypto_secretbox_open_easy(secretKey, ciphertext, nonce, key)
  sodium.sodium_memzero(key)

  if (!ok) throw new WrongPassphraseError()

  return {
    publicKey: b4a.from(file.publicKey, 'hex'),
    secretKey
  }
}

/** Decrypts and returns the backup recovery phrase, re-checking the passphrase (not kept in memory after unlock). `null` if this identity was paired in rather than created from a mnemonic — it never had one. */
export function revealMnemonic(passphrase: string, storageDir: string): string | null {
  const raw = fs.readFileSync(identityPath(storageDir), 'utf8')
  const file: EncryptedIdentityFile = JSON.parse(raw)
  if (!file.mnemonicCiphertext || !file.mnemonicNonce) return null

  const salt = b4a.from(file.salt, 'hex')
  const key = deriveKey(passphrase, salt)
  const nonce = b4a.from(file.mnemonicNonce, 'hex')
  const ciphertext = b4a.from(file.mnemonicCiphertext, 'hex')
  const plain = b4a.allocUnsafe(ciphertext.length - sodium.crypto_secretbox_MACBYTES)
  const ok = sodium.crypto_secretbox_open_easy(plain, ciphertext, nonce, key)
  sodium.sodium_memzero(key)

  if (!ok) throw new WrongPassphraseError()
  return b4a.toString(plain, 'utf8')
}
