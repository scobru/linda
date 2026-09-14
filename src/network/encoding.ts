import { messageEncoding } from './message-encoding.js'

// Ephemeral messages on the `linda-rpc/1` Protomux channel. Each is declared as its field list and
// the three codec functions are derived from it — see message-encoding.ts for why, and for what
// `optionalString` means on the wire.

export interface TypingMessage {
  roomId: string
  userId: string
  typing: boolean
}

export const typingEncoding = messageEncoding<TypingMessage>([
  ['roomId', 'string'],
  ['userId', 'string'],
  ['typing', 'bool']
])

export interface PresenceMessage {
  userId: string
  online: boolean
  nickname: string
  avatar?: string
}

export const presenceEncoding = messageEncoding<PresenceMessage>([
  ['userId', 'string'],
  ['online', 'bool'],
  ['nickname', 'string'],
  ['avatar', 'optionalString']
])

export interface ReadReceiptMessage {
  roomId: string
  userId: string
  messageId: string
}

export const readReceiptEncoding = messageEncoding<ReadReceiptMessage>([
  ['roomId', 'string'],
  ['userId', 'string'],
  ['messageId', 'string']
])

export interface RequestWriteMessage {
  bootstrapKey: string
  writerKey: string
  identityId: string
  inviteCode: string
}

export const requestWriteEncoding = messageEncoding<RequestWriteMessage>([
  ['bootstrapKey', 'string'],
  ['writerKey', 'string'],
  ['identityId', 'string'],
  ['inviteCode', 'string']
])

export interface RoomKeyMessage {
  roomId: string
  epoch: number
  key: string
}

export const roomKeyEncoding = messageEncoding<RoomKeyMessage>([
  ['roomId', 'string'],
  ['epoch', 'uint'],
  ['key', 'string']
])

export interface RoomAnnounceMessage {
  roomId: string
  name: string
  bootstrapKey: string
  authorId: string
  inviteCode: string
  avatar?: string
  description?: string
}

export const roomAnnounceEncoding = messageEncoding<RoomAnnounceMessage>([
  ['roomId', 'string'],
  ['name', 'string'],
  ['bootstrapKey', 'string'],
  ['authorId', 'string'],
  ['inviteCode', 'string'],
  ['avatar', 'optionalString'],
  ['description', 'optionalString']
])

export interface ContactRequestMessage {
  fromId: string
  nickname: string
  avatar?: string
}

export const contactRequestEncoding = messageEncoding<ContactRequestMessage>([
  ['fromId', 'string'],
  ['nickname', 'string'],
  ['avatar', 'optionalString']
])

export interface ContactResponseMessage {
  fromId: string
  accepted: boolean
  roomId: string
  name: string
  bootstrapKey: string
  inviteCode: string
  avatar?: string
}

export const contactResponseEncoding = messageEncoding<ContactResponseMessage>([
  ['fromId', 'string'],
  ['accepted', 'bool'],
  ['roomId', 'string'],
  ['name', 'string'],
  ['bootstrapKey', 'string'],
  ['inviteCode', 'string'],
  ['avatar', 'optionalString']
])
