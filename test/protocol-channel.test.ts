import test from 'node:test'
import assert from 'node:assert/strict'
import { Duplex } from 'streamx'
import { attachRpc, rpcChannel, type RpcChannel } from '../src/network/rpc.js'
import { attachCallRpc, callRpcChannel } from '../src/call/call-rpc.js'

// ---------------------------------------------------------------------------
// The channels had no test of their own: whether a message sent as `sendTyping` arrives as
// `onTyping`, whether the sender check actually drops a forgery, and whether the registration
// order — which is what Protomux turns into a message's wire id — is the one the other build uses.
// All three were things you could only find out against a real peer on a different version.
// ---------------------------------------------------------------------------

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
  // `Protomux.from` only caches its mux on the stream when `userData` is already `null` — which is
  // what a real `@hyperswarm/secret-stream` connection gives it. Without that, attaching a second
  // protocol builds a second mux over the same bytes and both connections die on "Invalid open
  // message", so the harness has to look like the transport here.
  ;(a as unknown as { userData: unknown }).userData = null
  ;(b as unknown as { userData: unknown }).userData = null
  return [a, b]
}

/** Resolves on the next delivery, or rejects if nothing arrives — a dropped message is a pass or a
 *  failure depending on the test, so both outcomes have to be observable. */
function delivery<T>(ms = 100): { resolve: (value: T) => void; settled: Promise<T | 'nothing'> } {
  let resolve!: (value: T) => void
  const settled = new Promise<T | 'nothing'>((done) => {
    resolve = done
    setTimeout(() => done('nothing'), ms)
  })
  return { resolve, settled }
}

const ALICE = 'a'.repeat(64)
const MALLORY = 'b'.repeat(64)

test('the registration order is the wire contract, so it is written down', () => {
  // Protomux numbers messages by position: `addMessage` does `const type = this.messages.length`.
  // Reordering the declaration therefore repoints every id, and two builds that disagree decode
  // each other's frames as the wrong message — silently, and only peer-to-peer. Appending is safe;
  // this test is here so a reorder or a removal has to be deliberate.
  assert.deepEqual(
    rpcChannel.messages.map(([name]) => name),
    ['typing', 'presence', 'readReceipt', 'requestWrite', 'roomAnnounce', 'contactRequest', 'contactResponse', 'roomKey']
  )
  assert.deepEqual(
    callRpcChannel.messages.map(([name]) => name),
    ['callOffer', 'callAnswer', 'callEnd', 'callControl', 'mediaFrame']
  )
})

test('every declared message has a send and a handler, spelled the way callers spell them', () => {
  const [a, b] = duplexPair()
  const channel = attachRpc(a, {})
  attachCallRpc(b, {})

  for (const [name] of rpcChannel.messages) {
    const send = `send${name[0]!.toUpperCase()}${name.slice(1)}`
    assert.equal(typeof (channel as unknown as Record<string, unknown>)[send], 'function', `${send} is missing`)
  }
  assert.equal(typeof channel.close, 'function')
})

test('a message sent on one side arrives at the matching handler on the other', async () => {
  const [a, b] = duplexPair()
  const typing = delivery<{ roomId: string; userId: string; typing: boolean }>()
  const key = delivery<{ roomId: string; epoch: number; key: string }>()

  attachRpc(b, {
    onTyping: (message) => typing.resolve(message),
    onRoomKey: (message) => key.resolve(message)
  }, ALICE)
  const alice = attachRpc(a, {}, ALICE)

  alice.sendTyping({ roomId: 'r1', userId: ALICE, typing: true })
  alice.sendRoomKey({ roomId: 'r1', epoch: 3, key: 'deadbeef' })

  assert.deepEqual(await typing.settled, { roomId: 'r1', userId: ALICE, typing: true })
  assert.deepEqual(await key.settled, { roomId: 'r1', epoch: 3, key: 'deadbeef' })
})

