import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import type { Duplex } from 'node:stream'
import type { Keypair } from '../identity/keypair.js'
import { attachRpc, type RpcChannel, type RpcHandlers } from './rpc.js'

export interface PeerConnection {
  socket: Duplex
  rpc: RpcChannel
  remotePublicKey: Buffer
}

export interface SwarmHandlers extends RpcHandlers {
  onConnection?(peer: PeerConnection): void
  onDisconnection?(remotePublicKey: Buffer): void
}

/** Behind a VPN the DHT's default UDP port is unreachable from outside, so holepunching fails and
 * peers never connect. Pinning the socket to a port the VPN forwards makes it reachable again.
 * `dhtPort` comes from the user's network settings; the env var is the headless/dev equivalent.
 * Unset (the normal case) keeps hyperdht's own default. */
/** How this swarm reaches the network. `bootstrap` points the DHT at specific nodes instead of
 * the public network — production never sets it; tests point it at an in-process testnet so the
 * real swarm, RPC and discovery code all run without touching the internet. */
export interface SwarmTransport {
  dhtPort?: number
  bootstrap?: Array<{ host: string; port: number }>
  /** Opt-in second discovery channel for a LAN with no internet — see `LanDiscovery`. Off by
   * default: announcing a room topic on the local network reveals that topic to everyone on it. */
  lanDiscovery?: boolean
}

export function createSwarm(identity: Keypair, handlers: SwarmHandlers = {}, transport: SwarmTransport = {}): Hyperswarm {
  const port = transport.dhtPort || Number(globalThis.process?.env?.LINDA_DHT_PORT) || undefined
  const swarm = new Hyperswarm({ keyPair: identity, port, bootstrap: transport.bootstrap })
  swarm.on('connection', (socket, info) => handleConnection(socket, info.publicKey, handlers))
  return swarm
}

/** Wires an already-authenticated duplex connection into the app's RPC/replication pipeline.
 * Shared by Hyperswarm's own `connection` event and by `LanDiscovery`'s directly-dialed sockets,
 * so a peer found either way ends up on the exact same path. */
export function handleConnection(socket: Duplex, remotePublicKey: Buffer, handlers: SwarmHandlers): void {
  // `fromId` is self-declared, but the connection's noise key is the same key the app uses as
  // its identity id — so drop contact traffic that claims to come from anyone else. Without
  // this, any peer on the lobby topic could forge a request as a third party, and our reply
  // (routed by `fromId`) would go to a different socket than the one that asked.
  const remoteId = b4a.toString(remotePublicKey, 'hex')
  const rpc = attachRpc(socket, {
    ...handlers,
    onContactRequest: (message) => {
      if (message.fromId === remoteId) handlers.onContactRequest?.(message)
    },
    onContactResponse: (message) => {
      if (message.fromId === remoteId) handlers.onContactResponse?.(message)
    }
  })
  handlers.onConnection?.({ socket, rpc, remotePublicKey })

  socket.on('close', () => handlers.onDisconnection?.(remotePublicKey))
  socket.on('error', () => {})
}

/** Announces on the topic without waiting for `discovery.flushed()`. That flush waits for the DHT
 * announce to land — seconds — and callers used to await one per room, in sequence, before the app
 * could show anything. Whether a peer serving the room has been found is instead communicated to
 * Hypercore through Corestore's `findingPeers` (see `Session.trackDiscovery`), which is the signal
 * a `get()` on a not-yet-replicated core actually waits on. */
export function joinRoom(swarm: Hyperswarm, roomTopic: Buffer): void {
  swarm.join(roomTopic, { server: true, client: true })
}
