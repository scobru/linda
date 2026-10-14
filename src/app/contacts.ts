// The contact book: who we have asked, who asked us, and the 1:1 rooms behind accepted contacts.
// Split out of `Session`, which supplies what it cannot do on its own through `ContactHost`.
import b4a from 'b4a'
import type { Room } from '../rooms/room.js'
import type { PeerConnection } from '../network/swarm.js'
import type { ContactRequestMessage } from '../network/encoding.js'
import { ProfileStore, type ContactEntry, type RoomBookmark } from './profile-store.js'

export interface ContactHost {
  readonly identityId: string
  readonly nickname: string
  readonly avatar: string
  readonly peers: ReadonlyMap<string, PeerConnection>
  readonly rooms: ReadonlyMap<string, Room>
  readonly bookmarks: ReadonlyMap<string, RoomBookmark>
  readonly invites: ReadonlyMap<string, { code: string }>
  readonly peerAvatars: Map<string, string>
  readonly peerNicknames: ReadonlyMap<string, string>
  readonly profileStore: ProfileStore
  onContactsChange(): void
  createRoom(name: string, isPublic?: boolean, avatar?: string): Promise<Room>
  joinRoomByKey(name: string, invite: string): Promise<Room>
  inviteLinkFor(roomId: string): string
  saveBookmark(bookmark: RoomBookmark): Promise<void>
  listBookmarks(): RoomBookmark[]
  deleteRoom(roomId: string): Promise<void>
}

export class ContactBook {
  private readonly map = new Map<string, ContactEntry>()

  constructor(private readonly host: ContactHost) {}

  get(userId: string): ContactEntry | undefined { return this.map.get(userId) }
  has(userId: string): boolean { return this.map.has(userId) }
  set(userId: string, contact: ContactEntry): void { this.map.set(userId, contact) }
  delete(userId: string): boolean { return this.map.delete(userId) }

  listContacts(): ContactEntry[] {
    return [...this.map.values()].filter((c) => c.status !== 'declined')
  }

  async sendContactRequest(userId: string, nickname: string): Promise<boolean> {
    const existing = this.map.get(userId)
    // They already asked us: accepting is what the user means here, and firing a competing
    // request instead would have both sides create a room the other never joins.
    if (existing?.status === 'incoming') {
      await this.respondToContact(userId, true)
      return true
    }
    const peer = this.host.peers.get(userId)
    if (!peer) return false
    peer.rpc.sendContactRequest({ fromId: this.host.identityId, nickname: this.host.nickname, avatar: this.host.avatar })
    const contact: ContactEntry = { userId, nickname, status: 'outgoing', avatar: this.host.peerAvatars.get(userId) }
    this.map.set(userId, contact)
    void this.host.profileStore.saveContact(contact)
    return true
  }

  /**
   * Creates the room behind a contact link and returns its `bootstrapKey:inviteCode`. The room is
   * a placeholder until someone opens the link — see `claimContactInvite`.
   *
   * Contact requests need the other person online *right now* (`sendContactRequest` gives up
   * without a live peer) and can only be sent from a room you already share, which leaves two
   * strangers with no way to reach each other at all. A link works while they are offline and
   * travels through any other app.
   */
  async createContactInvite(): Promise<{ key: string; roomId: string }> {
    const room = await this.host.createRoom(this.uniqueRoomName('New direct chat'), false)
    const bookmark = this.host.bookmarks.get(room.id)
    if (bookmark) await this.host.saveBookmark({ ...bookmark, contactInvite: true })
    return { key: this.host.inviteLinkFor(room.id), roomId: room.id }
  }

  /** Joins the room a contact link points at and records its issuer as an accepted contact. */
  async acceptContactInvite(invite: { from: string; name: string; key: string }): Promise<Room> {
    if (invite.from === this.host.identityId) throw new Error('That is your own contact link')
    const nickname = invite.name || invite.from.slice(0, 8)
    const room = await this.host.joinRoomByKey(this.uniqueRoomName(nickname), invite.key)
    const contact: ContactEntry = {
      userId: invite.from,
      nickname,
      status: 'accepted',
      roomId: room.id,
      avatar: this.host.peerAvatars.get(invite.from)
    }
    this.map.set(invite.from, contact)
    await this.host.profileStore.saveContact(contact)
    this.host.onContactsChange()
    return room
  }

