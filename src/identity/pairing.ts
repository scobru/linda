import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import sodium from 'sodium-universal'
import crypto from 'hypercore-crypto'
import type { Keypair } from './keypair.js'

export interface PairingCode {
  topic: Buffer
  key: Buffer
}

/** What `joinPairing` resolves with. The snapshot is present only when the hosting device sent one
 * (i.e. it was running a version that gathers bookmarks/keys/contacts during pairing). Callers
 * that predate the snapshot simply received a bare `Keypair` — consumers must handle `undefined`. */
export interface PairingResult {
  keypair: Keypair
  snapshot?: Record<string, unknown>
}

export function encodePairingCode(code: PairingCode): string {
  return b4a.toString(code.topic, 'hex') + b4a.toString(code.key, 'hex')
}

export function decodePairingCode(text: string): PairingCode | null {
  const trimmed = text.trim()
  if (!/^[0-9a-f]{128}$/i.test(trimmed)) return null
  return {
    topic: b4a.from(trimmed.slice(0, 64), 'hex'),
    key: b4a.from(trimmed.slice(64), 'hex')
  }
}

function encryptPayload(keypair: Keypair, key: Buffer, snapshot?: Record<string, unknown>): Buffer {
  const payload: Record<string, unknown> = {
    publicKey: b4a.toString(keypair.publicKey, 'hex'),
    secretKey: b4a.toString(keypair.secretKey, 'hex')
  }
  if (snapshot) payload.snapshot = snapshot
  const plain = b4a.from(JSON.stringify(payload), 'utf8')
  const nonce = b4a.allocUnsafe(sodium.crypto_secretbox_NONCEBYTES)
  sodium.randombytes_buf(nonce)
  const cipher = b4a.allocUnsafe(plain.byteLength + sodium.crypto_secretbox_MACBYTES)
  sodium.crypto_secretbox_easy(cipher, plain, nonce, key)
  return b4a.concat([nonce, cipher])
}

function decryptPayload(raw: Buffer, key: Buffer): PairingResult {
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES
  const nonce = raw.subarray(0, nonceLen)
  const cipher = raw.subarray(nonceLen)
  const plain = b4a.allocUnsafe(cipher.byteLength - sodium.crypto_secretbox_MACBYTES)
  const ok = sodium.crypto_secretbox_open_easy(plain, cipher, nonce, key)
  if (!ok) throw new Error('decrypt failed')
  const parsed = JSON.parse(b4a.toString(plain, 'utf8'))
  return {
    keypair: { publicKey: b4a.from(parsed.publicKey, 'hex'), secretKey: b4a.from(parsed.secretKey, 'hex') },
    snapshot: parsed.snapshot
  }
}

/**
 * Runs on an already-unlocked device. Joins a fresh random topic (the pairing
 * "room"), and on the first incoming connection sends this device's identity
 * keypair, encrypted with a separate random key not derivable from the topic
 * (so DHT-level topic exposure alone doesn't leak the identity). One-shot —
 * closes after the first successful pair. Returns a stop function to cancel.
 *
 * `snapshot` is an optional JSON-serializable blob of state (bookmarks, room
 * keys, contacts, profile) for the joining device to import — so it doesn't
 * start with an empty room list after pairing.
 */
export function hostPairing(identity: Keypair, onReady: (code: string) => void, onPaired: () => void, snapshot?: Record<string, unknown>): () => void {
  const topic = b4a.allocUnsafe(32)
  sodium.randombytes_buf(topic)
  const key = b4a.allocUnsafe(sodium.crypto_secretbox_KEYBYTES)
  sodium.randombytes_buf(key)

  const swarm = new Hyperswarm({ keyPair: crypto.keyPair() })
  let done = false

  swarm.on('connection', (socket) => {
    if (done) { socket.destroy(); return }
    done = true
    socket.end(encryptPayload(identity, key, snapshot))
    socket.on('close', () => { void swarm.destroy(); onPaired() })
    socket.on('error', () => {})
  })

  void swarm.join(topic, { server: true, client: false }).flushed().then(() => onReady(encodePairingCode({ topic, key })))

  return () => { void swarm.destroy() }
}

/**
 * Runs on a fresh device with no identity yet. Joins the topic from a scanned
 * pairing code, receives the encrypted keypair (and optional snapshot) from
 * the hosting device, and resolves it for local persistence (caller still picks
 * a local passphrase and calls `pairIdentity`, exactly like the manual
 * recovery-phrase flow).
 */
export function joinPairing(code: PairingCode): Promise<PairingResult> {
  return new Promise((resolve, reject) => {
    const swarm = new Hyperswarm({ keyPair: crypto.keyPair() })
    const timeout = setTimeout(() => { void swarm.destroy(); reject(new Error('pairing timed out')) }, 30000)

    swarm.on('connection', (socket) => {
      const chunks: Buffer[] = []
      socket.on('data', (chunk) => chunks.push(chunk))
      socket.on('end', () => {
        clearTimeout(timeout)
        try {
          resolve(decryptPayload(b4a.concat(chunks), code.key))
        } catch {
          reject(new Error('invalid pairing code'))
        } finally {
          void swarm.destroy()
        }
      })
      socket.on('error', () => {})
    })

    void swarm.join(code.topic, { server: false, client: true })
  })
}
