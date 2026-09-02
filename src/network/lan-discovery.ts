import net from 'node:net'
import type { Duplex } from 'node:stream'
import multicastDns, { type MulticastDns, type MdnsPacket, type MdnsRinfo } from 'multicast-dns'
import NoiseSecretStream from '@hyperswarm/secret-stream'
import b4a from 'b4a'
import type { Keypair } from '../identity/keypair.js'

/** Everyone on the LAN listens under this one name — there is no real DNS-SD service registry
 * to interop with here, just two copies of this module talking to each other, so a single fixed
 * TXT record (rather than a proper PTR/SRV chain per room) keeps the wire format simple. */
const SERVICE_NAME = '_linda-discovery._udp.local'

/** How often we re-announce and re-query while any room is joined. LAN discovery is opportunistic
 * — a peer that joins the network between cycles just waits for the next one. */
const CYCLE_MS = 10_000

/** Skips re-dialing a peer we just tried, so a burst of announce responses from the same peer
 * during one cycle doesn't open several redundant TCP connections while the first is still
 * handshaking. */
const DIAL_COOLDOWN_MS = 15_000

interface Announce {
  /** Hex-encoded identity public key — the same id `handleConnection` derives from the noise
   * handshake, so a LAN-found peer and a DHT-found peer for the same identity dedupe. */
  id: string
  port: number
  /** Hex-encoded discovery keys of the rooms this device currently has open. */
  topics: string[]
}

/** Whether this build can actually do mDNS discovery. False in the Pear build, which swaps this
 * module for `lan-discovery-stub.ts` — Bare has no `dgram` for `multicast-dns` to sit on. */
export const LAN_DISCOVERY_SUPPORTED = true

/** Offline LAN fallback for peer discovery. The DHT needs the internet to *find* a peer; this
 * finds one the same way `avahi`/Bonjour would, over mDNS multicast, and connects to it directly
 * over TCP with the same Noise handshake Hyperswarm itself uses — so a peer found this way lands
 * on the exact same `handleConnection` path as one found through the DHT (see swarm.ts).
 *
 * Off by default: `join()`/the mDNS socket only start once a caller opts in, since announcing a
 * room's topic on the LAN reveals that topic to everyone on the network (see swarm.ts's
 * `SwarmTransport.lanDiscovery`). */
export class LanDiscovery {
  private readonly identity: Keypair
  private readonly onSocket: (socket: Duplex, remotePublicKey: Buffer) => void
  private readonly mdnsFactory: () => MulticastDns
  private readonly topics = new Set<string>()
  /** Live sockets keyed by remote identity hex — both the dedupe guard against a burst of
   * announce responses from one peer, and the thing `destroy()` tears down. */
  private readonly sockets = new Map<string, Duplex>()
  private readonly lastDialAttempt = new Map<string, number>()
  private readonly myId: string

  private mdns: MulticastDns | null = null
  private server: net.Server | null = null
  private serverPort = 0
  private cycleTimer: ReturnType<typeof setInterval> | null = null
  /** Set once starting the transport has failed (no multicast, sandboxed network, port in use);
   * further `join()` calls become no-ops instead of retrying forever. */
  private unavailable = false

  constructor(
    identity: Keypair,
    onSocket: (socket: Duplex, remotePublicKey: Buffer) => void,
    mdnsFactory: () => MulticastDns = () => multicastDns()
  ) {
    this.identity = identity
    this.onSocket = onSocket
    this.mdnsFactory = mdnsFactory
    this.myId = b4a.toString(identity.publicKey, 'hex')
  }

  join(topic: Buffer): void {
    const hex = b4a.toString(topic, 'hex')
    if (this.topics.has(hex)) return
    this.topics.add(hex)
    this.ensureStarted()
    this.announceNow()
    this.queryNow()
  }

  leave(topic: Buffer): void {
    if (!this.topics.delete(b4a.toString(topic, 'hex'))) return
    if (this.topics.size === 0) this.stop()
    else this.announceNow()
  }

  async destroy(): Promise<void> {
    this.topics.clear()
    this.stop()
    for (const socket of this.sockets.values()) socket.destroy()
    this.sockets.clear()
  }

