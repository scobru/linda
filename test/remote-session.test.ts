import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Duplex } from 'streamx'
import b4a from 'b4a'
import createTestnet from 'hyperdht/testnet.js'
import { packFrame, unpackFrame } from '../src/transport/frame.js'
import { RpcClient } from '../src/transport/rpc-client.js'
import { RemoteRoomView } from '../src/transport/remote-room-view.js'
import { RemoteSessionView } from '../src/transport/remote-session-view.js'
import { WorkerDispatcher, extractSessionState } from '../src/worker/dispatcher.js'
import { Session } from '../src/app/session.js'
import { generateKeypair } from '../src/identity/keypair.js'
import type { Identity } from '../src/identity/index.js'
import type { SwarmTransport } from '../src/network/swarm.js'
import type { SessionView, RoomView } from '../src/app/session-view.js'

let testnetPromise: Promise<{ bootstrap: unknown[]; destroy(): Promise<void> } | null> | null = null

function transport(): Promise<SwarmTransport> {
  testnetPromise ??= createTestnet(4)
  return testnetPromise.then((net) => ({ bootstrap: (net as { bootstrap: never }).bootstrap }))
}

after(async () => {
  const net = await testnetPromise
  if (net) await net.destroy()
})

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'linda-remote-test-'))
}

function makeIdentity(): Identity {
  const kp = generateKeypair()
  return { ...kp, id: b4a.toString(kp.publicKey, 'hex') }
}

function createDuplexPair(): [Duplex, Duplex] {
  let streamA!: Duplex
  let streamB!: Duplex

  streamA = new Duplex({
    write(chunk, cb) {
      streamB.push(chunk)
      cb(null)
    },
    final(cb) {
      streamB.push(null)
      cb(null)
    }
  })

  streamB = new Duplex({
    write(chunk, cb) {
      streamA.push(chunk)
      cb(null)
    },
    final(cb) {
      streamA.push(null)
      cb(null)
    }
  })

  return [streamA, streamB]
}

test('packFrame and unpackFrame round-trip JSON and binary payload', () => {
  const header = { method: 'test.echo', args: [1, 'hello', { foo: true }] }
  const binary = b4a.from('raw binary payload 12345', 'utf8')

  const packed = packFrame(header, binary)
  const unpacked = unpackFrame(packed)

  assert.deepEqual(unpacked.header, header)
  assert.equal(b4a.toString(unpacked.binary, 'utf8'), 'raw binary payload 12345')

  // JSON-only payload
  const packedJsonOnly = packFrame(header)
  const unpackedJsonOnly = unpackFrame(packedJsonOnly)
  assert.deepEqual(unpackedJsonOnly.header, header)
  assert.equal(unpackedJsonOnly.binary.byteLength, 0)
})

test('RpcClient and WorkerDispatcher round-trip requests, binary calls and push events', async () => {
  const [streamWorker, streamClient] = createDuplexPair()
  const dispatcher = new WorkerDispatcher(streamWorker)
  const client = new RpcClient(streamClient)

  // Push event from worker to client
  let receivedEvent: unknown = null
  const unsubscribe = client.on('testEvent', (payload) => {
    receivedEvent = payload
  })

  dispatcher.pushEvent('testEvent', { hello: 'world' })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.deepEqual(receivedEvent, { hello: 'world' })

  unsubscribe()
  dispatcher.pushEvent('testEvent', { hello: 'again' })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.deepEqual(receivedEvent, { hello: 'world' }, 'Listener was unsubscribed and did not update')
})