  /**
   * The other half of `createContactInvite`, run on the issuer when someone asks to write to the
   * placeholder room. That request is the first and only proof of who took the link up.
   *
   * Only the first claimant binds: the link doubles as an ordinary room invite, so a second joiner
   * would otherwise overwrite the contact and quietly repoint it at a room now holding three people.
   */
  async claimContactInvite(roomId: string, identityId: string): Promise<void> {
    const bookmark = this.host.bookmarks.get(roomId)
    if (!bookmark?.contactInvite || identityId === this.host.identityId) return
    const nickname = this.host.peerNicknames.get(identityId) || identityId.slice(0, 8)
    const contact: ContactEntry = {
      userId: identityId,
      nickname,
      status: 'accepted',
      roomId,
      avatar: this.host.peerAvatars.get(identityId)
    }
    this.map.set(identityId, contact)
    await this.host.profileStore.saveContact(contact)
    await this.host.saveBookmark({ ...bookmark, name: this.uniqueRoomName(nickname), contactInvite: undefined })
    this.host.onContactsChange()
  }

  /** Replaces the placeholder name a link-bound contact starts with once presence reveals the real one. */
  async adoptPeerNickname(userId: string, nickname: string): Promise<void> {
    const contact = this.map.get(userId)
    if (!contact || contact.nickname === nickname) return
    if (contact.nickname !== userId.slice(0, 8)) return
    const updated: ContactEntry = { ...contact, nickname }
    this.map.set(userId, updated)
    await this.host.profileStore.saveContact(updated)
    this.host.onContactsChange()
  }

  async respondToContact(userId: string, accept: boolean): Promise<void> {
    const contact = this.map.get(userId)
    if (!contact || contact.status !== 'incoming') return
    if (!accept) {
      const declined: ContactEntry = { ...contact, status: 'declined', pendingResponse: { accepted: false, roomId: '', name: '', bootstrapKey: '', inviteCode: '' } }
      this.map.set(userId, declined)
      await this.host.profileStore.saveContact(declined)
      this.deliverContactResponse(declined)
      this.host.onContactsChange()
      return
    }
    // Never let room creation abort the accept: `createRoom` rejects a blank or already-used
    // name, and a peer with no nickname set — or a second room already named after them — is
    // exactly the case that used to throw here and leave both sides desynced.
    const room = await this.host.createRoom(this.uniqueRoomName(contact.nickname || userId.slice(0, 8)), false, contact.avatar)
    const updated: ContactEntry = {
      ...contact,
      status: 'accepted',
      roomId: room.id,
      pendingResponse: {
        accepted: true,
        roomId: room.id,
        name: this.host.nickname,
        bootstrapKey: b4a.toString(room.bootstrapKey, 'hex'),
        inviteCode: this.host.invites.get(room.id)?.code ?? ''
      }
    }
    this.map.set(userId, updated)
    await this.host.profileStore.saveContact(updated)
    this.deliverContactResponse(updated)
    this.host.onContactsChange()
  }

  /** `createRoom` throws on a blank or duplicate name; contact nicknames are neither unique nor
   * guaranteed non-empty, so derive one that always passes. */
  private uniqueRoomName(base: string): string {
    const trimmed = base.trim() || 'Contact'
    const taken = new Set(this.host.listBookmarks().map((b) => b.name.trim().toLowerCase()))
    if (!taken.has(trimmed.toLowerCase())) return trimmed
    for (let i = 2; ; i++) {
      const candidate = `${trimmed} (${i})`
      if (!taken.has(candidate.toLowerCase())) return candidate
    }
  }

