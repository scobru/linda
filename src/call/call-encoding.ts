import { messageEncoding } from '../network/message-encoding.js'

// ---------------------------------------------------------------------------
// Call signaling messages — they travel over the `linda-call/1` Protomux channel.
// Kept separate from the chat RPC encodings so the two protocol domains don't intermix; the call
// channel is higher-frequency (media frames) and the code that opens it should be loadable
// independently. The codecs themselves are derived from the field lists below — see
// `network/message-encoding.ts`.
// ---------------------------------------------------------------------------

export interface CallOfferMessage {
  callId: string
  fromId: string
  roomId: string   // which room/contact context the call originates from
  audio: boolean
  video: boolean
}

export const callOfferEncoding = messageEncoding<CallOfferMessage>([
  ['callId', 'string'],
  ['fromId', 'string'],
  ['roomId', 'string'],
  ['audio', 'bool'],
  ['video', 'bool']
])

export interface CallAnswerMessage {
  callId: string
  fromId: string
  accepted: boolean
}

export const callAnswerEncoding = messageEncoding<CallAnswerMessage>([
  ['callId', 'string'],
  ['fromId', 'string'],
  ['accepted', 'bool']
])

export interface CallEndMessage {
  callId: string
  fromId: string
  reason: string   // 'hangup' | 'rejected' | 'timeout' | 'error' | 'busy'
}

export const callEndEncoding = messageEncoding<CallEndMessage>([
  ['callId', 'string'],
  ['fromId', 'string'],
  ['reason', 'string']
])

export interface CallControlMessage {
  callId: string
  fromId: string
  action: string   // 'mute' | 'unmute' | 'camera-on' | 'camera-off'
}

export const callControlEncoding = messageEncoding<CallControlMessage>([
  ['callId', 'string'],
  ['fromId', 'string'],
  ['action', 'string']
])

/** A single media frame (audio or video) with a tiny header and a raw binary payload.
 *  `compact-encoding`'s `buffer` primitive length-prefixes the bytes, so the decoder knows exactly
 *  where the header stops and the payload starts without any external framing. */
export interface MediaFrameMessage {
  callId: string
  seq: number
  timestamp: number
  kind: number      // 0 = audio, 1 = video
  keyframe: boolean
  payload: Uint8Array
}

export const mediaFrameEncoding = messageEncoding<MediaFrameMessage>([
  ['callId', 'string'],
  ['seq', 'uint'],
  ['timestamp', 'uint'],
  ['kind', 'uint'],
  ['keyframe', 'bool'],
  ['payload', 'buffer']
])
