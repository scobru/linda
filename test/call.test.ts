import test from 'node:test'
import assert from 'node:assert/strict'
import type { RpcChannel } from '../src/network/rpc.js'
import type { CallSignalMessage } from '../src/network/encoding.js'

/** Minimal stand-in for the browser/react-native RTCPeerConnection PeerCall drives. Only the
 * surface PeerCall actually touches — enough to observe which candidates reach the connection
 * and in what order, which is the whole point of these tests. */
class FakePeerConnection {
  remoteDescription: unknown = null
  signalingState = 'stable'
  connectionState = 'new'
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null
  ontrack: unknown = null
  onconnectionstatechange: unknown = null
  /** Candidates that actually made it onto the connection, in arrival order. */
  readonly added: string[] = []
  /** Candidate payloads to reject, simulating one stale entry inside a replayed batch. */
  reject = new Set<string>()

  addTrack(): void {}
  close(): void {}
  async createOffer(): Promise<unknown> { return { type: 'offer', sdp: 'x' } }
  async createAnswer(): Promise<unknown> { return { type: 'answer', sdp: 'x' } }
  async setLocalDescription(): Promise<void> {}
  async setRemoteDescription(description: unknown): Promise<void> { this.remoteDescription = description }

  async addIceCandidate(candidate: { candidate: string }): Promise<void> {
    if (!this.remoteDescription) throw new Error('remote description is null')
    if (this.reject.has(candidate.candidate)) throw new Error('stale candidate')
    this.added.push(candidate.candidate)
  }
}

function setup(): { call: any; pc: FakePeerConnection; sent: CallSignalMessage[] } {
  const pc = new FakePeerConnection()
  ;(globalThis as any).RTCPeerConnection = function () { return pc }

  const sent: CallSignalMessage[] = []
  const rpc = { sendCallSignal: (message: CallSignalMessage) => { sent.push(message) } } as unknown as RpcChannel
  const stream = { getTracks: () => [] } as unknown as MediaStream

  // Required lazily: PeerCall captures RTCPeerConnection at construction, so the stub above has
  // to be installed first.
  const { PeerCall } = require('../src/calls/call.js')
  const call = new PeerCall(rpc, 'room-1', 'user-a', 'user-b', stream)
  return { call, pc, sent }
}

function candidateSignal(name: string): CallSignalMessage {
  return { roomId: 'room-1', fromUserId: 'user-b', kind: 'candidate', payload: JSON.stringify({ candidate: name }) }
}

function answerSignal(): CallSignalMessage {
  return { roomId: 'room-1', fromUserId: 'user-b', kind: 'answer', payload: JSON.stringify({ type: 'answer', sdp: 'x' }) }
}

test('only candidates are held for a peer with no live call', () => {
  const { shouldQueueSignal } = require('../src/calls/call.js')

  // The reason this rule exists at all: candidates land while the answering side is still in
  // getUserMedia, and losing them costs connectivity.
  assert.equal(shouldQueueSignal('candidate'), true)

  // The reason it must not be broader: the peer's parting 'hangup' routinely arrives just after
  // our own teardown. Held, it gets replayed into the *next* call and ends it on arrival — which
  // is what made calls work exactly once per session.
  assert.equal(shouldQueueSignal('hangup'), false)
  assert.equal(shouldQueueSignal('answer'), false)
  assert.equal(shouldQueueSignal('offer'), false)
})

test('a hangup carries its reason to the peer', async () => {
  const { call, sent } = setup()
  call.hangup('NotReadableError opening camera/mic')

  const hangup = sent.find((m) => m.kind === 'hangup')
  assert.ok(hangup, 'a hangup signal is sent')
  assert.equal(hangup.payload, 'NotReadableError opening camera/mic')
})

test('candidates arriving before the remote description are replayed, not dropped', async () => {
  const { call, pc } = setup()

  // The peer starts gathering the instant it sets its local description, so candidates routinely
  // beat the answer here. Dropping them is survivable on a cone NAT but fatal on symmetric NAT.
  await call.handleSignal(candidateSignal('relay-1'))
  await call.handleSignal(candidateSignal('relay-2'))
  assert.deepEqual(pc.added, [], 'nothing can be added while there is no remote description')

  await call.handleSignal(answerSignal())
  assert.deepEqual(pc.added, ['relay-1', 'relay-2'], 'buffered candidates flush in arrival order')
})

test('candidates arriving after the remote description still apply directly', async () => {
  const { call, pc } = setup()

  await call.handleSignal(answerSignal())
  await call.handleSignal(candidateSignal('relay-late'))
  assert.deepEqual(pc.added, ['relay-late'])
})

test('one stale buffered candidate does not discard the rest of the batch', async () => {
  const { call, pc } = setup()
  pc.reject.add('stale')

  await call.handleSignal(candidateSignal('relay-1'))
  await call.handleSignal(candidateSignal('stale'))
  await call.handleSignal(candidateSignal('relay-2'))
  await call.handleSignal(answerSignal())

  assert.deepEqual(pc.added, ['relay-1', 'relay-2'])
})

test('the buffer is emptied once flushed, so a later answer does not re-add', async () => {
  const { call, pc } = setup()

  await call.handleSignal(candidateSignal('relay-1'))
  await call.handleSignal(answerSignal())
  await call.handleSignal(answerSignal())

  assert.deepEqual(pc.added, ['relay-1'], 'a renegotiation must not replay an already-applied candidate')
})
