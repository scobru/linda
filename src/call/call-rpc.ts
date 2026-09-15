import { protocolChannel, type ChannelHandlers, type ChannelSender } from '../network/protocol-channel.js'
import {
  callOfferEncoding, callAnswerEncoding, callEndEncoding,
  callControlEncoding, mediaFrameEncoding
} from './call-encoding.js'

/**
 * The call channel, opened on the same already-authenticated Hyperswarm socket as `linda-rpc/1`.
 * Protomux multiplexes them as independent streams, so a burst of 50 Hz audio frames never starves
 * a typing indicator.
 *
 * Kept separate from the chat channel so the two protocol domains don't intermix, and so this
 * module is loadable on its own. Everything else — the derived `sendCallOffer` / `onCallOffer`
 * shape, the order-is-the-wire-contract rule, the fire-and-forget sends, the sender check — comes
 * from `protocol-channel.ts`.
 *
 * `mediaFrame` carries no sender field: it is addressed by `callId`, and the call it belongs to
 * was already established by an offer and answer that were checked.
 */
export const callRpcChannel = protocolChannel('linda-call/1', [
  ['callOffer', { encoding: callOfferEncoding, sender: 'fromId' }],
  ['callAnswer', { encoding: callAnswerEncoding, sender: 'fromId' }],
  ['callEnd', { encoding: callEndEncoding, sender: 'fromId' }],
  ['callControl', { encoding: callControlEncoding, sender: 'fromId' }],
  ['mediaFrame', { encoding: mediaFrameEncoding }]
])

export type CallRpcMessages = typeof callRpcChannel.messages
export type CallRpcHandlers = ChannelHandlers<CallRpcMessages>
export type CallRpcChannel = ChannelSender<CallRpcMessages>

export const attachCallRpc = callRpcChannel.attach
