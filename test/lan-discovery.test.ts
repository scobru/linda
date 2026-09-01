// Real TCP sockets and a real Noise handshake on both ends; the only thing faked is the
// multicast transport, which is the part that is unreliable in a sandboxed/CI network namespace
// (an already-bound port 5353, blocked multicast) rather than anything this module's own logic
// controls. Two `FakeMdns` instances sharing one bus stand in for "both sides can hear each
// other's mDNS packets" so the rest — announce/query framing, dialing, handshake verification,
// dedupe — runs unmodified.
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import b4a from 'b4a'
import { generateKeypair } from '../src/identity/keypair.js'
import { LanDiscovery } from '../src/network/lan-discovery.js'
import type { MulticastDns, MdnsPacket, MdnsRinfo } from 'multicast-dns'

class FakeMdns extends EventEmitter implements Pick<MulticastDns, 'query' | 'respond' | 'destroy' | 'on' | 'once' | 'emit'> {
  private readonly bus: FakeMdns[]

  constructor(bus: FakeMdns[]) {
    super()
    this.bus = bus
    bus.push(this)
  }

  query(name: string, type?: string): void {
    const packet: MdnsPacket = { questions: [{ name, type: type || 'ANY' }] }
    for (const peer of this.bus) if (peer !== this) peer.emit('query', packet)
  }

  respond(answers: MdnsPacket['answers']): void {
    const packet: MdnsPacket = { answers }
    const rinfo: MdnsRinfo = { address: '127.0.0.1', port: 0 }
    for (const peer of this.bus) if (peer !== this) peer.emit('response', packet, rinfo)
  }

  destroy(cb?: () => void): void {
    const i = this.bus.indexOf(this)
    if (i >= 0) this.bus.splice(i, 1)
    cb?.()
  }
}

async function waitFor(check: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('two LanDiscovery instances on a shared room topic find and connect to each other', async () => {
  const bus: FakeMdns[] = []
  const identityA = generateKeypair()
  const identityB = generateKeypair()
  const topic = b4a.from('a'.repeat(64), 'hex')

  let foundA: Buffer | null = null
  let foundB: Buffer | null = null
  const a = new LanDiscovery(identityA, (_socket, remotePublicKey) => { foundA = remotePublicKey }, () => new FakeMdns(bus) as unknown as MulticastDns)
  const b = new LanDiscovery(identityB, (_socket, remotePublicKey) => { foundB = remotePublicKey }, () => new FakeMdns(bus) as unknown as MulticastDns)

  try {
    a.join(topic)
    await sleep(50) // let a's TCP listener finish binding before b shows up
    b.join(topic)

    await waitFor(() => foundA !== null && foundB !== null, 'both sides to connect')
    assert.equal(b4a.toString(foundA!, 'hex'), identityB.publicKey.toString('hex'))
    assert.equal(b4a.toString(foundB!, 'hex'), identityA.publicKey.toString('hex'))
  } finally {
    await a.destroy()
    await b.destroy()
  }
})

test('LanDiscovery instances on different topics never connect', async () => {
  const bus: FakeMdns[] = []
  const identityA = generateKeypair()
  const identityB = generateKeypair()
  const topicX = b4a.from('a'.repeat(64), 'hex')
  const topicY = b4a.from('b'.repeat(64), 'hex')

  let connected = false
  const a = new LanDiscovery(identityA, () => { connected = true }, () => new FakeMdns(bus) as unknown as MulticastDns)
  const b = new LanDiscovery(identityB, () => { connected = true }, () => new FakeMdns(bus) as unknown as MulticastDns)

  try {
    a.join(topicX)
    await sleep(50)
    b.join(topicY)
    await sleep(300)
    assert.equal(connected, false)
  } finally {
    await a.destroy()
    await b.destroy()
  }
})

test('leaving the last topic tears down the mDNS socket and TCP listener', async () => {
  const bus: FakeMdns[] = []
  const identity = generateKeypair()
  const lan = new LanDiscovery(identity, () => {}, () => new FakeMdns(bus) as unknown as MulticastDns)
  const topic = b4a.from('c'.repeat(64), 'hex')

  lan.join(topic)
  await sleep(50)
  assert.equal(bus.length, 1)

  lan.leave(topic)
  assert.equal(bus.length, 0)

  await lan.destroy()
})
