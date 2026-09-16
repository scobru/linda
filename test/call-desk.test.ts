import test from 'node:test'
import assert from 'node:assert/strict'
import { CallDesk, type CallPeer } from '../src/call/call-desk.js'
import { applyRemoteControl, type CallInfo } from '../src/call/call-session.js'
import type { CallRpcChannel } from '../src/call/call-rpc.js'
import type { MediaFrameMessage } from '../src/call/call-encoding.js'

// ---------------------------------------------------------------------------
// The rules around a call — one at a time, a busy reply instead of silence, a message belongs to
// the call it names — used to live in `Session` as eight repetitions of two conditions, reachable
// only through a connected session with a live peer. The two call tests that exist stand up a real
// testnet and two sessions to watch one happy path; none of the edges below were covered at all.
// ---------------------------------------------------------------------------

type Sent = { kind: string; message: Record<string, unknown> }

function fakePeer(): { peer: CallPeer; sent: Sent[] } {
  const sent: Sent[] = []
  const record = (kind: string) => (message: Record<string, unknown>) => { sent.push({ kind, message }) }
  const callRpc = {
    sendCallOffer: record('offer'),
    sendCallAnswer: record('answer'),
    sendCallEnd: record('end'),
    sendCallControl: record('control'),
    sendMediaFrame: record('frame'),
    close: () => {}
  } as unknown as CallRpcChannel
  return { peer: { callRpc }, sent }
}

const LOCAL = 'me'
const frame = (callId: string): MediaFrameMessage => ({
  callId, seq: 1, timestamp: 0, kind: 0, keyframe: false, payload: new Uint8Array([1, 2, 3])
})

function desk(events = {}, ids: string[] = ['call-1', 'call-2', 'call-3']) {
  let next = 0
  return new CallDesk(LOCAL, events, () => ids[next++] ?? `call-${next}`)
}

/** Brings a call up the way the wire would: place it, then let the peer accept. */
function connected(d: CallDesk, peer: CallPeer, peerId = 'peer-a'): CallInfo {
  const info = d.place(peerId, 'room-1', { audio: true, video: false }, peer)
  d.handleAnswer({ callId: info.callId, fromId: peerId, accepted: true })
  return info
}

test('placing a call sends the offer on that peer’s channel', () => {
  const d = desk()
  const { peer, sent } = fakePeer()

  const info = d.place('peer-a', 'room-1', { audio: true, video: true }, peer)

  assert.equal(info.state, 'calling')
  assert.equal(info.direction, 'outgoing')
  assert.deepEqual(sent.map((s) => s.kind), ['offer'])
  assert.deepEqual(sent[0]!.message, {
    callId: 'call-1', fromId: LOCAL, roomId: 'room-1', audio: true, video: true
  })
  assert.equal(d.current?.callId, 'call-1')
  assert.equal(d.busy, true)
})

test('a second call cannot be placed while one is up', () => {
  const d = desk()
  const { peer } = fakePeer()
  const { peer: other, sent: otherSent } = fakePeer()

  const first = d.place('peer-a', 'room-1', { audio: true, video: false }, peer)
  assert.throws(() => d.place('peer-b', 'room-2', { audio: true, video: false }, other), /Already in an active call/)

  assert.equal(d.current?.callId, first.callId, 'the call already up is the one still held')
  assert.deepEqual(otherSent, [], 'nothing was sent to the peer that could not be dialled')
})

test('an offer arriving during a call is declined as busy, on the caller’s own channel', () => {
  // Without the decline the second caller watches a ring nobody will ever answer until its own
  // 30-second timeout, with no way to tell a busy peer from an absent one. And the reply has to go
  // out on the channel it arrived on — sending it to the peer already talking would end that call.
  const d = desk()
  const { peer, sent } = fakePeer()
  const { peer: caller, sent: callerSent } = fakePeer()

  connected(d, peer)
  const before = sent.length

  d.receive({ callId: 'call-9', fromId: 'peer-b', roomId: 'room-2', audio: true, video: false }, caller)

  assert.deepEqual(callerSent.map((s) => s.kind), ['end'])
  assert.deepEqual(callerSent[0]!.message, { callId: 'call-9', fromId: LOCAL, reason: 'busy' })
  assert.equal(sent.length, before, 'the call in progress was not touched')
  assert.equal(d.current?.peerId, 'peer-a')
  assert.equal(d.current?.state, 'connected')
})

