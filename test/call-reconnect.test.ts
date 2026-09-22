import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Duplex } from 'streamx'
import b4a from 'b4a'
// @ts-ignore
import createTestnet from 'hyperdht/testnet.js'
import { Session } from '../src/app/session.js'
import type { SwarmTransport } from '../src/network/swarm.js'
import { attachCallRpc } from '../src/call/call-rpc.js'
import type { CallEndMessage, MediaFrameMessage } from '../src/call/call-encoding.js'
import { generateKeypair } from '../src/identity/keypair.js'
import type { Identity } from '../src/identity/index.js'

// ---------------------------------------------------------------------------
// A call outliving its connection, through a real `Session`.
//
// `call-desk.test.ts` holds the rules. What only a session can show is the wiring around them: that
// the socket closing reaches the desk as a hold rather than an ending, that the next connection from
// the same peer carries the call on, that the swarm is asked to dial that peer meanwhile — and that
// the app's own network resync, which closes every connection, no longer does so under a call just
// because the phone came back to the foreground.
// ---------------------------------------------------------------------------

let testnetPromise: Promise<{ bootstrap: unknown[]; destroy(): Promise<void> } | null> | null = null

function testnet(): Promise<{ bootstrap: unknown[] }> {
  testnetPromise ??= createTestnet(4)
  return testnetPromise.then((net) => ({ bootstrap: (net as { bootstrap: never }).bootstrap }))
}

after(async () => {
  const net = await testnetPromise
  if (net) await net.destroy()
})

function makeIdentity(): Identity {
  const kp = generateKeypair()
  return { ...kp, id: b4a.toString(kp.publicKey, 'hex') }
}

/** A stand-in for an already-authenticated connection — see `duplicate-connection.test.ts`. */
function duplexPair(): [Duplex, Duplex] {
  let a: Duplex
  let b: Duplex
  a = new Duplex({
    write(data: any, cb: (err?: Error | null) => void) { b.push(data); cb() },
    final(cb: (err?: Error | null) => void) { b.push(null); cb(null) }
  })
  b = new Duplex({
    write(data: any, cb: (err?: Error | null) => void) { a.push(data); cb() },
    final(cb: (err?: Error | null) => void) { a.push(null); cb(null) }
  })
  ;(a as unknown as { userData: unknown }).userData = null
  ;(b as unknown as { userData: unknown }).userData = null
  for (const stream of [a, b]) {
    ;(stream as unknown as { noiseStream: unknown }).noiseStream = stream
    ;(stream as unknown as { opened: Promise<boolean> }).opened = Promise.resolve(true)
  }
  return [a, b]
}

