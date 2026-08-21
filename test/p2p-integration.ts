import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import b4a from 'b4a'
import { generateKeypair } from '../src/identity/keypair.js'
import { Session } from '../src/app/session.js'
import type { Identity } from '../src/identity/index.js'

function makeIdentity(): Identity {
  const kp = generateKeypair()
  return { ...kp, id: b4a.toString(kp.publicKey, 'hex') }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(check: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for: ${label}`)
    await wait(200)
  }
}

async function main(): Promise<void> {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-pear-test-'))
  const dirA = path.join(base, 'a')
  const dirB = path.join(base, 'b')

  const identityA = makeIdentity()
  const identityB = makeIdentity()

  console.log('identity A:', identityA.id.slice(0, 12))
  console.log('identity B:', identityB.id.slice(0, 12))

  const sessionA = await Session.create(identityA, dirA, {
    onPeerConnected: (p) => console.log('[A] peer connected', b4a.toString(p.remotePublicKey, 'hex').slice(0, 12))
  })
  const sessionB = await Session.create(identityB, dirB, {
    onPeerConnected: (p) => console.log('[B] peer connected', b4a.toString(p.remotePublicKey, 'hex').slice(0, 12))
  })

  console.log('A creating room...')
  const roomA = await sessionA.createRoom('test-room')
  const bootstrapHex = b4a.toString(roomA.bootstrapKey, 'hex')
  const invite = sessionA.inviteLinkFor(roomA.id) // already `bootstrapKeyHex:inviteCode`

  console.log('B joining room...')
  const roomB = await sessionB.joinRoomByKey('test-room', invite)

  console.log('waiting for swarm connection (real Hyperswarm/DHT)...')
  await waitFor(() => sessionA.peers.size > 0 && sessionB.peers.size > 0, 30000, 'peer connection')
  console.log('peers connected')

  // Write access and the room's content key both arrive over the RPC grant flow that
  // `joinRoomByKey`'s invite code triggers — no manual addWriter.
  console.log('waiting for B to be granted write access and the room key...')
  await waitFor(() => roomB.writable && roomB.hasKey, 30000, 'write grant + key')

  console.log('B sending message...')
  await roomB.send(identityB.id, 'hello from B')

  console.log('waiting for message to replicate to A...')
  await waitFor(() => roomA.messageCount > 0, 15000, 'message replication to A')

  const received = await roomA.getMessage(0)
  console.log('A received:', received.body, 'from', received.authorId.slice(0, 12))

  if (received.body !== 'hello from B' || received.authorId !== identityB.id) {
    throw new Error('message mismatch')
  }

  console.log('PASS: multi-writer chat replicated correctly over real Hyperswarm')

  await sessionA.close()
  await sessionB.close()
  fs.rmSync(base, { recursive: true, force: true })
  process.exit(0)
}

main().catch((err) => {
  console.error('FAIL:', err)
  process.exit(1)
})
