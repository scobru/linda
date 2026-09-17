import test, { after } from 'node:test'
import { OPUS, PCM16 } from '../src/call/audio-codec.js'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import b4a from 'b4a'
import createTestnet from 'hyperdht/testnet.js'
import { generateKeypair } from '../src/identity/keypair.js'
import { Session, type CallInfo } from '../src/app/session.js'
import type { Identity } from '../src/identity/index.js'
import type { SwarmTransport } from '../src/network/swarm.js'
import type { MediaFrameMessage } from '../src/call/call-encoding.js'

let testnetPromise: Promise<{ bootstrap: unknown[]; destroy(): Promise<void> } | null> | null = null

function transport(): Promise<SwarmTransport> {
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

async function waitFor(check: () => boolean, label: string, timeoutMs = 20_000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

interface CallTestPair {
  sessionA: Session
  sessionB: Session
  identityA: Identity
  identityB: Identity
  roomId: string
  incomingCallsB: CallInfo[]
  framesB: MediaFrameMessage[]
  pressureA: boolean[]
}

async function createCallPair(t: { after(fn: () => Promise<void>): void }): Promise<CallTestPair> {
  const net = await transport()
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-call-test-'))
  const identityA = makeIdentity()
  const identityB = makeIdentity()

  const incomingCallsB: CallInfo[] = []
  const framesB: MediaFrameMessage[] = []
  const pressureA: boolean[] = []

  const sessionA = await Session.create(identityA, path.join(base, 'a'), {
    transport: net,
    events: {
      onCallMediaPressure: (wantsMore) => pressureA.push(wantsMore)
    }
  })
  const sessionB = await Session.create(identityB, path.join(base, 'b'), {
    transport: net,
    events: {
      onIncomingCall: (info) => incomingCallsB.push(info),
      onCallMediaFrame: (frame) => framesB.push(frame)
    }
  })

  t.after(async () => {
    await sessionA.close()
    await sessionB.close()
    fs.rmSync(base, { recursive: true, force: true })
  })

  const roomA = await sessionA.createRoom('call-test-room')
  const invite = sessionA.inviteLinkFor(roomA.id)
  const roomB = await sessionB.joinRoomByKey('call-test-room', invite)

  await waitFor(() => sessionA.peers.size > 0 && sessionB.peers.size > 0, 'sessions to connect')
  await waitFor(() => roomB.writable && roomB.hasKey, 'B to be ready in room')

  return { sessionA, sessionB, identityA, identityB, roomId: roomA.id, incomingCallsB, framesB, pressureA }
}

test('1:1 call offer, accept, media frame, control, and hangup', async (t) => {
  const { sessionA, sessionB, identityA, identityB, roomId, incomingCallsB, framesB } = await createCallPair(t)

  // 1. A dials B with audio & video
  const callInfoA = await sessionA.startCall(identityB.id, roomId, { audio: true, video: true })
  assert.equal(callInfoA.state, 'calling')
  assert.equal(callInfoA.direction, 'outgoing')
  assert.equal(callInfoA.media.audio, true)
  assert.equal(callInfoA.media.video, true)

  // 2. Wait for B to receive incoming call offer
  await waitFor(() => incomingCallsB.length > 0, 'B to receive call offer')
  const incomingB = incomingCallsB[0]!
  assert.equal(incomingB.callId, callInfoA.callId)
  assert.equal(incomingB.peerId, identityA.id)
  assert.equal(incomingB.state, 'ringing')
  assert.equal(incomingB.direction, 'incoming')
  assert.equal(incomingB.media.video, true)

  // 3. B accepts the call
  sessionB.answerCall(incomingB.callId, true)

  // Both should reach 'connected' state
  await waitFor(() => sessionA.getActiveCall()?.state === 'connected', 'A to be connected')
  await waitFor(() => sessionB.getActiveCall()?.state === 'connected', 'B to be connected')

  assert.equal(sessionA.getActiveCall()?.state, 'connected')
  assert.equal(sessionB.getActiveCall()?.state, 'connected')

  // 4. Send control message (A mutes microphone)
  sessionA.sendCallControl('mute')
  await waitFor(() => sessionB.getActiveCall()?.remoteMuted === true, 'B to receive mute status')
  assert.equal(sessionB.getActiveCall()?.remoteMuted, true)

  // 5. Send media frame from A to B
  const samplePayload = new Uint8Array([1, 2, 3, 4, 5])
  sessionA.sendCallFrame({
    callId: callInfoA.callId,
    seq: 1,
    timestamp: Date.now(),
    kind: 0,
    keyframe: true,
    payload: samplePayload
  })

  await waitFor(() => framesB.length > 0, 'B to receive media frame')
  assert.equal(framesB[0]!.callId, callInfoA.callId)
  assert.equal(framesB[0]!.kind, 0)
  assert.deepEqual(Array.from(framesB[0]!.payload), [1, 2, 3, 4, 5])

  // 6. Hangup from A
  sessionA.endCall(callInfoA.callId)

  await waitFor(() => sessionA.getActiveCall() === null, 'A active call to clear')
  await waitFor(() => sessionB.getActiveCall() === null, 'B active call to clear')
})

test('1:1 call rejection', async (t) => {
  const { sessionA, sessionB, identityA, identityB, roomId, incomingCallsB } = await createCallPair(t)

  // A dials B audio only
  const callInfoA = await sessionA.startCall(identityB.id, roomId, { audio: true, video: false })
  assert.equal(callInfoA.media.video, false)

  await waitFor(() => incomingCallsB.length > 0, 'B to receive call offer')

  // B declines call
  sessionB.answerCall(incomingCallsB[0]!.callId, false)

  await waitFor(() => sessionA.getActiveCall() === null, 'A active call to end on rejection')
  assert.equal(sessionA.getActiveCall(), null)
  assert.equal(sessionB.getActiveCall(), null)
})

test('backpressure is reported as transitions, not once per frame', async (t) => {
  const { sessionA, sessionB, identityB, roomId, incomingCallsB, pressureA } = await createCallPair(t)

  const callInfoA = await sessionA.startCall(identityB.id, roomId, { audio: true, video: false })
  await waitFor(() => incomingCallsB.length > 0, 'B to receive call offer')
  sessionB.answerCall(incomingCallsB[0]!.callId, true)
  await waitFor(() => sessionA.getActiveCall()?.state === 'connected', 'A to be connected')

  // Six seconds of audio (512 samples at 16kHz is ~31 packets a second) pushed in one synchronous
  // loop, with none of the pacing a real capture loop has. It fills the send buffer — which is the
  // case this whole mechanism exists for, and the reason the old code's frames were arriving late
  // rather than being dropped.
  const payload = new Uint8Array(1024)
  for (let seq = 0; seq < 200; seq++) {
    sessionA.sendCallFrame({
      callId: callInfoA.callId,
      seq,
      timestamp: Date.now(),
      kind: 0,
      keyframe: true,
      payload
    })
  }

  // What matters is that the producer is told when the answer *changes*. A report per frame would
  // put 200 events on the pipe — on the worker path, across a process boundary, to relieve
  // congestion.
  assert.ok(pressureA.length < 10, `expected a handful of transitions, got ${pressureA.length}`)
  for (let i = 1; i < pressureA.length; i++) {
    assert.notEqual(pressureA[i], pressureA[i - 1], `entry ${i} repeats its predecessor`)
  }
  // And the burst must actually have been felt, or this asserts nothing.
  assert.ok(pressureA.includes(false), 'a buffer filled that fast must have reported it')

  sessionA.endCall(callInfoA.callId)
  await waitFor(() => sessionA.getActiveCall() === null, 'A active call to clear')
})

test('a frame sent with no call up reports the wire as unable to take more', async (t) => {
  const { sessionA, sessionB, identityB, roomId, incomingCallsB, pressureA } = await createCallPair(t)

  const callInfoA = await sessionA.startCall(identityB.id, roomId, { audio: true, video: false })
  await waitFor(() => incomingCallsB.length > 0, 'B to receive call offer')
  sessionB.answerCall(incomingCallsB[0]!.callId, true)
  await waitFor(() => sessionA.getActiveCall()?.state === 'connected', 'A to be connected')

  sessionA.endCall(callInfoA.callId)
  await waitFor(() => sessionA.getActiveCall() === null, 'A active call to clear')

  const before = pressureA.length
  // A frame for a call that is over goes nowhere, and "went nowhere" must not read as "the wire is
  // keeping up" — a producer told that would speed up into a socket that is gone.
  sessionA.sendCallFrame({
    callId: callInfoA.callId,
    seq: 1,
    timestamp: Date.now(),
    kind: 0,
    keyframe: true,
    payload: new Uint8Array(16)
  })
  assert.deepEqual(pressureA.slice(before), [false])
})

test('two peers that can both run Opus negotiate it end to end', async (t) => {
  const { sessionA, sessionB, identityB, roomId, incomingCallsB } = await createCallPair(t)

  // What each shell says its media pipeline can run — on the desktop this comes from an async
  // probe of the browser (`MediaPipeline.supportedAudioCodecs`).
  sessionA.setAudioCodecs([OPUS, PCM16])
  sessionB.setAudioCodecs([OPUS, PCM16])

  const callInfoA = await sessionA.startCall(identityB.id, roomId, { audio: true, video: false })
  await waitFor(() => incomingCallsB.length > 0, 'B to receive call offer')
  sessionB.answerCall(incomingCallsB[0]!.callId, true)

  await waitFor(() => sessionA.getActiveCall()?.state === 'connected', 'A to be connected')
  await waitFor(() => sessionB.getActiveCall()?.state === 'connected', 'B to be connected')

  // Both ends must hold the same value, or one is encoding what the other is not listening for.
  assert.equal(sessionB.getActiveCall()?.audioCodec, OPUS, 'the answerer chose')
  assert.equal(sessionA.getActiveCall()?.audioCodec, OPUS, 'and the caller learned it from the answer')

  sessionA.endCall(callInfoA.callId)
  await waitFor(() => sessionA.getActiveCall() === null, 'A active call to clear')
})

test('a peer that cannot run Opus drags the call down to the floor, from either side', async (t) => {
  const { sessionA, sessionB, identityB, roomId, incomingCallsB } = await createCallPair(t)

  // The answerer is the one that cannot run it. It picks, so it picks what it can speak.
  sessionA.setAudioCodecs([OPUS, PCM16])
  sessionB.setAudioCodecs([PCM16])

  const first = await sessionA.startCall(identityB.id, roomId, { audio: true, video: false })
  await waitFor(() => incomingCallsB.length > 0, 'B to receive call offer')
  sessionB.answerCall(incomingCallsB[0]!.callId, true)
  await waitFor(() => sessionA.getActiveCall()?.state === 'connected', 'A to be connected')
  await waitFor(() => sessionB.getActiveCall()?.state === 'connected', 'B to be connected')

  assert.equal(sessionA.getActiveCall()?.audioCodec, PCM16)
  assert.equal(sessionB.getActiveCall()?.audioCodec, PCM16)

  sessionA.endCall(first.callId)
  await waitFor(() => sessionA.getActiveCall() === null, 'A active call to clear')
  await waitFor(() => sessionB.getActiveCall() === null, 'B active call to clear')

  // And the mirror: now the caller is the limited one, so the offer never lists Opus at all.
  sessionA.setAudioCodecs([PCM16])
  sessionB.setAudioCodecs([OPUS, PCM16])

  const before = incomingCallsB.length
  const second = await sessionA.startCall(identityB.id, roomId, { audio: true, video: false })
  await waitFor(() => incomingCallsB.length > before, 'B to receive the second offer')
  sessionB.answerCall(incomingCallsB[before]!.callId, true)
  await waitFor(() => sessionA.getActiveCall()?.state === 'connected', 'A to be connected again')
  await waitFor(() => sessionB.getActiveCall()?.state === 'connected', 'B to be connected again')

  assert.equal(sessionA.getActiveCall()?.audioCodec, PCM16)
  assert.equal(sessionB.getActiveCall()?.audioCodec, PCM16)

  sessionA.endCall(second.callId)
  await waitFor(() => sessionA.getActiveCall() === null, 'A active call to clear')
})

test('a session that never declared a capability still places and answers calls', async (t) => {
  // The window before the browser probe finishes, and every build that predates it. Nothing is
  // configured, so the floor is what both ends get — and the floor is a working call.
  const { sessionA, sessionB, identityB, roomId, incomingCallsB } = await createCallPair(t)

  const info = await sessionA.startCall(identityB.id, roomId, { audio: true, video: false })
  await waitFor(() => incomingCallsB.length > 0, 'B to receive call offer')
  sessionB.answerCall(incomingCallsB[0]!.callId, true)
  await waitFor(() => sessionA.getActiveCall()?.state === 'connected', 'A to be connected')

  assert.equal(sessionA.getActiveCall()?.audioCodec, PCM16)

  sessionA.endCall(info.callId)
  await waitFor(() => sessionA.getActiveCall() === null, 'A active call to clear')
})