test('call messages ride their own channel on the same socket', async () => {
  const [a, b] = duplexPair()
  const offer = delivery<{ callId: string; fromId: string; roomId: string; audio: boolean; video: boolean }>()
  const frame = delivery<{ payload: Uint8Array }>()

  // Both protocols on one connection, which is how a real peer runs them.
  attachRpc(b, {}, ALICE)
  attachCallRpc(b, {
    onCallOffer: (message) => offer.resolve(message),
    onMediaFrame: (message) => frame.resolve(message)
  }, ALICE)
  attachRpc(a, {}, ALICE)
  const alice = attachCallRpc(a, {}, ALICE)

  alice.sendCallOffer({ callId: 'c1', fromId: ALICE, roomId: 'r1', audio: true, video: false })
  alice.sendMediaFrame({
    callId: 'c1', seq: 1, timestamp: 7, kind: 0, keyframe: false, payload: new Uint8Array([0, 255, 0])
  })

  assert.deepEqual(await offer.settled, { callId: 'c1', fromId: ALICE, roomId: 'r1', audio: true, video: false })
  const delivered = await frame.settled
  assert.notEqual(delivered, 'nothing')
  assert.deepEqual([...(delivered as { payload: Uint8Array }).payload], [0, 255, 0])
})

test('a handler can answer on the connection the message arrived on', async () => {
  // What the write-request handler does: the room key goes back to the peer that asked, not to
  // every peer. The channel is the second argument precisely so it cannot be sent anywhere else.
  const [a, b] = duplexPair()
  const answered = delivery<{ roomId: string; epoch: number; key: string }>()

  attachRpc(b, {
    onRequestWrite: (_message, channel: RpcChannel) => {
      channel.sendRoomKey({ roomId: 'r1', epoch: 1, key: 'cafe' })
    }
  }, ALICE)
  const alice = attachRpc(a, { onRoomKey: (message) => answered.resolve(message) }, ALICE)

  alice.sendRequestWrite({ bootstrapKey: 'bk', writerKey: 'wk', identityId: ALICE, inviteCode: '' })
  assert.deepEqual(await answered.settled, { roomId: 'r1', epoch: 1, key: 'cafe' })
})

test('a message whose declared sender is not the peer that sent it is dropped', async () => {
  // The forgery this closes: any peer on the lobby topic could claim a contact request came from
  // someone else, and the reply — routed by `fromId` — would go to a different socket than the one
  // that asked. The connection is Noise-authenticated; the field in the frame is not.
  const [a, b] = duplexPair()
  const arrived = delivery<{ fromId: string }>()

  attachRpc(b, { onContactRequest: (message) => arrived.resolve(message) }, MALLORY)
  const mallory = attachRpc(a, {}, MALLORY)

  mallory.sendContactRequest({ fromId: ALICE, nickname: 'Ada', avatar: '' })
  assert.equal(await arrived.settled, 'nothing', 'a forged contact request reached the handler')
})

test('the same message from the peer it claims to be is delivered', async () => {
  const [a, b] = duplexPair()
  const arrived = delivery<{ fromId: string; nickname: string }>()

  attachRpc(b, { onContactRequest: (message) => arrived.resolve(message) }, ALICE)
  attachRpc(a, {}, ALICE).sendContactRequest({ fromId: ALICE, nickname: 'Ada', avatar: '' })

  const message = await arrived.settled
  assert.notEqual(message, 'nothing')
  assert.equal((message as { nickname: string }).nickname, 'Ada')
})

