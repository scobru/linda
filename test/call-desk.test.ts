import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { CallDesk, type CallPeer } from '../src/call/call-desk.js'
import { applyRemoteControl, RECONNECT_GRACE_MS, type CallInfo } from '../src/call/call-session.js'
import type { CallRpcChannel } from '../src/call/call-rpc.js'
import type { MediaFrameMessage } from '../src/call/call-encoding.js'

// ---------------------------------------------------------------------------
// The rules around a call — one at a time, a busy reply instead of silence, a message belongs to
// the call it names — used to live in `Session` as eight repetitions of two conditions, reachable
// only through a connected session with a live peer. The two call tests that exist stand up a real
// testnet and two sessions to watch one happy path; none of the edges below were covered at all.
// ---------------------------------------------------------------------------

type Sent = { kind: string; message: Record<string, unknown> }

/** `wantsMore` is what the channel's sends answer — Protomux's own `stream.write()` boolean. */
function fakePeer(wantsMore = true): { peer: CallPeer; sent: Sent[]; setWantsMore(v: boolean): void } {
  const sent: Sent[] = []
  let drained = wantsMore
  const record = (kind: string) => (message: Record<string, unknown>) => {
    sent.push({ kind, message })
    return drained
  }
  const callRpc = {
    sendCallOffer: record('offer'),
    sendCallAnswer: record('answer'),
    sendCallEnd: record('end'),
    sendCallControl: record('control'),
    sendMediaFrame: record('frame'),
    close: () => {}
  } as unknown as CallRpcChannel
  return { peer: { callRpc }, sent, setWantsMore: (v: boolean) => { drained = v } }
}

const LOCAL = 'me'
const frame = (callId: string): MediaFrameMessage => ({
  callId, seq: 1, timestamp: 0, kind: 0, keyframe: false, payload: new Uint8Array([1, 2, 3])
})

function desk(events = {}, ids: string[] = ['call-1', 'call-2', 'call-3']) {
  let next = 0
  return new CallDesk(LOCAL, events, () => ids[next++] ?? `call-${next}`)
}

/**
 * Puts the test on a clock it drives, for the endings that only a timer decides.
 *
 * A connected call that loses its connection is held for `RECONNECT_GRACE_MS` rather than ended —
 * see `CallSession.handlePeerDisconnected` — so the tests below that are about how such a call
 * *ends* have to let the grace run out. Enabled before the call exists, so its timers are the fake
 * ones; the test context restores the real clock on its own.
 */
