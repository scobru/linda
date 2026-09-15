import { protocolChannel, type ChannelHandlers, type ChannelSender } from './protocol-channel.js'
import {
  typingEncoding, presenceEncoding, readReceiptEncoding, requestWriteEncoding,
  roomAnnounceEncoding, contactRequestEncoding, contactResponseEncoding, roomKeyEncoding
} from './encoding.js'

/**
 * The chat channel: ephemeral messages that ride alongside replication on the same connection.
 *
 * The list is the channel. Its order is the wire contract (see `protocol-channel.ts`), so new
 * messages go at the end and existing ones never move; `sendTyping` / `onTyping` and the rest are
 * derived from the names below.
 *
 * `sender` marks the field a peer fills in with its own identity id, which `attach` then checks
 * against the connection's noise key. Without it, any peer on the lobby topic could forge a
 * contact request as a third party — and our reply, routed by `fromId`, would go to a different
 * socket than the one that asked. `roomAnnounce` deliberately has no such field: its `authorId` is
 * the room's author, and peers re-announce each other's rooms.
 */
export const rpcChannel = protocolChannel('linda-rpc/1', [
  ['typing', { encoding: typingEncoding, sender: 'userId' }],
  ['presence', { encoding: presenceEncoding, sender: 'userId' }],
  ['readReceipt', { encoding: readReceiptEncoding, sender: 'userId' }],
  ['requestWrite', { encoding: requestWriteEncoding }],
  ['roomAnnounce', { encoding: roomAnnounceEncoding }],
  ['contactRequest', { encoding: contactRequestEncoding, sender: 'fromId' }],
  ['contactResponse', { encoding: contactResponseEncoding, sender: 'fromId' }],
  ['roomKey', { encoding: roomKeyEncoding }]
])

export type RpcMessages = typeof rpcChannel.messages
export type RpcHandlers = ChannelHandlers<RpcMessages>
export type RpcChannel = ChannelSender<RpcMessages>

export const attachRpc = rpcChannel.attach