  /**
   * Hands a contact response to the peer if it's reachable right now. Delivery isn't acked, so
   * the pending copy is dropped once written and the peer's own re-sent request (it keeps
   * re-sending while stuck on 'outgoing') is what recovers a response lost in flight.
   */
  private deliverContactResponse(contact: ContactEntry): void {
    const pending = contact.pendingResponse
    if (!pending) return
    const peer = this.host.peers.get(contact.userId)
    if (!peer) return
    peer.rpc.sendContactResponse({
      fromId: this.host.identityId,
      accepted: pending.accepted,
      roomId: pending.roomId,
      name: pending.name,
      bootstrapKey: pending.bootstrapKey,
      inviteCode: pending.inviteCode,
      avatar: this.host.avatar
    })
    if (!pending.accepted) {
      this.map.delete(contact.userId)
      void this.host.profileStore.removeContact(contact.userId)
      return
    }
    const cleared: ContactEntry = { ...contact, pendingResponse: undefined }
    this.map.set(contact.userId, cleared)
    void this.host.profileStore.saveContact(cleared)
  }

  /** Contact handshakes are fire-and-forget over a live socket, and mobile peers drop off
   * whenever the app backgrounds — replay whatever is still owed to this peer now it's back. */
  flushPendingContacts(peer: PeerConnection): void {
    const contact = this.map.get(b4a.toString(peer.remotePublicKey, 'hex'))
    if (!contact) return
    if (contact.pendingResponse) {
      this.deliverContactResponse(contact)
      return
    }
    if (contact.status === 'outgoing') {
      peer.rpc.sendContactRequest({ fromId: this.host.identityId, nickname: this.host.nickname, avatar: this.host.avatar })
    }
  }

  async deleteContact(userId: string): Promise<void> {
    const contact = this.map.get(userId)
    this.map.delete(userId)
    await this.host.profileStore.removeContact(userId)
    if (contact?.roomId) await this.host.deleteRoom(contact.roomId)
  }

  handleRequest(message: ContactRequestMessage): void {
    if (message.avatar && message.avatar.length <= ProfileStore.MAX_AVATAR_BYTES) {
      this.host.peerAvatars.set(message.fromId, message.avatar)
      void this.host.profileStore.setPeerAvatar(message.fromId, message.avatar)
    }
    const existing = this.map.get(message.fromId)

    // Peers re-send their request on every reconnect while it's unanswered (see
    // flushPendingContacts), so a request from someone we already accepted means our
    // acceptance never landed — or they lost it. We're the room owner (accepting is what
    // creates the room), so re-issue the same acceptance instead of ignoring them, which
    // used to leave them stuck on 'outgoing' forever with no way back.
    if (existing?.status === 'accepted') {
      const room = existing.roomId ? this.host.rooms.get(existing.roomId) : undefined
      if (room && room.isOwner(this.host.identityId)) {
        this.deliverContactResponse({
          ...existing,
          pendingResponse: {
            accepted: true,
            roomId: room.id,
            name: this.host.nickname,
            bootstrapKey: b4a.toString(room.bootstrapKey, 'hex'),
            inviteCode: this.host.invites.get(room.id)?.code ?? ''
          }
        })
        return
      }
      // Their side is gone: they removed us (which purges their copy of the room) and asked
      // again. We can't re-admit them to a room we don't own — only its owner can grant write
      // access, and if they owned it, it died with their copy. Returning here left them stuck
      // on 'outgoing' for good, so fall through and treat this as a fresh request instead:
      // accepting creates a new room we own, which is the only room either of us can still use.
    }

    // Crossed requests: we each asked the other before either answer arrived. Both sides
    // accepting would create two separate rooms, neither of which the other joins — so
    // tie-break on identity id, lower id accepts and the higher one keeps waiting.
    if (existing?.status === 'outgoing' && this.host.identityId > message.fromId) return

    const incoming: ContactEntry = { userId: message.fromId, nickname: message.nickname, status: 'incoming', avatar: message.avatar }
    this.map.set(message.fromId, incoming)
    void this.host.profileStore.saveContact(incoming)
    this.host.onContactsChange()
    if (existing?.status === 'outgoing') {
      void this.respondToContact(message.fromId, true).catch((err) => {
        console.warn('[session] auto-accept on crossed contact requests failed:', (err as Error).message)
      })
    }
  }
}