test('an incoming offer with nothing in progress rings, and is announced once', () => {
  const seen: CallInfo[] = []
  const d = desk({ onIncomingCall: (info: CallInfo) => seen.push(info) })
  const { peer } = fakePeer()

  d.receive({ callId: 'call-7', fromId: 'peer-b', roomId: 'room-2', audio: true, video: true }, peer)

  assert.equal(seen.length, 1)
  assert.equal(seen[0]!.state, 'ringing')
  assert.equal(seen[0]!.direction, 'incoming')
  assert.deepEqual(seen[0]!.media, { audio: true, video: true })
})

test('the slot empties when the call ends, so the next one can be placed', () => {
  const d = desk()
  const { peer } = fakePeer()

  connected(d, peer)
  d.end()

  assert.equal(d.busy, false)
  assert.equal(d.current, null)
  assert.doesNotThrow(() => d.place('peer-b', 'room-2', { audio: true, video: false }, fakePeer().peer))
})

test('a message names the call it is for, and is dropped when that is not the one in progress', () => {
  // Five copies of `if (activeCall && activeCall.callId === message.callId)` used to say this. A
  // stale `call_end` from a call that already finished must not end the one that replaced it.
  const frames: MediaFrameMessage[] = []
  const d = desk({ onCallMediaFrame: (f: MediaFrameMessage) => frames.push(f) })
  const { peer } = fakePeer()

  const info = connected(d, peer)

  d.handleEnd({ callId: 'some-other-call', fromId: 'peer-b', reason: 'hangup' })
  assert.equal(d.current?.state, 'connected', 'an end for another call ended this one')

  d.handleControl({ callId: 'some-other-call', fromId: 'peer-b', action: 'mute' })
  assert.equal(d.current?.remoteMuted, false, 'a control for another call was applied to this one')

  d.handleMediaFrame(frame('some-other-call'))
  assert.deepEqual(frames, [], 'a frame from another call was delivered')

  d.handleMediaFrame(frame(info.callId))
  assert.equal(frames.length, 1, 'a frame for this call was not delivered')
})

test('an answer for a call that is not the one dialling is ignored', () => {
  const d = desk()
  const { peer } = fakePeer()

  d.place('peer-a', 'room-1', { audio: true, video: false }, peer)
  d.handleAnswer({ callId: 'call-9', fromId: 'peer-b', accepted: true })

  assert.equal(d.current?.state, 'calling', 'someone else’s answer connected this call')
})

test('answering sends the accepted flag, and rejecting ends the call as rejected', () => {
  const ended: CallInfo[] = []
  const d = desk({ onCallEnded: (info: CallInfo) => ended.push(info) })
  const { peer, sent } = fakePeer()

  d.receive({ callId: 'call-7', fromId: 'peer-b', roomId: 'room-2', audio: true, video: false }, peer)
  d.answer('call-7', true)
  assert.deepEqual(sent.at(-1)!.message, { callId: 'call-7', fromId: LOCAL, accepted: true })
  assert.equal(d.current?.state, 'connected')

  const { peer: second, sent: secondSent } = fakePeer()
  d.end()
  d.receive({ callId: 'call-8', fromId: 'peer-c', roomId: 'room-3', audio: true, video: false }, second)
  d.answer('call-8', false)

  assert.deepEqual(secondSent.map((s) => s.kind), ['answer'])
  assert.deepEqual(secondSent[0]!.message, { callId: 'call-8', fromId: LOCAL, accepted: false })
  assert.equal(ended.at(-1)!.endReason, 'rejected')
})

test('answering a call id that is not the one held does nothing', () => {
  const d = desk()
  const { peer, sent } = fakePeer()

  d.receive({ callId: 'call-7', fromId: 'peer-b', roomId: 'room-2', audio: true, video: false }, peer)
  d.answer('call-9', true)

  assert.equal(d.current?.state, 'ringing')
  assert.deepEqual(sent, [], 'an answer went out for a call that was never offered')
})

