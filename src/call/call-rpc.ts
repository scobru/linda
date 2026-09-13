import Protomux from 'protomux'
import type { Duplex } from 'node:stream'
import {
  callOfferEncoding, callAnswerEncoding, callEndEncoding,
  callControlEncoding, mediaFrameEncoding,
  type CallOfferMessage, type CallAnswerMessage, type CallEndMessage,
  type CallControlMessage, type MediaFrameMessage
} from './call-encoding.js'

const PROTOCOL = 'linda-call/1'

export interface CallRpcHandlers {
  onCallOffer?(message: CallOfferMessage): void
  onCallAnswer?(message: CallAnswerMessage): void
  onCallEnd?(message: CallEndMessage): void
  onCallControl?(message: CallControlMessage): void
  onMediaFrame?(message: MediaFrameMessage): void
}

export interface CallRpcChannel {
  sendCallOffer(message: CallOfferMessage): void
  sendCallAnswer(message: CallAnswerMessage): void
  sendCallEnd(message: CallEndMessage): void
  sendCallControl(message: CallControlMessage): void
  sendMediaFrame(message: MediaFrameMessage): void
  close(): void
}

/**
 * Opens the `linda-call/1` protocol channel on an already-authenticated
 * Hyperswarm socket. Runs alongside the existing `linda-rpc/1` channel on the
 * same connection — Protomux multiplexes them as independent streams, so a
 * burst of 50 Hz audio frames never starves a typing indicator.
 *
 * Same fire-and-forget resilience as the chat RPC: sends on a closing peer
 * are caught and discarded rather than crashing the session.
 */
export function attachCallRpc(socket: Duplex, handlers: CallRpcHandlers = {}): CallRpcChannel {
  const mux = Protomux.from(socket)

  const muxChannel = mux.createChannel({ protocol: PROTOCOL })
  muxChannel.open()

  const callOffer = muxChannel.addMessage({
    encoding: callOfferEncoding,
    onmessage: (message: CallOfferMessage) => handlers.onCallOffer?.(message)
  })

  const callAnswer = muxChannel.addMessage({
    encoding: callAnswerEncoding,
    onmessage: (message: CallAnswerMessage) => handlers.onCallAnswer?.(message)
  })

  const callEnd = muxChannel.addMessage({
    encoding: callEndEncoding,
    onmessage: (message: CallEndMessage) => handlers.onCallEnd?.(message)
  })

  const callControl = muxChannel.addMessage({
    encoding: callControlEncoding,
    onmessage: (message: CallControlMessage) => handlers.onCallControl?.(message)
  })

  const mediaFrame = muxChannel.addMessage({
    encoding: mediaFrameEncoding,
    onmessage: (message: MediaFrameMessage) => handlers.onMediaFrame?.(message)
  })

  const safeSend = (send: () => void): void => {
    try {
      send()
    } catch (err) {
      console.warn('[call-rpc] send on a closing peer channel:', (err as Error).message)
    }
  }

  const channel: CallRpcChannel = {
    sendCallOffer: (message) => safeSend(() => callOffer.send(message)),
    sendCallAnswer: (message) => safeSend(() => callAnswer.send(message)),
    sendCallEnd: (message) => safeSend(() => callEnd.send(message)),
    sendCallControl: (message) => safeSend(() => callControl.send(message)),
    sendMediaFrame: (message) => safeSend(() => mediaFrame.send(message)),
    close: () => muxChannel.close()
  }
  return channel
}
