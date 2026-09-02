import type { RoomView } from '../app/session-view.js'
import type { ChatMessage, FileAttachment, MemberInfo, RoomFile } from '../rooms/room.js'
import type { RpcClient } from './rpc-client.js'

export interface RemoteRoomState {
  avatar?: string
  description?: string
  writable?: boolean
  hasKey?: boolean
  isBroadcast?: boolean
  messageCount?: number
  ownerId?: string | null
  moderators?: string[]
  muted?: string[]
  banned?: string[]
  members?: MemberInfo[]
}

/**
 * Desktop remote proxy satisfying `RoomView`.
 *
 * Implements the seam defined in `session-view.ts`:
 * - Synchronous UI reads are answered from a local mirror updated by pushed worker events.
 * - Async commands and queries are forwarded to the Bare worker via RPC.
 */
export class RemoteRoomView implements RoomView {
  avatar = ''
  description = ''
  writable = false
  hasKey = false
  isBroadcast = false
  messageCount = 0

  private ownerId: string | null = null
  private moderators = new Set<string>()
  private muted = new Set<string>()
  private banned = new Set<string>()
  private members: MemberInfo[] = []

  constructor(
    readonly id: string,
    private readonly rpcClient: RpcClient,
    initialState?: Partial<RemoteRoomState>
  ) {
    if (initialState) this.applyState(initialState)

    this.rpcClient.on('roomState', (payload: { roomId: string } & Partial<RemoteRoomState>) => {
      if (payload.roomId === this.id) {
        this.applyState(payload)
      }
    })
  }

  applyState(state: Partial<RemoteRoomState>): void {
    if (state.avatar !== undefined) this.avatar = state.avatar
    if (state.description !== undefined) this.description = state.description
    if (state.writable !== undefined) this.writable = state.writable
    if (state.hasKey !== undefined) this.hasKey = state.hasKey
    if (state.isBroadcast !== undefined) this.isBroadcast = state.isBroadcast
    if (state.messageCount !== undefined) this.messageCount = state.messageCount
    if (state.ownerId !== undefined) this.ownerId = state.ownerId
    if (state.moderators !== undefined) this.moderators = new Set(state.moderators)
    if (state.muted !== undefined) this.muted = new Set(state.muted)
    if (state.banned !== undefined) this.banned = new Set(state.banned)
    if (state.members !== undefined) this.members = state.members
  }

  isOwner(identityId: string): boolean {
    return this.ownerId === identityId
  }

  isModerator(identityId: string): boolean {
    return this.moderators.has(identityId)
  }

  isMuted(identityId: string): boolean {
    return this.muted.has(identityId)
  }

  isBanned(identityId: string): boolean {
    return this.banned.has(identityId)
  }

  canPost(identityId: string): boolean {
    if (this.muted.has(identityId) || this.banned.has(identityId)) return false
    return !this.isBroadcast || this.canModerate(identityId)
  }

  canModerate(identityId: string): boolean {
    return this.isOwner(identityId) || this.isModerator(identityId)
  }

  listMembers(): MemberInfo[] {
    return this.members
  }

  listBanned(): string[] {
    return [...this.banned]
  }

  async getMessage(index: number): Promise<ChatMessage> {
    return this.rpcClient.call<ChatMessage>('room.getMessage', this.id, index)
  }

  async *messages(start = 0, end = this.messageCount): AsyncIterable<ChatMessage> {
    const batch = await this.rpcClient.call<ChatMessage[]>('room.messages', this.id, start, end)
    for (const msg of batch) yield msg
  }

  async send(authorId: string, body: string, replyTo?: string): Promise<ChatMessage> {
    return this.rpcClient.call<ChatMessage>('room.send', this.id, authorId, body, replyTo)
  }

  async sendFile(authorId: string, file: FileAttachment, body = ''): Promise<ChatMessage> {
    return this.rpcClient.call<ChatMessage>('room.sendFile', this.id, authorId, file, body)
  }

  async editMessage(messageId: string, body: string): Promise<void> {
    return this.rpcClient.call<void>('room.editMessage', this.id, messageId, body)
  }

  async toggleReaction(userId: string, messageId: string, emoji: string): Promise<void> {
    return this.rpcClient.call<void>('room.toggleReaction', this.id, userId, messageId, emoji)
  }

  async listFiles(): Promise<RoomFile[]> {
    return this.rpcClient.call<RoomFile[]>('room.listFiles', this.id)
  }

  onMessage(listener: (index: number) => void): () => void {
    return this.rpcClient.on('roomMessage', (payload: { roomId: string; index: number }) => {
      if (payload.roomId === this.id) {
        if (payload.index >= this.messageCount) {
          this.messageCount = payload.index + 1
        }
        listener(payload.index)
      }
    })
  }

  onFilesChange(listener: () => void): () => void {
    return this.rpcClient.on('roomFilesChange', (payload: { roomId: string }) => {
      if (payload.roomId === this.id) listener()
    })
  }

  onKeyChange(listener: (epoch: number, keyHex: string) => void): () => void {
    return this.rpcClient.on('roomKeyChange', (payload: { roomId: string; epoch: number; keyHex: string }) => {
      if (payload.roomId === this.id) listener(payload.epoch, payload.keyHex)
    })
  }

  onWritableChange(listener: () => void): () => void {
    return this.rpcClient.on('roomWritableChange', (payload: { roomId: string }) => {
      if (payload.roomId === this.id) listener()
    })
  }
}

// Guarantee at compile time that RemoteRoomView satisfies RoomView
const _satisfiesRoomView: (room: RemoteRoomView) => RoomView = (room) => room
void _satisfiesRoomView