test('ending by id only ends that call', () => {
  const d = desk()
  const { peer } = fakePeer()

  const info = connected(d, peer)
  d.end('some-other-call')
  assert.equal(d.current?.state, 'connected', 'an id that names no held call ended the one that is up')

  d.end(info.callId)
  assert.equal(d.current, null)
})

test('a peer dropping off the swarm ends the call with it, and only that call', () => {
  const ended: CallInfo[] = []
  const d = desk({ onCallEnded: (info: CallInfo) => ended.push(info) })
  const { peer } = fakePeer()

  connected(d, peer, 'peer-a')
  d.peerGone('peer-b')
  assert.equal(d.current?.state, 'connected', 'an unrelated peer’s disconnect ended the call')

  d.peerGone('peer-a')
  assert.equal(ended.length, 1)
  assert.equal(ended[0]!.endReason, 'error', 'a dropped peer is not a hangup — the reason says so')
  assert.equal(d.current, null)
})

test('why a call ended is reported, not just that it did', () => {
  // `endReason` is computed on every path and, until the mobile shell was wired to `onCallEnded`,
  // read by nobody. These are the four a peer can produce.
  const reasons: (string | null)[] = []
  const d = desk({ onCallEnded: (info: CallInfo) => reasons.push(info.endReason) })
  const { peer } = fakePeer()

  const first = connected(d, peer)
  d.handleEnd({ callId: first.callId, fromId: 'peer-a', reason: 'hangup' })

  const second = d.place('peer-a', 'room-1', { audio: true, video: false }, peer)
  d.handleAnswer({ callId: second.callId, fromId: 'peer-a', accepted: false })

  const third = connected(d, peer)
  d.peerGone(third.peerId)

  assert.deepEqual(reasons, ['hangup', 'rejected', 'error'])
})

test('a remote control reaches the listener and the call state at once', () => {
  const actions: string[] = []
  const d = desk({ onCallRemoteControl: (_id: string, action: string) => actions.push(action) })
  const { peer } = fakePeer()

  const info = connected(d, peer)
  d.handleControl({ callId: info.callId, fromId: 'peer-a', action: 'mute' })
  d.handleControl({ callId: info.callId, fromId: 'peer-a', action: 'camera-off' })

  assert.deepEqual(actions, ['mute', 'camera-off'])
  assert.equal(d.current?.remoteMuted, true)
  assert.equal(d.current?.remoteCameraOff, true)
})

test('the shells and the state machine share one reducer', () => {
  // Three copies of this switch existed: here, the desktop overlay, mobile's `useSession`.
  const base = { remoteMuted: false, remoteCameraOff: false }

  assert.deepEqual(applyRemoteControl(base, 'mute'), { remoteMuted: true, remoteCameraOff: false })
  assert.deepEqual(applyRemoteControl(base, 'camera-off'), { remoteMuted: false, remoteCameraOff: true })
  assert.deepEqual(applyRemoteControl({ remoteMuted: true, remoteCameraOff: true }, 'unmute'),
    { remoteMuted: false, remoteCameraOff: true })
  assert.deepEqual(applyRemoteControl({ remoteMuted: true, remoteCameraOff: true }, 'camera-on'),
    { remoteMuted: true, remoteCameraOff: false })

  // A newer peer's vocabulary is not a reason to guess, and the rest of the call info rides along.
  const info = { ...base, callId: 'c1', extra: 7 }
  assert.equal(applyRemoteControl(info, 'screen-share'), info)
  assert.equal(applyRemoteControl(info, 'mute').extra, 7)
})

test('control and frames go nowhere until the call is connected', () => {
  const d = desk()
  const { peer, sent } = fakePeer()

  const info = d.place('peer-a', 'room-1', { audio: true, video: false }, peer)
  d.control('mute')
  d.send(frame(info.callId))
  assert.deepEqual(sent.map((s) => s.kind), ['offer'], 'media went out before the peer answered')

  d.handleAnswer({ callId: info.callId, fromId: 'peer-a', accepted: true })
  d.control('mute')
  d.send(frame(info.callId))
  assert.deepEqual(sent.map((s) => s.kind), ['offer', 'control', 'frame'])
})
