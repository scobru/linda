import Hyperswarm from 'hyperswarm'
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
    const rpc = attachRpc(socket, handlers)
    handlers.onConnection?.({ socket, rpc, remotePublicKey: info.publicKey })

    socket.on('close', () => handlers.onDisconnection?.(info.publicKey))
    socket.on('error', () => {})
  })

  return swarm
}

export function joinRoom(swarm: Hyperswarm, roomTopic: Buffer): Promise<void> {
  const discovery = swarm.join(roomTopic, { server: true, client: true })
  return discovery.flushed()
}
