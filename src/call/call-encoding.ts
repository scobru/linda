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
  /** Audio codecs this caller can both send and play, best first — see `audio-codec.ts`.
   *  Absent from a build that predates codec negotiation, which is read as PCM16 only. */
  audioCodecs?: string
}

export const callOfferEncoding = messageEncoding<CallOfferMessage>([
  ['callId', 'string'],
  ['fromId', 'string'],
  ['roomId', 'string'],
  ['audio', 'bool'],
  ['video', 'bool'],
  ['audioCodecs', 'optionalString']
])

export interface CallAnswerMessage {
  callId: string
  fromId: string
  accepted: boolean
  /** The one codec this call will use, chosen by the answerer from what the offer listed.
   *  Absent from a build that predates negotiation, which is read as PCM16 — see `audio-codec.ts`. */
  audioCodec?: string
}

export const callAnswerEncoding = messageEncoding<CallAnswerMessage>([
  ['callId', 'string'],
  ['fromId', 'string'],
  ['accepted', 'bool'],
  ['audioCodec', 'optionalString']
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

// ---------------------------------------------------------------------------
// What a media frame's `kind` means.
//
// 0 and 1 were on the wire before these names existed, so their values are fixed by every build
// already installed. A new kind is how a new payload format reaches peers that predate it: an older
// build's `handleIncomingFrame` matches 0 and 1 and ignores anything else, so it goes quiet rather
// than playing bytes it would mistake for PCM. Quiet is survivable; the negotiation in
// `audio-codec.ts` is what makes sure it does not happen.
// ---------------------------------------------------------------------------

/** Raw little-endian PCM16. The floor every build understands. */
export const AUDIO_PCM16_FRAME = 0
export const VIDEO_FRAME = 1
/** An Opus packet, as `AudioEncoder` produces it. */
export const AUDIO_OPUS_FRAME = 2

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
