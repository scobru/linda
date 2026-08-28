import Protomux from 'protomux'
import type { Duplex } from 'node:stream'
import { typingEncoding, presenceEncoding, readReceiptEncoding, requestWriteEncoding, roomAnnounceEncoding, contactRequestEncoding, contactResponseEncoding, roomKeyEncoding } from './encoding.js'
import type { TypingMessage, PresenceMessage, ReadReceiptMessage, RequestWriteMessage, RoomAnnounceMessage, ContactRequestMessage, ContactResponseMessage, RoomKeyMessage } from './encoding.js'

const PROTOCOL = 'linda-rpc/1'

export interface RpcHandlers {
  onTyping?(message: TypingMessage): void
  onPresence?(message: PresenceMessage): void
  onReadReceipt?(message: ReadReceiptMessage): void
  onRequestWrite?(message: RequestWriteMessage, channel: RpcChannel): void
  onRoomAnnounce?(message: RoomAnnounceMessage): void
  onContactRequest?(message: ContactRequestMessage): void
  onContactResponse?(message: ContactResponseMessage): void
  onRoomKey?(message: RoomKeyMessage): void
}

export interface RpcChannel {
  sendTyping(message: TypingMessage): void
  sendPresence(message: PresenceMessage): void
  sendReadReceipt(message: ReadReceiptMessage): void
  sendRequestWrite(message: RequestWriteMessage): void
  sendRoomAnnounce(message: RoomAnnounceMessage): void
  sendContactRequest(message: ContactRequestMessage): void
  sendContactResponse(message: ContactResponseMessage): void
  sendRoomKey(message: RoomKeyMessage): void
  close(): void
}

export function attachRpc(socket: Duplex, handlers: RpcHandlers = {}): RpcChannel {
  const mux = Protomux.from(socket)

  const muxChannel = mux.createChannel({ protocol: PROTOCOL })
  muxChannel.open()

  // Forward-referenced: assigned before this function returns, and message
  // handlers below only run afterward (async), so it's always defined by the
  // time it's read — lets onRequestWrite reply on the same connection it came from.
  let channel: RpcChannel

  const typing = muxChannel.addMessage({
    encoding: typingEncoding,
    onmessage: (message) => handlers.onTyping?.(message)
  })

  const presence = muxChannel.addMessage({
    encoding: presenceEncoding,
    onmessage: (message) => handlers.onPresence?.(message)
  })

  const readReceipt = muxChannel.addMessage({
    encoding: readReceiptEncoding,
    onmessage: (message) => handlers.onReadReceipt?.(message)
  })

  const requestWrite = muxChannel.addMessage({
    encoding: requestWriteEncoding,
    onmessage: (message) => handlers.onRequestWrite?.(message, channel)
  })

  const roomAnnounce = muxChannel.addMessage({
    encoding: roomAnnounceEncoding,
    onmessage: (message) => handlers.onRoomAnnounce?.(message)
  })

  const contactRequest = muxChannel.addMessage({
    encoding: contactRequestEncoding,
    onmessage: (message) => handlers.onContactRequest?.(message)
  })

  const contactResponse = muxChannel.addMessage({
    encoding: contactResponseEncoding,
    onmessage: (message) => handlers.onContactResponse?.(message)
  })

  const roomKey = muxChannel.addMessage({
    encoding: roomKeyEncoding,
    onmessage: (message) => handlers.onRoomKey?.(message)
  })

  // Every send here is fire-and-forget best-effort — none of the callers await a result or check
  // a return value. The peer's socket can die at any point between an `onConnection` snapshot
  // (e.g. the write-request retry timer iterating `this.peers` every 15s) and the `send` actually
  // running: `.close` only fires once the stream fully finishes, so a channel can already be
  // unusable and still throw synchronously on `send` in that window — a flaky mobile connection
  // hits it far more than a stable desktop one. Uncaught, that took the whole session down instead
  // of just losing one message to a peer that was already on its way out.
  const safeSend = (send: () => void): void => {
    try {
      send()
    } catch (err) {
      console.warn('[rpc] send on a closing peer channel:', (err as Error).message)
    }
  }

  channel = {
    sendTyping: (message) => safeSend(() => typing.send(message)),
    sendPresence: (message) => safeSend(() => presence.send(message)),
    sendReadReceipt: (message) => safeSend(() => readReceipt.send(message)),
    sendRequestWrite: (message) => safeSend(() => requestWrite.send(message)),
    sendRoomAnnounce: (message) => safeSend(() => roomAnnounce.send(message)),
    sendContactRequest: (message) => safeSend(() => contactRequest.send(message)),
    sendContactResponse: (message) => safeSend(() => contactResponse.send(message)),
    sendRoomKey: (message) => safeSend(() => roomKey.send(message)),
    close: () => muxChannel.close()
  }
  return channel
}
