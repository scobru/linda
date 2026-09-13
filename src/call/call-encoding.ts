import * as cenc from 'compact-encoding'
import type { Encoding } from 'compact-encoding'

// ---------------------------------------------------------------------------
// Call signaling messages — travel over the `linda-call/1` Protomux channel.
// Kept separate from the chat RPC encodings so the two protocol domains don't
// intermix; the call channel is higher-frequency (media frames) and the code
// that opens it should be loadable independently.
// ---------------------------------------------------------------------------

export interface CallOfferMessage {
  callId: string
  fromId: string
  roomId: string   // which room/contact context the call originates from
  audio: boolean
  video: boolean
}

export interface CallAnswerMessage {
  callId: string
  fromId: string
  accepted: boolean
}

export interface CallEndMessage {
  callId: string
  fromId: string
  reason: string   // 'hangup' | 'rejected' | 'timeout' | 'error' | 'busy'
}

export interface CallControlMessage {
  callId: string
  fromId: string
  action: string   // 'mute' | 'unmute' | 'camera-on' | 'camera-off'
}

/** A single media frame (audio or video) with a tiny header and a raw binary
 *  payload carried after the encoded header bytes. Protomux delivers it as one
 *  contiguous buffer; the decoder splits it at the header/body boundary. */
export interface MediaFrameMessage {
  callId: string
  seq: number
  timestamp: number
  kind: number      // 0 = audio, 1 = video
  keyframe: boolean
  payload: Uint8Array
}

// ── Encoders ─────────────────────────────────────────────────────────────────

export const callOfferEncoding: Encoding<CallOfferMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.callId)
    cenc.string.preencode(state, m.fromId)
    cenc.string.preencode(state, m.roomId)
    cenc.bool.preencode(state, m.audio)
    cenc.bool.preencode(state, m.video)
  },
  encode(state, m) {
    cenc.string.encode(state, m.callId)
    cenc.string.encode(state, m.fromId)
    cenc.string.encode(state, m.roomId)
    cenc.bool.encode(state, m.audio)
    cenc.bool.encode(state, m.video)
  },
  decode(state) {
    return {
      callId: cenc.string.decode(state),
      fromId: cenc.string.decode(state),
      roomId: cenc.string.decode(state),
      audio: cenc.bool.decode(state),
      video: cenc.bool.decode(state)
    }
  }
}

export const callAnswerEncoding: Encoding<CallAnswerMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.callId)
    cenc.string.preencode(state, m.fromId)
    cenc.bool.preencode(state, m.accepted)
  },
  encode(state, m) {
    cenc.string.encode(state, m.callId)
    cenc.string.encode(state, m.fromId)
    cenc.bool.encode(state, m.accepted)
  },
  decode(state) {
    return {
      callId: cenc.string.decode(state),
      fromId: cenc.string.decode(state),
      accepted: cenc.bool.decode(state)
    }
  }
}

export const callEndEncoding: Encoding<CallEndMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.callId)
    cenc.string.preencode(state, m.fromId)
    cenc.string.preencode(state, m.reason)
  },
  encode(state, m) {
    cenc.string.encode(state, m.callId)
    cenc.string.encode(state, m.fromId)
    cenc.string.encode(state, m.reason)
  },
  decode(state) {
    return {
      callId: cenc.string.decode(state),
      fromId: cenc.string.decode(state),
      reason: cenc.string.decode(state)
    }
  }
}

export const callControlEncoding: Encoding<CallControlMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.callId)
    cenc.string.preencode(state, m.fromId)
    cenc.string.preencode(state, m.action)
  },
  encode(state, m) {
    cenc.string.encode(state, m.callId)
    cenc.string.encode(state, m.fromId)
    cenc.string.encode(state, m.action)
  },
  decode(state) {
    return {
      callId: cenc.string.decode(state),
      fromId: cenc.string.decode(state),
      action: cenc.string.decode(state)
    }
  }
}

/** Media frames carry a compact header followed by a variable-length binary
 *  payload. `compact-encoding`'s `buffer` primitive length-prefixes the bytes,
 *  so the decoder knows exactly where the header stops and the payload starts
 *  without any external framing. */
export const mediaFrameEncoding: Encoding<MediaFrameMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.callId)
    cenc.uint.preencode(state, m.seq)
    cenc.uint.preencode(state, m.timestamp)
    cenc.uint.preencode(state, m.kind)
    cenc.bool.preencode(state, m.keyframe)
    cenc.buffer.preencode(state, m.payload as Buffer)
  },
  encode(state, m) {
    cenc.string.encode(state, m.callId)
    cenc.uint.encode(state, m.seq)
    cenc.uint.encode(state, m.timestamp)
    cenc.uint.encode(state, m.kind)
    cenc.bool.encode(state, m.keyframe)
    cenc.buffer.encode(state, m.payload as Buffer)
  },
  decode(state) {
    return {
      callId: cenc.string.decode(state),
      seq: cenc.uint.decode(state),
      timestamp: cenc.uint.decode(state),
      kind: cenc.uint.decode(state),
      keyframe: cenc.bool.decode(state),
      payload: cenc.buffer.decode(state)
    }
  }
}
