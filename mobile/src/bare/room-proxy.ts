import { bareClient } from './client'
import type { ChatMessage, MemberInfo } from '@core/rooms/room'

export class RoomProxy {
  writable = false
  hasKey = false

  constructor(readonly id: string) {
    bareClient.on('roomState', (payload: { roomId: string; writable: boolean; hasKey: boolean }) => {
      if (payload.roomId !== this.id) return
      this.writable = payload.writable
      this.hasKey = payload.hasKey
    })
  }

  onStateChange(listener: (state: { writable: boolean; hasKey: boolean }) => void): () => void {
    return bareClient.on('roomState', (payload: { roomId: string; writable: boolean; hasKey: boolean }) => {
      if (payload.roomId === this.id) listener({ writable: payload.writable, hasKey: payload.hasKey })
    })
  }

  /** Pulls current state directly rather than waiting on the 'roomState' push, which fires the
   * instant the room is created/joined — before this proxy exists to hear it — and is otherwise lost. */
  async refreshState(): Promise<{ writable: boolean; hasKey: boolean }> {
    const state = await bareClient.call<{ writable: boolean; hasKey: boolean }>('room.getState', this.id)
    this.writable = state.writable
    this.hasKey = state.hasKey
    return state
  }

  async *messages(): AsyncIterable<ChatMessage> {
    const all = await bareClient.call<ChatMessage[]>('room.messages', this.id)
    for (const msg of all) yield msg
  }

  getMessage(index: number): Promise<ChatMessage> {
    return bareClient.call('room.getMessage', this.id, index)
  }

  send(authorId: string, body: string, replyTo?: string): Promise<ChatMessage> {
    return bareClient.call('room.send', this.id, authorId, body, replyTo)
  }

  editMessage(messageId: string, body: string): Promise<void> {
    return bareClient.call('room.editMessage', this.id, messageId, body)
  }

  deleteMessage(messageId: string): Promise<void> {
    return bareClient.call('room.deleteMessage', this.id, messageId)
  }

  toggleReaction(userId: string, messageId: string, emoji: string): Promise<void> {
    return bareClient.call('room.toggleReaction', this.id, userId, messageId, emoji)
  }

  sendFile(authorId: string, name: string, mimeType: string, base64: string, thumbnail?: string, body = ''): Promise<ChatMessage> {
    return bareClient.call('room.sendFile', this.id, authorId, name, mimeType, base64, thumbnail, body)
  }

  listMembers(): Promise<{ members: MemberInfo[]; ownerId: string | null; moderators: string[]; muted: string[]; banned: string[] }> {
    return bareClient.call('room.listMembers', this.id)
  }

  onMessage(listener: (index: number) => void): () => void {
    return bareClient.on('roomMessage', (payload: { roomId: string; index: number }) => {
      if (payload.roomId === this.id) listener(payload.index)
    })
  }

  sendTyping(userId: string, typing: boolean): Promise<void> {
    return bareClient.call('room.sendTyping', this.id, userId, typing)
  }

  onTyping(listener: (userId: string, typing: boolean) => void): () => void {
    return bareClient.on('typing', (payload: { roomId: string; userId: string; typing: boolean }) => {
      if (payload.roomId === this.id) listener(payload.userId, payload.typing)
    })
  }

  sendReadReceipt(userId: string, messageId: string): Promise<void> {
    return bareClient.call('room.sendReadReceipt', this.id, userId, messageId)
  }

  onReadReceipt(listener: (userId: string, messageId: string) => void): () => void {
    return bareClient.on('readReceipt', (payload: { roomId: string; userId: string; messageId: string }) => {
      if (payload.roomId === this.id) listener(payload.userId, payload.messageId)
    })
  }
}

/** `null` if the peer hosting the file is unreachable. */
export function downloadFile(driveKeyHex: string, drivePath: string): Promise<string | null> {
  return bareClient.call('files.download', driveKeyHex, drivePath)
}
