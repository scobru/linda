import * as cenc from 'compact-encoding'
import type { Encoding } from 'compact-encoding'

export interface TypingMessage {
  roomId: string
  userId: string
  typing: boolean
}

export interface PresenceMessage {
  userId: string
  online: boolean
  nickname: string
  avatar?: string
  /** Mobile-only: this peer's ZEN pub key, so others can wake them via a push-notification relay while offline (see mobile/src/bare/zen-push.ts). Absent on desktop. */
  zenPub?: string
}

export interface ReadReceiptMessage {
  roomId: string
  userId: string
  messageId: string
}

export const typingEncoding: Encoding<TypingMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.roomId)
    cenc.string.preencode(state, m.userId)
    cenc.bool.preencode(state, m.typing)
  },
  encode(state, m) {
    cenc.string.encode(state, m.roomId)
    cenc.string.encode(state, m.userId)
    cenc.bool.encode(state, m.typing)
  },
  decode(state) {
    return {
      roomId: cenc.string.decode(state),
      userId: cenc.string.decode(state),
      typing: cenc.bool.decode(state)
    }
  }
}

export const presenceEncoding: Encoding<PresenceMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.userId)
    cenc.bool.preencode(state, m.online)
    cenc.string.preencode(state, m.nickname)
    cenc.string.preencode(state, m.avatar ?? '')
    cenc.string.preencode(state, m.zenPub ?? '')
  },
  encode(state, m) {
    cenc.string.encode(state, m.userId)
    cenc.bool.encode(state, m.online)
    cenc.string.encode(state, m.nickname)
    cenc.string.encode(state, m.avatar ?? '')
    cenc.string.encode(state, m.zenPub ?? '')
  },
  decode(state) {
    const userId = cenc.string.decode(state)
    const online = cenc.bool.decode(state)
    const nickname = cenc.string.decode(state)
    let avatar = ''
    let zenPub = ''
    try {
      avatar = cenc.string.decode(state)
      zenPub = cenc.string.decode(state)
    } catch {
      // backwards compatibility if old peer decoded
    }
    return {
      userId,
      online,
      nickname,
      avatar,
      zenPub: zenPub || undefined
    }
  }
}


export interface RequestWriteMessage {
  bootstrapKey: string
  writerKey: string
  identityId: string
  inviteCode: string
}

export const requestWriteEncoding: Encoding<RequestWriteMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.bootstrapKey)
    cenc.string.preencode(state, m.writerKey)
    cenc.string.preencode(state, m.identityId)
    cenc.string.preencode(state, m.inviteCode)
  },
  encode(state, m) {
    cenc.string.encode(state, m.bootstrapKey)
    cenc.string.encode(state, m.writerKey)
    cenc.string.encode(state, m.identityId)
    cenc.string.encode(state, m.inviteCode)
  },
  decode(state) {
    return {
      bootstrapKey: cenc.string.decode(state),
      writerKey: cenc.string.decode(state),
      identityId: cenc.string.decode(state),
      inviteCode: cenc.string.decode(state)
    }
  }
}

export interface RoomKeyMessage {
  roomId: string
  epoch: number
  key: string
}

export const roomKeyEncoding: Encoding<RoomKeyMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.roomId)
    cenc.uint.preencode(state, m.epoch)
    cenc.string.preencode(state, m.key)
  },
  encode(state, m) {
    cenc.string.encode(state, m.roomId)
    cenc.uint.encode(state, m.epoch)
    cenc.string.encode(state, m.key)
  },
  decode(state) {
    return {
      roomId: cenc.string.decode(state),
      epoch: cenc.uint.decode(state),
      key: cenc.string.decode(state)
    }
  }
}

export interface RoomAnnounceMessage {
  roomId: string
  name: string
  bootstrapKey: string
  authorId: string
  inviteCode: string
  avatar?: string
  description?: string
}

