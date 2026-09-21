import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import type { Duplex } from 'node:stream'
import type { Keypair } from '../identity/keypair.js'
import { attachRpc, type RpcChannel, type RpcHandlers } from './rpc.js'
import { attachCallRpc, type CallRpcChannel, type CallRpcHandlers } from '../call/call-rpc.js'

export interface PeerConnection {
  socket: Duplex
  rpc: RpcChannel
  callRpc: CallRpcChannel
  remotePublicKey: Buffer
}

export type SwarmHandlers = RpcHandlers & CallRpcHandlers & {
  onConnection?(peer: PeerConnection): void
  /**
   * A connection closed. The socket is named because closing one is not the same as losing the
   * peer: `onConnection` may deliberately destroy a redundant second connection to a peer that is
   * already held, and that destroy lands here under the very same public key. Only the handler
   * knows which socket it kept, so only the handler can tell the two apart — see `Session`.
   */
  onDisconnection?(remotePublicKey: Buffer, socket: Duplex): void
}

/** Behind a VPN the DHT's default UDP port is unreachable from outside, so holepunching fails and
 * peers never connect. Pinning the socket to a port the VPN forwards makes it reachable again.
 * `dhtPort` comes from the user's network settings; the env var is the headless/dev equivalent.
 * Unset (the normal case) keeps hyperdht's own default. */
/** How this swarm reaches the network. `bootstrap` points the DHT at specific nodes instead of
 * the public network — production never sets it; tests point it at an in-process testnet so the
 * real swarm, RPC and discovery code all run without touching the internet. */
/** Structural type for `LanDiscovery`, so `Session` never imports that module directly — see
 * `SwarmTransport.createLanDiscovery`. */
export interface LanDiscoveryHandle {
  join(topic: Buffer): void
  leave(topic: Buffer): void
  destroy(): Promise<void>
}

export interface SwarmTransport {
  dhtPort?: number
  bootstrap?: Array<{ host: string; port: number }>
  /** Opt-in second discovery channel for a LAN with no internet — see `LanDiscovery`. Undefined
   * (the default) means off: announcing a room topic on the local network reveals that topic to
   * everyone on it.
   *
   * Injected by the caller rather than imported by `Session` itself: `LanDiscovery` pulls in
   * `multicast-dns`, which does a bare `require('dgram')` with no Bare-native shim. Node's `dgram`
   * doesn't exist as a real package, so on mobile that require is unresolvable — and `bare-pack`
   * bails on it at *bundle* time, breaking the Android build even though the feature is never
   * turned on there. Keeping the import out of `session.ts` keeps it out of the worklet's module
   * graph entirely, so only platforms that actually construct a `LanDiscovery` (desktop, for now)
   * pull it in. */
  createLanDiscovery?: (onSocket: (socket: Duplex, remotePublicKey: Buffer) => void) => LanDiscoveryHandle
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
  // The identity a message claims to come from is self-declared; the connection it arrives on is
  // not. Passing the remote's noise key — which is also its identity id — lets each channel drop
  // messages whose declared sender disagrees with it, for the messages that declare one. Which
  // ones those are, and why the rest don't, is stated with the messages themselves.
  const remoteId = b4a.toString(remotePublicKey, 'hex')
  const rpc = attachRpc(socket, handlers, remoteId)
  const callRpc = attachCallRpc(socket, handlers, remoteId)
  handlers.onConnection?.({ socket, rpc, callRpc, remotePublicKey })

  socket.on('close', () => handlers.onDisconnection?.(remotePublicKey, socket))
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
