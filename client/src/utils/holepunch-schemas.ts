import cenc from 'compact-encoding';

/**
 * Schema for WebRTC Signaling via GunDB or P2P.
 */
export const SignalingSchema = {
  preencode(state: any, msg: any) {
    cenc.string.preencode(state, msg.type);
    cenc.string.preencode(state, msg.from);
    cenc.string.preencode(state, JSON.stringify(msg.payload));
    cenc.uint.preencode(state, msg.timestamp);
  },
  encode(state: any, msg: any) {
    cenc.string.encode(state, msg.type);
    cenc.string.encode(state, msg.from);
    cenc.string.encode(state, JSON.stringify(msg.payload));
    cenc.uint.encode(state, msg.timestamp);
  },
  decode(state: any) {
    return {
      type: cenc.string.decode(state),
      from: cenc.string.decode(state),
      payload: JSON.parse(cenc.string.decode(state)),
      timestamp: cenc.uint.decode(state)
    };
  }
};

/**
 * Schema for Chat Messages.
 */
export const MessageSchema = {
  preencode(state: any, msg: any) {
    cenc.string.preencode(state, msg.id);
    cenc.string.preencode(state, msg.sender);
    cenc.string.preencode(state, msg.type);
    cenc.string.preencode(state, msg.text || "");
    cenc.uint.preencode(state, msg.timestamp);
  },
  encode(state: any, msg: any) {
    cenc.string.encode(state, msg.id);
    cenc.string.encode(state, msg.sender);
    cenc.string.encode(state, msg.type);
    cenc.string.encode(state, msg.text || "");
    cenc.uint.encode(state, msg.timestamp);
  },
  decode(state: any) {
    return {
      id: cenc.string.decode(state),
      sender: cenc.string.decode(state),
      type: cenc.string.decode(state),
      text: cenc.string.decode(state),
      timestamp: cenc.uint.decode(state)
    };
  }
};
