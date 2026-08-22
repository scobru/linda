import type Corestore from 'corestore'
import Hyperbee from 'hyperbee'

export interface RoomBookmark {
  id: string
  name: string
  bootstrapKey: string
  avatar?: string
  description?: string
  /** Physical corestore namespace this room's data lives under. Owner-created rooms pick a random namespace before the canonical (bootstrapKey-derived) `id` is known, so it must be persisted separately and reused on reopen — passing `id` instead opens an empty namespace. Absent on old bookmarks / joined rooms, where namespace already equals `id`. */
  storeId?: string
  /** Epoch ms this room was last opened/viewed. A room is unread when its latest message postdates this. Absent = never read. */
  lastReadAt?: number
}


/** A contact response we owe a peer but haven't managed to hand to a live socket yet. */
export interface PendingContactResponse {
  accepted: boolean
  roomId: string
  name: string
  bootstrapKey: string
  inviteCode: string
}

export interface ContactEntry {
  userId: string
  nickname: string
  /** `declined` is a tombstone: hidden from `Session.listContacts()`, kept only until its
   * pending refusal reaches the peer, then dropped. */
  status: 'outgoing' | 'incoming' | 'accepted' | 'declined'
  roomId?: string
  avatar?: string
  pendingResponse?: PendingContactResponse
}

export interface StoredRoomKey {
  roomId: string
  epoch: number
  keyHex: string
}

export interface StoredInviteToken {
  roomId: string
  code: string
  usedCount: number
}

export class ProfileStore {
  private constructor(
    private readonly profile: Hyperbee<string>,
    private readonly bookmarks: Hyperbee<RoomBookmark>,
    private readonly contacts: Hyperbee<ContactEntry>,
    private readonly keys: Hyperbee<StoredRoomKey>,
    private readonly invites: Hyperbee<StoredInviteToken>,
    private readonly peerAvatars: Hyperbee<string>
  ) {}

  static async open(store: Corestore): Promise<ProfileStore> {
    const profile = new Hyperbee<string>(store.get({ name: 'profile' }), { keyEncoding: 'utf-8', valueEncoding: 'json' })
    const bookmarks = new Hyperbee<RoomBookmark>(store.get({ name: 'bookmarks' }), { keyEncoding: 'utf-8', valueEncoding: 'json' })
    const contacts = new Hyperbee<ContactEntry>(store.get({ name: 'contacts' }), { keyEncoding: 'utf-8', valueEncoding: 'json' })
    const keys = new Hyperbee<StoredRoomKey>(store.get({ name: 'room_keys' }), { keyEncoding: 'utf-8', valueEncoding: 'json' })
    const invites = new Hyperbee<StoredInviteToken>(store.get({ name: 'room_invites' }), { keyEncoding: 'utf-8', valueEncoding: 'json' })
    const peerAvatars = new Hyperbee<string>(store.get({ name: 'peer_avatars' }), { keyEncoding: 'utf-8', valueEncoding: 'json' })
    await Promise.all([profile.ready(), bookmarks.ready(), contacts.ready(), keys.ready(), invites.ready(), peerAvatars.ready()])
    return new ProfileStore(profile, bookmarks, contacts, keys, invites, peerAvatars)
  }

  async getNickname(): Promise<string> {
    return (await this.profile.get('nickname'))?.value ?? ''
  }

  async setNickname(nickname: string): Promise<void> {
    await this.profile.put('nickname', nickname)
  }

  async getAvatar(): Promise<string> {
    return (await this.profile.get('avatar'))?.value ?? ''
  }

  async setAvatar(avatar: string): Promise<void> {
    await this.profile.put('avatar', avatar)
  }

  async getPeerAvatar(userId: string): Promise<string> {
    return (await this.peerAvatars.get(userId))?.value ?? ''
  }

  async setPeerAvatar(userId: string, avatar: string): Promise<void> {
    if (!avatar) return
    await this.peerAvatars.put(userId, avatar)
  }

  async listPeerAvatars(): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    for await (const node of this.peerAvatars.createReadStream()) {
      if (node.key && node.value) map.set(node.key, node.value)
    }
    return map
  }

  async listBookmarks(): Promise<RoomBookmark[]> {
    const out: RoomBookmark[] = []
    for await (const node of this.bookmarks.createReadStream()) out.push(node.value)
    return out
  }

  async saveBookmark(bookmark: RoomBookmark): Promise<void> {
    await this.bookmarks.put(bookmark.id, bookmark)
  }

  async removeBookmark(id: string): Promise<void> {
    await this.bookmarks.del(id)
  }

  async listContacts(): Promise<ContactEntry[]> {
    const out: ContactEntry[] = []
    for await (const node of this.contacts.createReadStream()) out.push(node.value)
    return out
  }

  async saveContact(contact: ContactEntry): Promise<void> {
    await this.contacts.put(contact.userId, contact)
  }

  async removeContact(userId: string): Promise<void> {
    await this.contacts.del(userId)
  }

  async saveRoomKey(roomId: string, epoch: number, keyHex: string): Promise<void> {
    await this.keys.put(`${roomId}:${epoch}`, { roomId, epoch, keyHex })
  }

  async getRoomKeys(roomId: string): Promise<StoredRoomKey[]> {
    const out: StoredRoomKey[] = []
    const prefix = `${roomId}:`
    for await (const node of this.keys.createReadStream({ gte: prefix, lt: prefix + '\uffff' })) {
      if (node.value) out.push(node.value)
    }
    return out
  }

  async saveInviteToken(token: StoredInviteToken): Promise<void> {
    await this.invites.put(token.roomId, token)
  }

  async getInviteToken(roomId: string): Promise<StoredInviteToken | null> {
    return (await this.invites.get(roomId))?.value ?? null
  }

  async listInviteTokens(): Promise<StoredInviteToken[]> {
    const out: StoredInviteToken[] = []
    for await (const node of this.invites.createReadStream()) out.push(node.value)
    return out
  }

}