export const roomAnnounceEncoding: Encoding<RoomAnnounceMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.roomId)
    cenc.string.preencode(state, m.name)
    cenc.string.preencode(state, m.bootstrapKey)
    cenc.string.preencode(state, m.authorId)
    cenc.string.preencode(state, m.inviteCode)
    cenc.string.preencode(state, m.avatar ?? '')
    cenc.string.preencode(state, m.description ?? '')
  },
  encode(state, m) {
    cenc.string.encode(state, m.roomId)
    cenc.string.encode(state, m.name)
    cenc.string.encode(state, m.bootstrapKey)
    cenc.string.encode(state, m.authorId)
    cenc.string.encode(state, m.inviteCode)
    cenc.string.encode(state, m.avatar ?? '')
    cenc.string.encode(state, m.description ?? '')
  },
  decode(state) {
    const roomId = cenc.string.decode(state)
    const name = cenc.string.decode(state)
    const bootstrapKey = cenc.string.decode(state)
    const authorId = cenc.string.decode(state)
    const inviteCode = cenc.string.decode(state)
    let avatar = ''
    let description = ''
    try {
      avatar = cenc.string.decode(state)
      description = cenc.string.decode(state)
    } catch {
      // backwards compatibility
    }
    return {
      roomId,
      name,
      bootstrapKey,
      authorId,
      inviteCode,
      avatar,
      description
    }
  }
}


export interface ContactRequestMessage {
  fromId: string
  nickname: string
  avatar?: string
}

export const contactRequestEncoding: Encoding<ContactRequestMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.fromId)
    cenc.string.preencode(state, m.nickname)
    cenc.string.preencode(state, m.avatar ?? '')
  },
  encode(state, m) {
    cenc.string.encode(state, m.fromId)
    cenc.string.encode(state, m.nickname)
    cenc.string.encode(state, m.avatar ?? '')
  },
  decode(state) {
    const fromId = cenc.string.decode(state)
    const nickname = cenc.string.decode(state)
    let avatar = ''
    try {
      avatar = cenc.string.decode(state)
    } catch {
      // backwards compatibility
    }
    return { fromId, nickname, avatar }
  }
}

export interface ContactResponseMessage {
  fromId: string
  accepted: boolean
  roomId: string
  name: string
  bootstrapKey: string
  inviteCode: string
  avatar?: string
}

export const contactResponseEncoding: Encoding<ContactResponseMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.fromId)
    cenc.bool.preencode(state, m.accepted)
    cenc.string.preencode(state, m.roomId)
    cenc.string.preencode(state, m.name)
    cenc.string.preencode(state, m.bootstrapKey)
    cenc.string.preencode(state, m.inviteCode)
    cenc.string.preencode(state, m.avatar ?? '')
  },
  encode(state, m) {
    cenc.string.encode(state, m.fromId)
    cenc.bool.encode(state, m.accepted)
    cenc.string.encode(state, m.roomId)
    cenc.string.encode(state, m.name)
    cenc.string.encode(state, m.bootstrapKey)
    cenc.string.encode(state, m.inviteCode)
    cenc.string.encode(state, m.avatar ?? '')
  },
  decode(state) {
    const fromId = cenc.string.decode(state)
    const accepted = cenc.bool.decode(state)
    const roomId = cenc.string.decode(state)
    const name = cenc.string.decode(state)
    const bootstrapKey = cenc.string.decode(state)
    const inviteCode = cenc.string.decode(state)
    let avatar = ''
    try {
      avatar = cenc.string.decode(state)
    } catch {
      // backwards compatibility
    }
    return {
      fromId,
      accepted,
      roomId,
      name,
      bootstrapKey,
      inviteCode,
      avatar
    }
  }
}


export interface CallSignalMessage {
  roomId: string
  fromUserId: string
  kind: 'offer' | 'answer' | 'candidate' | 'hangup'
  payload: string
}

export const callSignalEncoding: Encoding<CallSignalMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.roomId)
    cenc.string.preencode(state, m.fromUserId)
    cenc.string.preencode(state, m.kind)
    cenc.string.preencode(state, m.payload)
  },
  encode(state, m) {
    cenc.string.encode(state, m.roomId)
    cenc.string.encode(state, m.fromUserId)
    cenc.string.encode(state, m.kind)
    cenc.string.encode(state, m.payload)
  },
  decode(state) {
    return {
      roomId: cenc.string.decode(state),
      fromUserId: cenc.string.decode(state),
      kind: cenc.string.decode(state) as CallSignalMessage['kind'],
      payload: cenc.string.decode(state)
    }
  }
}

export const readReceiptEncoding: Encoding<ReadReceiptMessage> = {
  preencode(state, m) {
    cenc.string.preencode(state, m.roomId)
    cenc.string.preencode(state, m.userId)
    cenc.string.preencode(state, m.messageId)
  },
  encode(state, m) {
    cenc.string.encode(state, m.roomId)
    cenc.string.encode(state, m.userId)
    cenc.string.encode(state, m.messageId)
  },
  decode(state) {
    return {
      roomId: cenc.string.decode(state),
      userId: cenc.string.decode(state),
      messageId: cenc.string.decode(state)
    }
  }
}