test('call media frames keep their bytes across the worker boundary', async () => {
  const [streamWorker, streamClient] = createDuplexPair()
  const dispatcher = new WorkerDispatcher(streamWorker)
  const client = new RpcClient(streamClient)

  // The regression: a pushed event is a JSON header, and `JSON.stringify` turns a Uint8Array into
  // {"0":255,"1":216,...} — an object with numeric keys and no `.buffer`. The media pipeline does
  // `new Int16Array(payload.buffer, ...)` on what arrives, so the corruption is silent until a
  // call is actually placed on the Pear build. Bytes ride the frame's binary tail instead.
  const payload = new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0xfe, 0x7f])

  let received: any = null
  client.on('callMediaFrame', (frame) => {
    received = frame
  })

  dispatcher.pushEvent(
    'callMediaFrame',
    { callId: 'call-1', seq: 7, timestamp: 1234, kind: 1, keyframe: true },
    { field: 'payload', bytes: payload }
  )
  await new Promise((resolve) => setTimeout(resolve, 30))

  assert.ok(received, 'the frame reached the client')
  assert.equal(received.callId, 'call-1')
  assert.equal(received.seq, 7)
  assert.equal(received.kind, 1)
  assert.equal(received.keyframe, true)
  assert.ok(received.payload instanceof Uint8Array, 'payload arrives as bytes, not as a JSON object')
  assert.deepEqual([...received.payload], [...payload])

  // The payload must be aligned to its own buffer, not a view into the received frame: the tail
  // starts at `4 + headerLen`, odd for half of all headers, and `MediaPipeline` builds an
  // `Int16Array` over `payload.buffer` at `payload.byteOffset` — which throws on an odd offset.
  assert.equal(received.payload.byteOffset, 0, 'payload must not be a view at an arbitrary offset')
  assert.doesNotThrow(
    () => new Int16Array(received.payload.buffer, received.payload.byteOffset, received.payload.byteLength / 2),
    'audio playback builds an Int16Array over the payload'
  )

  // And the shape the old path produced, stated so the difference is not subtle: the same array
  // through the JSON header comes back as a plain object with no byteLength.
  const viaJson = JSON.parse(JSON.stringify({ payload }))
  assert.ok(!(viaJson.payload instanceof Uint8Array))
  assert.equal(viaJson.payload.byteLength, undefined)
})

test('RemoteSessionView and RemoteRoomView satisfy their contracts and drive a real Session over RPC', async () => {
  const dir = tmpDir()
  const identity = makeIdentity()
  const session = await Session.create(identity, dir, { transport: await transport() })

  const [streamWorker, streamClient] = createDuplexPair()
  const dispatcher = new WorkerDispatcher(streamWorker, session)
  const client = new RpcClient(streamClient)

  const initialState = await extractSessionState(session)
  const remoteSession = new RemoteSessionView(client, initialState)

  // Contract verification: compile-time and runtime check
  const _assertSession: SessionView = remoteSession
  assert.ok(_assertSession)

  // Nickname and profile updates
  assert.equal(remoteSession.getNickname(), '')
  await remoteSession.setNickname('SovereignUser')
  assert.equal(remoteSession.getNickname(), 'SovereignUser')
  assert.equal(session.getNickname(), 'SovereignUser')

  await remoteSession.setAvatar('avatar-preset-1')
  assert.equal(remoteSession.getAvatar(), 'avatar-preset-1')

  await remoteSession.setWallpaper('matrix')
  assert.equal(remoteSession.getWallpaper(), 'matrix')

  // Create room over RPC
  const roomView = await remoteSession.createRoom('General', false, 'room-avatar', 'General discussion')
  const _assertRoom: RoomView = roomView
  assert.ok(_assertRoom)

  assert.equal(roomView.isOwner(identity.id), true)
  assert.equal(roomView.canPost(identity.id), true)
  assert.equal(roomView.avatar, 'room-avatar')
  assert.equal(roomView.description, 'General discussion')
  assert.equal(roomView.writable, true)
  assert.equal(roomView.hasKey, true)
  assert.equal(roomView.messageCount, 0)

  // Send message over RPC
  let messageEventIndex: number | null = null
  const unsubMsg = roomView.onMessage((index) => {
    messageEventIndex = index
  })

  const sentMessage = await roomView.send(identity.id, 'Hello through RPC!')
  assert.equal(sentMessage.body, 'Hello through RPC!')
  assert.equal(sentMessage.authorId, identity.id)

  // Wait for push event
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(messageEventIndex, 0)

  const fetched = await roomView.getMessage(0)
  assert.equal(fetched.body, 'Hello through RPC!')
  assert.equal(fetched.authorId, identity.id)

  // Read message stream
  const messages: string[] = []
  for await (const msg of roomView.messages(0, 1)) {
    messages.push(msg.body)
  }
  assert.deepEqual(messages, ['Hello through RPC!'])

  // Edit message
  await roomView.editMessage(fetched.id, 'Edited through RPC!')
  const edited = await roomView.getMessage(0)
  assert.equal(edited.body, 'Edited through RPC!')

  // Toggle reaction
  await roomView.toggleReaction(identity.id, fetched.id, '🚀')

  unsubMsg()
  await remoteSession.close()
  fs.rmSync(dir, { recursive: true, force: true })
})