function clock(t: TestContext): { expireGrace(): void; tick(ms: number): void } {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  return {
    expireGrace: () => t.mock.timers.tick(RECONNECT_GRACE_MS),
    tick: (ms: number) => t.mock.timers.tick(ms)
  }
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
    callId: 'call-1', fromId: LOCAL, roomId: 'room-1', audio: true, video: true,
    // The floor, because this desk was built without a capability list — see `CallDesk`'s
    // `localAudioCodecs`. A shell that has probed its browser offers something better.
    audioCodecs: 'pcm16'
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
  // The floor, because this desk was built without a capability list — see `CallDesk`'s
  // `localAudioCodecs`. A shell that has probed its browser passes something better.
  assert.deepEqual(sent.at(-1)!.message, { callId: 'call-7', fromId: LOCAL, accepted: true, audioCodec: 'pcm16' })
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

test('a peer that never comes back ends the call with it, and only that call', (t) => {
  const time = clock(t)
  const ended: CallInfo[] = []
  const d = desk({ onCallEnded: (info: CallInfo) => ended.push(info) })
  const { peer } = fakePeer()

  connected(d, peer, 'peer-a')
  d.peerGone('peer-b')
  assert.equal(d.current?.state, 'connected', 'an unrelated peer’s disconnect ended the call')
  assert.equal(d.current?.reconnecting, false, 'and it is not waiting on anything')

  d.peerGone('peer-a')
  time.expireGrace()
  assert.equal(ended.length, 1)
  assert.equal(ended[0]!.endReason, 'error', 'a dropped peer is not a hangup — the reason says so')
  assert.equal(d.current, null)
})

test('why a call ended is reported, not just that it did', (t) => {
  // `endReason` is computed on every path and, until the mobile shell was wired to `onCallEnded`,
  // read by nobody. These are the four a peer can produce.
  const time = clock(t)
  const reasons: (string | null)[] = []
  const d = desk({ onCallEnded: (info: CallInfo) => reasons.push(info.endReason) })
  const { peer } = fakePeer()

  const first = connected(d, peer)
  d.handleEnd({ callId: first.callId, fromId: 'peer-a', reason: 'hangup' })

  const second = d.place('peer-a', 'room-1', { audio: true, video: false }, peer)
  d.handleAnswer({ callId: second.callId, fromId: 'peer-a', accepted: false })

  const third = connected(d, peer)
  d.peerGone(third.peerId)
  time.expireGrace()

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

test('a frame send answers with what the wire said about itself', () => {
  const { peer, sent, setWantsMore } = fakePeer()
  const d = desk()
  const info = connected(d, peer)

  assert.equal(d.send(frame(info.callId)), true, 'a wire that wants more says so')

  setWantsMore(false)
  assert.equal(d.send(frame(info.callId)), false, 'and a full buffer says that instead')

  setWantsMore(true)
  assert.equal(d.send(frame(info.callId)), true, 'the answer is per send, not latched')

  assert.equal(sent.filter((s) => s.kind === 'frame').length, 3, 'every frame was still sent')
})

test('a frame sent with no call up answers false rather than nothing', () => {
  const d = desk()
  // `undefined` here would read as falsy at the call site and work by accident; the producer asks a
  // yes/no question and deserves one. Nowhere to send it is not a reason to produce the next one.
  assert.equal(d.send(frame('call-1')), false)
})

test('a frame for a call that already ended does not report the wire as healthy', () => {
  const { peer } = fakePeer()
  const d = desk()
  const info = connected(d, peer)
  d.end(info.callId)

  assert.equal(d.send(frame(info.callId)), false)
})

// ---------------------------------------------------------------------------
// Which side ended the call, as opposed to what the ending was called.
//
// `endReason` crosses the wire, so a call that ends as `error` prints "Connection lost" on both
// phones — the one whose connection went away and the one that was merely told. That made the
// fault impossible to place from the screen: every report said the same thing, whichever machine
// was actually at fault. `endOrigin` is decided locally and never sent, so it always names the
// side reading it.
// ---------------------------------------------------------------------------

test('a peer dropping off the swarm is this side’s own loss', (t) => {
  const time = clock(t)
  let ended: CallInfo | null = null
  const d = desk({ onCallEnded: (info: CallInfo) => { ended = info } })
  const { peer } = fakePeer()
  connected(d, peer)

  d.peerGone('peer-a')
  time.expireGrace()

  assert.equal(ended!.endReason, 'error')
  assert.equal(ended!.endOrigin, 'peer-disconnected')
})

test('the same reason arriving from the peer is not this side’s loss', () => {
  // The distinction the screen could not draw: identical `endReason`, opposite fault.
  let ended: CallInfo | null = null
  const d = desk({ onCallEnded: (info: CallInfo) => { ended = info } })
  const { peer } = fakePeer()
  const info = connected(d, peer)

  d.handleEnd({ callId: info.callId, fromId: 'peer-a', reason: 'error' })

  assert.equal(ended!.endReason, 'error', 'the wire reason is still the peer’s own word for it')
  assert.equal(ended!.endOrigin, 'remote')
})

test('hanging up here is named as here, and the peer is told only the reason', () => {
  let ended: CallInfo | null = null
  const d = desk({ onCallEnded: (info: CallInfo) => { ended = info } })
  const { peer, sent } = fakePeer()
  connected(d, peer)

  d.end()

  assert.equal(ended!.endReason, 'hangup')
  assert.equal(ended!.endOrigin, 'local')
  // The origin is a local reading, not a field: nothing about it may appear on the wire, or the
  // peer would be told which side we blame and both ends would print the same thing again.
  const end = sent.find((s) => s.kind === 'end')!
  assert.deepEqual(Object.keys(end.message).sort(), ['callId', 'fromId', 'reason'])
})

test('a peer that declines is a remote decision, though nothing was lost', () => {
  let ended: CallInfo | null = null
  const d = desk({ onCallEnded: (info: CallInfo) => { ended = info } })
  const { peer } = fakePeer()
  const info = d.place('peer-a', 'room-1', { audio: true, video: false }, peer)

  d.handleAnswer({ callId: info.callId, fromId: 'peer-a', accepted: false })

  assert.equal(ended!.endReason, 'rejected')
  assert.equal(ended!.endOrigin, 'remote')
})

test('declining here names this side', () => {
  let ended: CallInfo | null = null
  const d = desk({ onCallEnded: (info: CallInfo) => { ended = info } })
  const { peer } = fakePeer()
  d.receive({
    callId: 'in-1', fromId: 'peer-a', roomId: 'room-1', audio: true, video: false, audioCodecs: ''
  }, peer)

  d.answer('in-1', false)

  assert.equal(ended!.endReason, 'rejected')
  assert.equal(ended!.endOrigin, 'local')
})

test('a live call carries no origin at all', () => {
  // The field says how a call ended; a call that has not ended must not appear to have an opinion.
  const d = desk()
  const { peer } = fakePeer()
  const info = connected(d, peer)

  assert.equal(info.endOrigin, null)
  assert.equal(d.current?.endOrigin, null)
})

test('what the transport said on its way out reaches the call that died of it', (t) => {
  // `peer-disconnected` names who was lost and never why. Nothing in this app closes a peer's
  // socket, so a call ending this way ended because the transport gave up — and its account of
  // that was being swallowed by an empty error handler in `swarm.ts`, leaving a phone with
  // "Connection lost" and nothing else, round after round.
  const time = clock(t)
  let ended: CallInfo | null = null
  const d = desk({ onCallEnded: (info: CallInfo) => { ended = info } })
  const { peer } = fakePeer()
  connected(d, peer)

  d.peerGone('peer-a', 'stream destroyed by remote')
  time.expireGrace()

  assert.equal(ended!.endReason, 'error')
  assert.equal(ended!.endOrigin, 'peer-disconnected')
  assert.equal(ended!.endDetail, 'stream destroyed by remote')
})

test('a connection that simply closed carries no detail rather than an invented one', (t) => {
  // Most closes are ordinary and say nothing. Null is the honest answer; a placeholder here would
  // read on screen as though the transport had reported something.
  const time = clock(t)
  let ended: CallInfo | null = null
  const d = desk({ onCallEnded: (info: CallInfo) => { ended = info } })
  const { peer } = fakePeer()
  connected(d, peer)

  d.peerGone('peer-a')
  time.expireGrace()

  assert.equal(ended!.endOrigin, 'peer-disconnected')
  assert.equal(ended!.endDetail, null)
})

test('an ending decided here carries no transport detail either', () => {
  let ended: CallInfo | null = null
  const d = desk({ onCallEnded: (info: CallInfo) => { ended = info } })
  const { peer } = fakePeer()
  connected(d, peer)

  d.end()

  assert.equal(ended!.endOrigin, 'local')
  assert.equal(ended!.endDetail, null, 'we hung up; the transport had nothing to do with it')
})

// ---------------------------------------------------------------------------
// A call outlives its connection.
//
// A call rides one Hyperswarm socket, and on a phone that socket closes all the time — a
// wifi/cellular handoff, a NAT rebinding its port, the app's own network resync — while Hyperswarm
// opens a fresh one to the same peer seconds later. The desk ended the call the instant the first
// one closed, so every such blip was a dropped call reading "this device lost the connection".
// Now a connected call is held for `RECONNECT_GRACE_MS` and carried over to the next connection.
// ---------------------------------------------------------------------------

test('a connected call survives its connection closing, and carries on over the next one', () => {
  const ended: CallInfo[] = []
  const changes: CallInfo[] = []
  const d = desk({
    onCallEnded: (info: CallInfo) => ended.push(info),
    onCallStateChange: (info: CallInfo) => changes.push(info)
  })
  const { peer: first, sent: firstSent } = fakePeer()
  const info = connected(d, first)

  d.peerGone('peer-a', 'connection reset')

  assert.deepEqual(ended, [], 'the call ended the moment its socket closed')
  assert.equal(d.current?.state, 'connected', 'a held call is still connected to both people')
  assert.equal(d.current?.reconnecting, true)
  assert.equal(changes.at(-1)?.reconnecting, true, 'and the shells were told, so they can say so')
  assert.equal(d.busy, true, 'a held call still holds the slot')

  const before = firstSent.length
  assert.equal(d.send(frame(info.callId)), false, 'a frame with nowhere to go does not report a healthy wire')
  assert.equal(firstSent.length, before, 'nothing was written to the socket that closed')

  const { peer: second, sent: secondSent } = fakePeer()
  d.peerBack('peer-a', second)

  assert.deepEqual(
    secondSent.map((s) => [s.kind, s.message.action]),
    [['control', 'unmute'], ['control', 'camera-on']],
    'the first thing the peer hears is where we are — which is also how it knows we still have the call'
  )
  assert.equal(d.send(frame(info.callId)), true)
  assert.equal(secondSent.at(-1)?.kind, 'frame', 'the call now goes out on the new connection')
  assert.equal(firstSent.length, before, 'and never again on the old one')
  assert.equal(d.current?.reconnecting, true, 'reconnected is not yet heard from')

  d.handleMediaFrame(frame(info.callId))
  assert.equal(d.current?.reconnecting, false)
  assert.equal(changes.at(-1)?.reconnecting, false, 'and the shells were told it is back')
  assert.deepEqual(ended, [])
})

test('a held call that never gets its peer back ends as the loss it was, once the grace is out', (t) => {
  const time = clock(t)
  const ended: CallInfo[] = []
  const d = desk({ onCallEnded: (info: CallInfo) => ended.push(info) })
  const { peer } = fakePeer()
  connected(d, peer)

  d.peerGone('peer-a', 'connection reset')
  time.tick(RECONNECT_GRACE_MS - 1)
  assert.deepEqual(ended, [], 'given up on before the grace was out')

  time.tick(1)
  assert.equal(ended.length, 1)
  assert.equal(ended[0]!.endReason, 'error')
  assert.equal(ended[0]!.endOrigin, 'peer-disconnected')
  assert.equal(ended[0]!.endDetail, 'connection reset', 'the transport’s words survive the wait')
  assert.equal(ended[0]!.reconnecting, false, 'an ended call is not waiting on anything')
  assert.equal(d.busy, false)
})

test('hearing from the peer again stops the clock, and a later loss gets a whole grace of its own', (t) => {
  const time = clock(t)
  const ended: CallInfo[] = []
  const d = desk({ onCallEnded: (info: CallInfo) => ended.push(info) })
  const info = connected(d, fakePeer().peer)

  d.peerGone('peer-a')
  time.tick(RECONNECT_GRACE_MS - 1)
  d.peerBack('peer-a', fakePeer().peer)
  d.handleControl({ callId: info.callId, fromId: 'peer-a', action: 'unmute' })
  time.tick(RECONNECT_GRACE_MS)
  assert.deepEqual(ended, [], 'a call that got its peer back was ended by the old clock')

  d.peerGone('peer-a', 'second drop')
  time.tick(RECONNECT_GRACE_MS - 1)
  assert.deepEqual(ended, [])
  time.tick(1)
  assert.equal(ended[0]!.endDetail, 'second drop')
})

test('a call not yet connected still ends at once when its connection goes', () => {
  // Nothing has been said yet that a new connection would carry on, the ring timeout is already
  // counting, and dialling again costs one tap.
  const ended: CallInfo[] = []
  const d = desk({ onCallEnded: (info: CallInfo) => ended.push(info) })

  d.place('peer-a', 'room-1', { audio: true, video: false }, fakePeer().peer)
  d.peerGone('peer-a')
  assert.equal(ended.at(-1)?.endReason, 'error')

  d.receive({ callId: 'in-1', fromId: 'peer-b', roomId: 'room-2', audio: true, video: false }, fakePeer().peer)
  d.peerGone('peer-b')
  assert.equal(ended.at(-1)?.callId, 'in-1')
  assert.equal(ended.at(-1)?.endOrigin, 'peer-disconnected')
})

test('hanging up during the gap is owed to the peer, and paid when it comes back', () => {
  // The peer is waiting out its own grace. Were it never told, it would reattach to a call that no
  // longer exists here and sit in it, connected to nothing.
  const ended: CallInfo[] = []
  const d = desk({ onCallEnded: (info: CallInfo) => ended.push(info) })
  const { peer: first, sent: firstSent } = fakePeer()
  const info = connected(d, first)

  d.peerGone('peer-a')
  const before = firstSent.length
  d.end()

  assert.equal(ended.at(-1)?.endReason, 'hangup')
  assert.equal(ended.at(-1)?.endOrigin, 'local')
  assert.equal(firstSent.length, before, 'the hangup went into a socket that had already closed')

  const { peer: second, sent: secondSent } = fakePeer()
  d.peerBack('peer-a', second)
  assert.deepEqual(secondSent, [
    { kind: 'end', message: { callId: info.callId, fromId: LOCAL, reason: 'hangup' } }
  ])

  const { peer: third, sent: thirdSent } = fakePeer()
  d.peerBack('peer-a', third)
  assert.deepEqual(thirdSent, [], 'a debt is paid once')
})

test('a grace that runs out is owed too, as the loss it was', (t) => {
  // Both ends run their own grace, and they do not start together. If the connection returns in
  // between, the side still waiting would carry on alone.
  const time = clock(t)
  const d = desk()
  const info = connected(d, fakePeer().peer)

  d.peerGone('peer-a')
  time.expireGrace()

  const { peer, sent } = fakePeer()
  d.peerBack('peer-a', peer)
  assert.deepEqual(sent, [{ kind: 'end', message: { callId: info.callId, fromId: LOCAL, reason: 'error' } }])
})

test('an ending that went out on a live connection is not owed again', () => {
  const d = desk()
  const { peer, sent } = fakePeer()
  connected(d, peer)
  d.end()
  assert.equal(sent.at(-1)?.kind, 'end')

  const { peer: again, sent: againSent } = fakePeer()
  d.peerBack('peer-a', again)
  assert.deepEqual(againSent, [])
})

test('what we switched off during the gap reaches the peer when it returns', () => {
  // The peer's picture of us is whatever last reached it: a mute made while the connection was
  // down went nowhere, and one made into a dying socket may never have arrived.
  const d = desk()
  const { peer: first } = fakePeer()
  connected(d, first)
  d.control('mute')
  d.control('camera-off')

  d.peerGone('peer-a')
  d.control('unmute')

  const { peer: second, sent } = fakePeer()
  d.peerBack('peer-a', second)
  assert.deepEqual(
    sent.filter((s) => s.kind === 'control').map((s) => s.message.action),
    ['unmute', 'camera-off'],
    'the latest of each, and only that'
  )
})

test('a peer coming back touches only the call that is waiting for it', () => {
  const d = desk()
  const { peer: first, sent: firstSent } = fakePeer()
  const info = connected(d, first)

  // A call that never lost its connection keeps it: nothing reattaches a linked call.
  const { peer: stray, sent: straySent } = fakePeer()
  d.peerBack('peer-a', stray)
  d.send(frame(info.callId))
  assert.equal(firstSent.at(-1)?.kind, 'frame')
  assert.deepEqual(straySent, [])

  // And a held call waits for its own peer, not whoever else turns up.
  d.peerGone('peer-a')
  d.peerBack('peer-b', fakePeer().peer)
  assert.equal(d.current?.reconnecting, true)
})

test('a peer that comes back without the call is found out, and told', (t) => {
  // It restarted during the gap, or it runs a build that ended its side the moment its own socket
  // closed. Either way it reconnects holding no call, drops everything we send for this one, and
  // says nothing — a call reattached to it on reconnection alone would sit connected to nobody.
  const time = clock(t)
  const ended: CallInfo[] = []
  const d = desk({ onCallEnded: (info: CallInfo) => ended.push(info) })
  const info = connected(d, fakePeer().peer)

  d.peerGone('peer-a', 'connection reset')
  const { peer: back, sent } = fakePeer()
  d.peerBack('peer-a', back)
  time.expireGrace()

  assert.equal(ended.length, 1)
  assert.equal(ended[0]!.endReason, 'error')
  assert.equal(ended[0]!.endOrigin, 'peer-disconnected')
  assert.equal(ended[0]!.endDetail, 'reconnected, but the peer no longer had this call')
  assert.deepEqual(sent.at(-1), { kind: 'end', message: { callId: info.callId, fromId: LOCAL, reason: 'error' } },
    'told on the connection it came back on, not owed to a later one')

  const { peer: later, sent: laterSent } = fakePeer()
  d.peerBack('peer-a', later)
  assert.deepEqual(laterSent, [])
})

test('a link that keeps coming back and dying does not keep a call alive forever', (t) => {
  const time = clock(t)
  const ended: CallInfo[] = []
  const d = desk({ onCallEnded: (info: CallInfo) => ended.push(info) })
  connected(d, fakePeer().peer)

  d.peerGone('peer-a')
  for (let i = 0; i < 5; i++) {
    time.tick(RECONNECT_GRACE_MS / 6)
    d.peerBack('peer-a', fakePeer().peer)
    d.peerGone('peer-a')
  }
  assert.deepEqual(ended, [])
  time.tick(RECONNECT_GRACE_MS / 6)
  assert.equal(ended.length, 1, 'every reconnection restarted the clock')
})

test('the peer ending the call while we wait to hear from it ends it here too', () => {
  const ended: CallInfo[] = []
  const d = desk({ onCallEnded: (info: CallInfo) => ended.push(info) })
  const info = connected(d, fakePeer().peer)

  d.peerGone('peer-a')
  d.peerBack('peer-a', fakePeer().peer)
  d.handleEnd({ callId: info.callId, fromId: 'peer-a', reason: 'error' })

  assert.equal(ended.at(-1)?.endOrigin, 'remote', 'the peer gave up first, and said so')
  assert.equal(d.busy, false)
})