test('presence, typing and read receipts are checked too — they name their sender', async () => {
  // A spoofed presence is not cosmetic: the session writes `nickname` and `avatar` into its peer
  // caches keyed by `userId`, and renames a contact bound from a link. A peer that could claim
  // any `userId` could rewrite another identity's name and picture in your contact list.
  const [a, b] = duplexPair()
  const presence = delivery<{ userId: string }>()
  const typing = delivery<{ userId: string }>()
  const receipt = delivery<{ userId: string }>()

  attachRpc(b, {
    onPresence: (message) => presence.resolve(message),
    onTyping: (message) => typing.resolve(message),
    onReadReceipt: (message) => receipt.resolve(message)
  }, MALLORY)
  const mallory = attachRpc(a, {}, MALLORY)

  mallory.sendPresence({ userId: ALICE, online: true, nickname: 'Ada', avatar: 'data:x' })
  mallory.sendTyping({ roomId: 'r1', userId: ALICE, typing: true })
  mallory.sendReadReceipt({ roomId: 'r1', userId: ALICE, messageId: 'm1' })

  assert.equal(await presence.settled, 'nothing', 'a forged presence reached the handler')
  assert.equal(await typing.settled, 'nothing', 'a forged typing indicator reached the handler')
  assert.equal(await receipt.settled, 'nothing', 'a forged read receipt reached the handler')
})

test('a room announce is not checked, because its author is not its sender', async () => {
  // Peers re-announce their whole directory on connect, including rooms somebody else made.
  // Checking `authorId` here would silently break discovery rather than protect anything.
  const [a, b] = duplexPair()
  const arrived = delivery<{ roomId: string; authorId: string }>()

  attachRpc(b, { onRoomAnnounce: (message) => arrived.resolve(message) }, MALLORY)
  attachRpc(a, {}, MALLORY).sendRoomAnnounce({
    roomId: 'r1', name: 'Room', bootstrapKey: 'bk', authorId: ALICE, inviteCode: '', avatar: '', description: ''
  })

  const message = await arrived.settled
  assert.notEqual(message, 'nothing', 'a relayed room announce was dropped')
  assert.equal((message as { authorId: string }).authorId, ALICE)
})

test('without a remote identity nothing is dropped', async () => {
  // A socket that has not been authenticated has no identity to check against, and a channel that
  // quietly dropped everything in that case would be far harder to diagnose than one that doesn't.
  const [a, b] = duplexPair()
  const arrived = delivery<{ fromId: string }>()

  attachRpc(b, { onContactRequest: (message) => arrived.resolve(message) })
  attachRpc(a, {}).sendContactRequest({ fromId: ALICE, nickname: 'Ada', avatar: '' })

  assert.notEqual(await arrived.settled, 'nothing')
})

test('a handler replaced after attach is the one that runs', async () => {
  // The worker dispatcher wraps `onPresence` on the handlers object it already handed over.
  const [a, b] = duplexPair()
  const arrived = delivery<string>()

  const handlers: { onTyping?: (message: { userId: string }) => void } = {
    onTyping: () => arrived.resolve('the original')
  }
  attachRpc(b, handlers, ALICE)
  handlers.onTyping = () => arrived.resolve('the replacement')

  attachRpc(a, {}, ALICE).sendTyping({ roomId: 'r1', userId: ALICE, typing: true })
  assert.equal(await arrived.settled, 'the replacement')
})

test('a send that throws inside the transport is swallowed rather than taking the session down', () => {
  // A peer's socket can die between the snapshot a caller iterates (the write-request retry timer
  // walks `this.peers` every 15s) and the send itself. `close` only fires once the stream fully
  // finishes, so the channel still looks usable — and Protomux allocates its frame through the
  // stream's own `alloc`, which is where a torn-down secret-stream throws. No caller checks a
  // return value, so uncaught this reached the top level and took the session with it.
  //
  // Closing the channel is *not* this case: Protomux returns false for a closed session and never
  // throws, which is why the failure only ever showed up against a flaky real connection.
  const [a] = duplexPair()
  let torn = false
  ;(a as unknown as { alloc: (size: number) => Uint8Array }).alloc = (size: number) => {
    if (torn) throw new Error('stream destroyed')
    return new Uint8Array(size)
  }
  const channel = attachRpc(a, {}, ALICE)
  torn = true

  assert.doesNotThrow(() => channel.sendTyping({ roomId: 'r1', userId: ALICE, typing: true }))
})
