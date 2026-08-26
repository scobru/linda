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

  static async create(storageDir: string, dhtPort?: number): Promise<{ session: SessionProxy; info: SessionInfo }> {
    const info = await bareClient.call<SessionInfo>('session.create', storageDir, dhtPort)
    return { session: new SessionProxy(), info }
  }

  async reopenBookmarkedRooms(): Promise<void> {
    await bareClient.call('session.reopenBookmarkedRooms')
  }

  listBookmarks(): Promise<RoomBookmark[]> {
    return bareClient.call('session.listBookmarks')
  }

  getNetworkStatus(): Promise<{ connections: number; host: string | null; port: number; firewalled: boolean; publicKey: string }> {
    return bareClient.call('session.getNetworkStatus')
  }

  /** Loopback URL for streaming a shared file, served from inside the worklet. Use this for
   * playback; `downloadFile` is for saving or sharing a file whole. */
  mediaUrl(driveKey: string, filePath: string): Promise<string> {
    return bareClient.call('media.url', driveKey, filePath)
  }

  clearRoomHistory(roomId: string): Promise<void> {
    return bareClient.call('session.clearRoomHistory', roomId)
  }

  listRoomSummaries(): Promise<RoomSummary[]> {
    return bareClient.call('session.listRoomSummaries')
  }

  markRoomRead(roomId: string): Promise<void> {
    return bareClient.call('session.markRoomRead', roomId)
  }

  setRoomFavorite(roomId: string, favorite: boolean): Promise<void> {
    return bareClient.call('session.setRoomFavorite', roomId, favorite)
  }

  /** Owner/moderator only — enforced in the room's apply(). */
  updateRoomMeta(roomId: string, opts: { name?: string; avatar?: string; description?: string }): Promise<void> {
    return bareClient.call('session.updateRoomMeta', roomId, opts)
  }

  /** Call after the OS reports a network change (wifi <-> cellular) — see Session.resumeNetwork. */
  resumeNetwork(): Promise<void> {
    return bareClient.call('session.resumeNetwork')
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

  async createRoom(name: string, isPublic = false, avatar = '', description = '', broadcast = false): Promise<RoomProxy> {
    const { roomId } = await bareClient.call<{ roomId: string }>('session.createRoom', name, isPublic, avatar, description, broadcast)
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
