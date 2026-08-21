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

export function createSwarm(identity: Keypair, handlers: SwarmHandlers = {}): Hyperswarm {
  const swarm = new Hyperswarm({ keyPair: identity })

  swarm.on('connection', (socket, info) => {
    // `fromId` is self-declared, but the connection's noise key is the same key the app uses as
    // its identity id — so drop contact traffic that claims to come from anyone else. Without
    // this, any peer on the lobby topic could forge a request as a third party, and our reply
    // (routed by `fromId`) would go to a different socket than the one that asked.
    const remoteId = b4a.toString(info.publicKey, 'hex')
    const rpc = attachRpc(socket, {
      ...handlers,
      onContactRequest: (message) => {
        if (message.fromId === remoteId) handlers.onContactRequest?.(message)
      },
      onContactResponse: (message) => {
        if (message.fromId === remoteId) handlers.onContactResponse?.(message)
      }
    })
    handlers.onConnection?.({ socket, rpc, remotePublicKey: info.publicKey })

    socket.on('close', () => handlers.onDisconnection?.(info.publicKey))
    socket.on('error', () => {})
  })

  return swarm
}

/** Announces on the topic without waiting for `discovery.flushed()`. That flush waits for the DHT
 * announce to land — seconds — and callers used to await one per room, in sequence, before the app
 * could show anything. Whether a peer serving the room has been found is instead communicated to
 * Hypercore through Corestore's `findingPeers` (see `Session.trackDiscovery`), which is the signal
 * a `get()` on a not-yet-replicated core actually waits on. */
export function joinRoom(swarm: Hyperswarm, roomTopic: Buffer): void {
  swarm.join(roomTopic, { server: true, client: true })
}
