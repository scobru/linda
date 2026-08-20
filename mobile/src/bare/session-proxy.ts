import { bareClient } from './client'
import { RoomProxy } from './room-proxy'
import type { RoomBookmark, ContactEntry } from '@core/app/session'
import type { RoomAnnounceMessage } from '@core/network/encoding'

export interface SessionInfo {
  nickname: string
  avatar: string
  bookmarks: RoomBookmark[]
  contacts: ContactEntry[]
  peerAvatars: [string, string][]
}

export interface RoomSummary extends RoomBookmark {
  lastMessageTime: number | null
  lastMessageText: string | null
  lastMessageAuthor: string | null
}

export class SessionProxy {
  private rooms = new Map<string, RoomProxy>()

  getRoom(id: string): RoomProxy {
    let room = this.rooms.get(id)
    if (!room) {
      room = new RoomProxy(id)
      this.rooms.set(id, room)
    }
    return room
  }

  static async create(storageDir: string): Promise<{ session: SessionProxy; info: SessionInfo }> {
    const info = await bareClient.call<SessionInfo>('session.create', storageDir)
    return { session: new SessionProxy(), info }
  }

  async reopenBookmarkedRooms(): Promise<void> {
    await bareClient.call('session.reopenBookmarkedRooms')
  }

  listBookmarks(): Promise<RoomBookmark[]> {
    return bareClient.call('session.listBookmarks')
  }

  listRoomSummaries(): Promise<RoomSummary[]> {
    return bareClient.call('session.listRoomSummaries')
  }

  markRoomRead(roomId: string): Promise<void> {
    return bareClient.call('session.markRoomRead', roomId)
  }

  listContacts(): Promise<ContactEntry[]> {
    return bareClient.call('session.listContacts')
  }

  getNickname(): Promise<string> {
    return bareClient.call('session.getNickname')
  }

  getAvatar(): Promise<string> {
    return bareClient.call('session.getAvatar')
  }

  async listPeerAvatars(): Promise<Map<string, string>> {
    const pairs = await bareClient.call<[string, string][]>('session.listPeerAvatars')
    return new Map(pairs)
  }

  setNickname(nickname: string): Promise<void> {
    return bareClient.call('session.setNickname', nickname)
  }

  setAvatar(avatar: string): Promise<void> {
    return bareClient.call('session.setAvatar', avatar)
  }

  async createRoom(name: string, isPublic = false, avatar = '', description = ''): Promise<RoomProxy> {
    const { roomId } = await bareClient.call<{ roomId: string }>('session.createRoom', name, isPublic, avatar, description)
    return this.getRoom(roomId)
  }

  async joinRoomByKey(name: string, key: string): Promise<RoomProxy> {
    const { roomId } = await bareClient.call<{ roomId: string }>('session.joinRoomByKey', name, key)
    return this.getRoom(roomId)
  }

  sendContactRequest(userId: string, nickname: string): Promise<boolean> {
    return bareClient.call('session.sendContactRequest', userId, nickname)
  }

  respondToContact(userId: string, accept: boolean): Promise<void> {
    return bareClient.call('session.respondToContact', userId, accept)
  }

  deleteContact(userId: string): Promise<void> {
    return bareClient.call('session.deleteContact', userId)
  }

  listDirectory(): Promise<RoomAnnounceMessage[]> {
    return bareClient.call('session.listDirectory')
  }

  removeFromDirectory(roomId: string): Promise<void> {
    return bareClient.call('session.removeFromDirectory', roomId)
  }

  inviteLinkFor(roomId: string): Promise<string> {
    return bareClient.call('session.inviteLinkFor', roomId)
  }

  regenerateInvite(roomId: string): Promise<string> {
    return bareClient.call('session.regenerateInvite', roomId)
  }

  kickMember(roomId: string, writerKeyHex: string): Promise<void> {
    return bareClient.call('session.kickMember', roomId, writerKeyHex)
  }

  banMember(roomId: string, writerKeyHex: string, identityId: string): Promise<void> {
    return bareClient.call('session.banMember', roomId, writerKeyHex, identityId)
  }

  unbanMember(roomId: string, identityId: string): Promise<void> {
    return bareClient.call('session.unbanMember', roomId, identityId)
  }

  muteMember(roomId: string, identityId: string): Promise<void> {
    return bareClient.call('session.muteMember', roomId, identityId)
  }

  unmuteMember(roomId: string, identityId: string): Promise<void> {
    return bareClient.call('session.unmuteMember', roomId, identityId)
  }

  promoteToModerator(roomId: string, identityId: string): Promise<void> {
    return bareClient.call('session.promoteToModerator', roomId, identityId)
  }

  demoteModerator(roomId: string, identityId: string): Promise<void> {
    return bareClient.call('session.demoteModerator', roomId, identityId)
  }

  deleteRoom(roomId: string): Promise<void> {
    return bareClient.call('session.deleteRoom', roomId)
  }
}