async function waitFor(check: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/**
 * The peer's side of one connection: it speaks only the call channel, and accepts any offer.
 *
 * `stillInCall` makes it a peer that kept its side of the call through the gap, as this build does:
 * told where the session is, it says where it is in return — which is what a reconnected call waits
 * for before it counts as back.
 */
function farEnd(socket: Duplex, peer: Identity, sessionId: string, { stillInCall = false } = {}) {
  const frames: MediaFrameMessage[] = []
  const ends: CallEndMessage[] = []
  let answered = false
  attachCallRpc(socket, {
    onCallOffer: (offer, channel) => {
      channel.sendCallAnswer({ callId: offer.callId, fromId: peer.id, accepted: true })
    },
    onCallControl: (message, channel) => {
      if (!stillInCall || answered) return
      answered = true
      channel.sendCallControl({ callId: message.callId, fromId: peer.id, action: 'unmute' })
    },
    onCallEnd: (message) => { ends.push(message) },
    onMediaFrame: (frame) => { frames.push(frame) }
  }, sessionId)
  return { frames, ends }
}

/** What the session asked of its swarm, without letting it act on a peer that is not on the DHT. */
function watchSwarm(session: Session) {
  const swarm = (session as unknown as { swarm: Record<string, (...args: any[]) => any> }).swarm
  const calls = { joinPeer: [] as string[], leavePeer: [] as string[], suspend: 0, resume: 0 }
  swarm.joinPeer = (key: Buffer) => { calls.joinPeer.push(b4a.toString(key, 'hex')) }
  swarm.leavePeer = (key: Buffer) => { calls.leavePeer.push(b4a.toString(key, 'hex')) }
  swarm.suspend = async () => { calls.suspend++ }
  swarm.resume = async () => { calls.resume++ }
  return calls
}

async function sessionWithLanSeam(t: { after(fn: () => Promise<void>): void }) {
  const net = await testnet()
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-call-reconnect-'))
  let inject: ((socket: Duplex, remotePublicKey: Buffer) => void) | null = null
  const transport: SwarmTransport = {
    bootstrap: net.bootstrap as never,
    createLanDiscovery: (onSocket) => {
      inject = onSocket
      return { join: () => {}, leave: () => {}, destroy: async () => {} }
    }
  }
  const identity = makeIdentity()
  const session = await Session.create(identity, path.join(base, 's'), { transport })
  t.after(async () => {
    await session.close()
    fs.rmSync(base, { recursive: true, force: true })
  })
  assert.ok(inject, 'the LAN seam should have been wired')
  return { session, identity, inject: inject as (socket: Duplex, remotePublicKey: Buffer) => void }
}

const frame = (callId: string): MediaFrameMessage => ({
  callId, seq: 1, timestamp: 0, kind: 1, keyframe: false, payload: new Uint8Array([1, 2, 3])
})

test('a call rides out its connection closing, and carries on over the next one', async (t) => {
  const { session, identity, inject } = await sessionWithLanSeam(t)
  const swarm = watchSwarm(session)
  const peer = makeIdentity()

  const [first, firstFar] = duplexPair()
  inject(first, peer.publicKey as unknown as Buffer)
  farEnd(firstFar, peer, identity.id)

  const info = await session.startCall(peer.id, 'room-1', { audio: true, video: false })
  await waitFor(() => session.getActiveCall()?.state === 'connected', 'the peer to answer')

  first.destroy()
  await waitFor(() => session.getActiveCall()?.reconnecting === true, 'the call to be held')
  assert.equal(session.getActiveCall()?.state, 'connected', 'the closed socket ended the call')
  await waitFor(() => swarm.joinPeer.length > 0, 'the swarm to be asked to dial the peer')
  assert.deepEqual(swarm.joinPeer, [peer.id])

  const [second, secondFar] = duplexPair()
  inject(second, peer.publicKey as unknown as Buffer)
  const far = farEnd(secondFar, peer, identity.id, { stillInCall: true })

  await waitFor(() => session.getActiveCall()?.reconnecting === false, 'the call to reattach')
  assert.equal(session.getActiveCall()?.callId, info.callId, 'the same call, not a new one')
  assert.deepEqual(swarm.leavePeer, [peer.id], 'and the peer goes back to being an ordinary one')

  session.sendCallFrame(frame(info.callId))
  await waitFor(() => far.frames.length === 1, 'media to arrive over the new connection')
})

test('hanging up while the peer is away tells it the moment it is back', async (t) => {
  const { session, identity, inject } = await sessionWithLanSeam(t)
  watchSwarm(session)
  const peer = makeIdentity()

  const [first, firstFar] = duplexPair()
  inject(first, peer.publicKey as unknown as Buffer)
  farEnd(firstFar, peer, identity.id)
  const info = await session.startCall(peer.id, 'room-1', { audio: true, video: false })
  await waitFor(() => session.getActiveCall()?.state === 'connected', 'the peer to answer')

  first.destroy()
  await waitFor(() => session.getActiveCall()?.reconnecting === true, 'the call to be held')
  session.endCall(info.callId)
  assert.equal(session.getActiveCall(), null)

  const [second, secondFar] = duplexPair()
  inject(second, peer.publicKey as unknown as Buffer)
  const far = farEnd(secondFar, peer, identity.id)

  await waitFor(() => far.ends.length === 1, 'the owed ending to be delivered')
  assert.deepEqual(far.ends[0], { callId: info.callId, fromId: identity.id, reason: 'hangup' })
})

test('coming back to the foreground does not resync the network under a live call', async (t) => {
  // `suspend()` closes every connection, the call's included. On a phone the foreground return is
  // very often the call itself — answering from the notification, the microphone permission
  // dialog closing — and resyncing then is what dropped the call a second after it was answered.
  const { session, identity, inject } = await sessionWithLanSeam(t)
  const swarm = watchSwarm(session)

  await session.resumeNetwork('foreground')
  assert.equal(swarm.suspend, 1, 'with no call up, a foreground return still resyncs')

  const peer = makeIdentity()
  const [socket, far] = duplexPair()
  inject(socket, peer.publicKey as unknown as Buffer)
  farEnd(far, peer, identity.id)
  await session.startCall(peer.id, 'room-1', { audio: true, video: false })
  await waitFor(() => session.getActiveCall()?.state === 'connected', 'the peer to answer')

  await session.resumeNetwork('foreground')
  assert.equal(swarm.suspend, 1, 'a foreground return resynced under a live call')

  // A real network change still does: the old network routes nowhere, and the call is held
  // across the rebind rather than kept on a connection that is already gone.
  await session.resumeNetwork('network-change')
  assert.equal(swarm.suspend, 2)
  await session.resumeNetwork()
  assert.equal(swarm.suspend, 3, 'and so does a caller that names no cause, as before')
})