  private ensureStarted(): void {
    if (this.mdns || this.unavailable) return

    let server: net.Server
    try {
      server = net.createServer((socket) => {
        socket.on('error', () => {})
        this.finishHandshake(new NoiseSecretStream(false, socket, { keyPair: this.identity }), null)
      })
      server.on('error', (err) => this.fail(err))
      // `listen(0)` assigns the port asynchronously, so a `join()` that races ahead of this
      // callback would find `serverPort` still 0 and skip its immediate announce — silently
      // adding a `CYCLE_MS` of latency to the very first discovery. Announcing again once the
      // port is actually known closes that gap.
      server.listen(0, () => {
        this.serverPort = (server.address() as net.AddressInfo).port
        this.announceNow()
      })

      const mdns = this.mdnsFactory()
      mdns.on('error', (err: Error) => this.fail(err))
      mdns.on('warning', () => {})
      mdns.on('query', (packet: MdnsPacket) => {
        if (packet.questions?.some((q) => q.name === SERVICE_NAME)) this.announceNow()
      })
      mdns.on('response', (packet: MdnsPacket, rinfo: MdnsRinfo) => this.handleResponse(packet, rinfo))

      this.server = server
      this.mdns = mdns
      this.cycleTimer = setInterval(() => {
        this.announceNow()
        this.queryNow()
      }, CYCLE_MS)
      this.cycleTimer.unref?.()
    } catch (err) {
      this.fail(err as Error)
    }
  }

  private fail(err: Error): void {
    console.warn('[lan-discovery] disabled after transport error:', err.message)
    this.unavailable = true
    this.stop()
  }

  private stop(): void {
    if (this.cycleTimer) { clearInterval(this.cycleTimer); this.cycleTimer = null }
    this.server?.close()
    this.server = null
    this.serverPort = 0
    this.mdns?.destroy()
    this.mdns = null
  }

  private queryNow(): void {
    this.mdns?.query(SERVICE_NAME, 'TXT')
  }

  private announceNow(): void {
    if (!this.mdns || this.topics.size === 0 || this.serverPort === 0) return
    const payload: Announce = { id: this.myId, port: this.serverPort, topics: [...this.topics] }
    this.mdns.respond([{ name: SERVICE_NAME, type: 'TXT', ttl: 120, data: [Buffer.from(JSON.stringify(payload))] }])
  }

  private handleResponse(packet: MdnsPacket, rinfo: MdnsRinfo): void {
    for (const answer of packet.answers ?? []) {
      if (answer.name !== SERVICE_NAME || answer.type !== 'TXT') continue

      let announce: Announce
      try {
        const raw = Array.isArray(answer.data) ? answer.data[0] : answer.data
        announce = JSON.parse(b4a.toString(raw as Buffer))
      } catch {
        continue
      }

      if (announce.id === this.myId) continue
      if (!announce.topics.some((topic) => this.topics.has(topic))) continue
      this.dial(rinfo.address, announce.port, announce.id)
    }
  }

  private dial(host: string, port: number, expectedId: string): void {
    if (this.sockets.has(expectedId)) return
    const last = this.lastDialAttempt.get(expectedId)
    if (last !== undefined && Date.now() - last < DIAL_COOLDOWN_MS) return
    this.lastDialAttempt.set(expectedId, Date.now())

    const socket = net.connect(port, host)
    socket.on('error', () => {})
    socket.once('connect', () => {
      this.finishHandshake(new NoiseSecretStream(true, socket, { keyPair: this.identity }), expectedId)
    })
  }

  /** `expectedId`, when known (we dialed this peer ourselves), guards against a stale or spoofed
   * announce: the noise handshake authenticates who is actually on the other end regardless, so
   * this only decides whether to trust it as the peer we meant to reach. */
  private finishHandshake(stream: NoiseSecretStream, expectedId: string | null): void {
    stream.on('error', () => {})
    stream.once('connect', () => {
      const hex = b4a.toString(stream.remotePublicKey!, 'hex')
      if (hex === this.myId || (expectedId !== null && hex !== expectedId) || this.sockets.has(hex)) {
        stream.destroy()
        return
      }
      this.sockets.set(hex, stream)
      stream.once('close', () => { if (this.sockets.get(hex) === stream) this.sockets.delete(hex) })
      this.onSocket(stream, stream.remotePublicKey!)
    })
  }
}
