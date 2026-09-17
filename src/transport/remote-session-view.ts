import b4a from 'b4a'
import type { SessionView, RoomView } from '../app/session-view.js'
import type {
  RoomBookmark,
  ContactEntry
} from '../app/profile-store.js'
import type { PeerConnection } from '../network/swarm.js'
import type { RoomAnnounceMessage, TypingMessage, PresenceMessage, ReadReceiptMessage } from '../network/encoding.js'
import type { ChatMessage } from '../rooms/room.js'
import { RemoteRoomView, type RemoteRoomState } from './remote-room-view.js'
import type { RpcClient } from './rpc-client.js'
import type { CallInfo } from '../call/call-session.js'
import type { MediaFrameMessage } from '../call/call-encoding.js'
import { DEFAULT_AUDIO_CODEC } from '../call/audio-codec.js'

export type NetworkStatus = {
  connections: number
  host: string | null
  port: number
  firewalled: boolean
  publicKey: string
  lanDiscovery: boolean
}

/**
 * The identity as it crosses the pipe. JSON has no `Buffer`, and the `{ type: 'Buffer', data: [] }`
 * shape `JSON.stringify` invents for one is not something to reconstruct by accident — so the keys
 * are hex on the wire and rebuilt explicitly at the other end.
 *
 * This is secret key material travelling to a process the UI itself spawned, over that process's
 * own stdio. It never reaches a socket, and the worker needs it for the same reason the renderer
 * did: it is what signs this device's writes.
 */
export interface WireIdentity {
  id: string
  publicKey: string
  secretKey: string
}

/** What the worker needs to open a session. `createLanDiscovery` is deliberately absent: it is a
 * function, so it cannot cross, and LAN discovery is already unavailable wherever a worker runs
 * (Bare has no `dgram` — see lan-discovery-stub.ts). */
export interface RemoteSessionOpenOptions {
  dhtPort?: number
  /** Test seam, mirroring `SwarmTransport.bootstrap`: without it a worker opened in a test joins
   * the public DHT, which is both slow and exactly the dependency `test/session.test.ts` spins up
   * an in-process testnet to avoid. */
  bootstrap?: Array<{ host: string; port: number }>
}

/**
 * The events the UI subscribes to, in the shape they can actually arrive in from another process.
 *
 * Deliberately not `SessionEvents`: two of its callbacks take payloads that cannot cross a pipe —
 * a live `PeerConnection` and a `Buffer` — and neither is used. Dropping the arguments here says
 * so in the type rather than passing something reconstructed and wrong. A handler written against
 * this satisfies `SessionEvents` too, so the in-process path takes the same object unchanged.
 */
export interface RemoteSessionEvents {
  onTyping?(message: TypingMessage): void
  onPresence?(message: PresenceMessage): void
  onReadReceipt?(message: ReadReceiptMessage): void
  onDirectoryChange?(): void
  onContactsChange?(): void
  onBookmarksChange?(): void
  onPeerConnected?(): void
  onPeerDisconnected?(): void
  onIncomingMessage?(roomId: string, message: ChatMessage): void
  onIncomingCall?(info: CallInfo): void
  onCallStateChange?(info: CallInfo): void
  onCallEnded?(info: CallInfo): void
  onCallRemoteControl?(callId: string, action: string): void
  onCallMediaFrame?(frame: MediaFrameMessage): void
  /** See `SessionEvents.onCallMediaPressure` — the same signal, one process further out. */
  onCallMediaPressure?(wantsMore: boolean): void
}

export interface RemoteSessionInitialState {
  nickname?: string
  avatar?: string
  wallpaper?: string
  appBackground?: string
  bookmarks?: RoomBookmark[]
  contacts?: ContactEntry[]
  directory?: RoomAnnounceMessage[]
  peerAvatars?: [string, string][]
  networkStatus?: NetworkStatus
  inviteLinks?: [string, string][]
  fileStoreKeyHex?: string
}

/**
 * Desktop remote proxy satisfying `SessionView`.
 *
 * Implements the core seam for Pear / worker separation:
 * - Reads are answered synchronously from local mirrors kept up-to-date by pushed worker events.
 * - Operations, room mutations and core requests travel across the duplex RPC stream.
 * - Room instances returned are `RemoteRoomView` proxies.
 */
export class RemoteSessionView implements SessionView {
  peers: Map<string, PeerConnection> = new Map()
  private fileStoreKeyHex = ''

  /** Declared by this side, so held by this side — see `getAudioCodecs`. */
  private audioCodecs: readonly string[] = [DEFAULT_AUDIO_CODEC]
  private nickname = ''
  private avatar = ''
  private wallpaper = ''
  private appBackground = ''
  private bookmarks: RoomBookmark[] = []
  private contacts: ContactEntry[] = []
  private directory: RoomAnnounceMessage[] = []
  private peerAvatars = new Map<string, string>()
  private inviteLinks = new Map<string, string>()
  private networkStatus: NetworkStatus = {
    connections: 0,
    host: null,
    port: 0,
    firewalled: false,
    publicKey: '',
    lanDiscovery: false
  }

  private rooms = new Map<string, RemoteRoomView>()
  private activeCall: CallInfo | null = null

  constructor(
    private readonly rpcClient: RpcClient,
    initialState?: RemoteSessionInitialState,
    private readonly events: RemoteSessionEvents = {}
  ) {
    if (initialState) {
      this.applyInitialState(initialState)
    }

    this.wireEvents()
  }

  private applyInitialState(state: RemoteSessionInitialState): void {
    if (state.nickname !== undefined) this.nickname = state.nickname
    if (state.avatar !== undefined) this.avatar = state.avatar
    if (state.wallpaper !== undefined) this.wallpaper = state.wallpaper
    if (state.appBackground !== undefined) this.appBackground = state.appBackground
    if (state.bookmarks !== undefined) this.bookmarks = state.bookmarks
    if (state.contacts !== undefined) this.contacts = state.contacts
    if (state.directory !== undefined) this.directory = state.directory
    if (state.peerAvatars !== undefined) this.peerAvatars = new Map(state.peerAvatars)
    if (state.inviteLinks !== undefined) this.inviteLinks = new Map(state.inviteLinks)
    if (state.networkStatus !== undefined) this.networkStatus = state.networkStatus
    if (state.fileStoreKeyHex !== undefined) this.fileStoreKeyHex = state.fileStoreKeyHex
  }

  async mediaUrl(driveKeyHex: string, drivePath: string): Promise<string> {
    return this.rpcClient.call<string>('media.url', driveKeyHex, drivePath)
  }

  async fileStore(): Promise<any> {
    const self = this
    return {
      get key(): Buffer {
        return b4a.from(self.fileStoreKeyHex, 'hex')
      },
      addBuffer: async (drivePath: string, buffer: Buffer): Promise<{ path: string; size: number }> => {
        const { result } = await self.rpcClient.callBinary<{ driveKey: string; path: string; size: number }>(
          'files.upload',
          [drivePath],
          new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
        )
        if (result.driveKey && !self.fileStoreKeyHex) {
          self.fileStoreKeyHex = result.driveKey
        }
        return { path: result.path, size: result.size }
      }
    }
  }

  private wireEvents(): void {
    // Two listeners used to sit here that the worker has never sent: `sessionState`, which would
    // have re-applied the whole initial state, and `networkStatus`. Both were harmless — every
    // field of `RemoteSessionInitialState` is kept current either by its own setter writing through
    // before the RPC, or by an event that is genuinely sent (network status rides on
    // `peerConnected`/`peerDisconnected`). A test now holds both of those facts, which is what makes
    // removing them safe rather than hopeful: a listener nobody feeds is silent, not broken, and
    // silent is how it survives long enough for someone to rely on it.

    this.rpcClient.on('bookmarksChange', (bookmarks: RoomBookmark[]) => {
      if (bookmarks) this.bookmarks = bookmarks
    })

    this.rpcClient.on('contactsChange', (contacts: ContactEntry[]) => {
      if (contacts) this.contacts = contacts
    })

    this.rpcClient.on('directoryChange', (directory: RoomAnnounceMessage[]) => {
      if (directory) this.directory = directory
    })

    this.rpcClient.on('peerAvatar', (payload: { userId: string; avatar: string }) => {
      if (payload?.userId) this.peerAvatars.set(payload.userId, payload.avatar)
    })

    // Everything above keeps the mirrors current; everything below is the UI's own subscription,
    // the half that used to have nowhere to arrive. Order matters: the mirror is updated before
    // the listener runs, so a handler that redraws reads the new state, not the previous one.
    this.rpcClient.on('bookmarksChange', () => this.events.onBookmarksChange?.())
    this.rpcClient.on('contactsChange', () => this.events.onContactsChange?.())
    this.rpcClient.on('directoryChange', () => this.events.onDirectoryChange?.())
    this.rpcClient.on('presence', (msg: PresenceMessage) => this.events.onPresence?.(msg))
    this.rpcClient.on('typing', (msg: TypingMessage) => this.events.onTyping?.(msg))
    this.rpcClient.on('readReceipt', (msg: ReadReceiptMessage) => this.events.onReadReceipt?.(msg))
    this.rpcClient.on('incomingMessage', (payload: { roomId: string; message: ChatMessage }) => {
      if (payload) this.events.onIncomingMessage?.(payload.roomId, payload.message)
    })
    this.rpcClient.on('peerConnected', (payload?: { networkStatus?: NetworkStatus }) => {
      if (payload?.networkStatus) this.networkStatus = payload.networkStatus
      this.events.onPeerConnected?.()
    })
    this.rpcClient.on('peerDisconnected', (payload?: { networkStatus?: NetworkStatus }) => {
      if (payload?.networkStatus) this.networkStatus = payload.networkStatus
      this.events.onPeerDisconnected?.()
    })
    this.rpcClient.on('incomingCall', (info: CallInfo) => {
      this.activeCall = info
      this.events.onIncomingCall?.(info)
    })
    this.rpcClient.on('callStateChange', (info: CallInfo) => {
      this.activeCall = info.state === 'ended' ? null : info
      this.events.onCallStateChange?.(info)
    })
    this.rpcClient.on('callEnded', (info: CallInfo) => {
      this.activeCall = null
      this.events.onCallEnded?.(info)
    })
    this.rpcClient.on('callRemoteControl', (payload: { callId: string; action: string }) => {
      this.events.onCallRemoteControl?.(payload.callId, payload.action)
    })
    this.rpcClient.on('callMediaFrame', (frame: MediaFrameMessage) => {
      this.events.onCallMediaFrame?.(frame)
    })
    this.rpcClient.on('callMediaPressure', (payload: { wantsMore: boolean }) => {
      this.events.onCallMediaPressure?.(payload.wantsMore)
    })
  }

  getRoom(roomId: string): RoomView | undefined {
    return this.rooms.get(roomId)
  }

  private getOrCreateRoom(roomId: string, initialState?: Partial<RemoteRoomState>): RemoteRoomView {
    let room = this.rooms.get(roomId)
    if (!room) {
      room = new RemoteRoomView(roomId, this.rpcClient, initialState)
      this.rooms.set(roomId, room)
    } else if (initialState) {
      room.applyState(initialState)
    }
    return room
  }

  async createRoom(
    name: string,
    isPublic = false,
    avatar = '',
    description = '',
    broadcast = false
  ): Promise<RoomView> {
    const res = await this.rpcClient.call<{
      roomId: string
      state?: Partial<RemoteRoomState>
      inviteLink?: string
      bookmarks?: RoomBookmark[]
    }>('session.createRoom', name, isPublic, avatar, description, broadcast)
    if (res.inviteLink) this.inviteLinks.set(res.roomId, res.inviteLink)
    if (res.bookmarks) this.bookmarks = res.bookmarks
    return this.getOrCreateRoom(res.roomId, res.state)
  }

  async ensurePersonalVault(): Promise<RoomView> {
    const res = await this.rpcClient.call<{
      roomId: string
      state?: Partial<RemoteRoomState>
      inviteLink?: string
      bookmarks?: RoomBookmark[]
    }>('session.ensurePersonalVault')
    if (res.inviteLink) this.inviteLinks.set(res.roomId, res.inviteLink)
    if (res.bookmarks) this.bookmarks = res.bookmarks
    return this.getOrCreateRoom(res.roomId, res.state)
  }

  async joinRoomByKey(
    name: string,
    invite: string,
    avatar?: string,
    description?: string
  ): Promise<RoomView> {
    const res = await this.rpcClient.call<{
      roomId: string
      state?: Partial<RemoteRoomState>
      inviteLink?: string
      bookmarks?: RoomBookmark[]
    }>('session.joinRoomByKey', name, invite, avatar, description)
    if (res.inviteLink) this.inviteLinks.set(res.roomId, res.inviteLink)
    if (res.bookmarks) this.bookmarks = res.bookmarks
    return this.getOrCreateRoom(res.roomId, res.state)
  }

  async acceptContactInvite(invite: { from: string; name: string; key: string }): Promise<RoomView> {
    const res = await this.rpcClient.call<{
      roomId: string
      state?: Partial<RemoteRoomState>
      inviteLink?: string
      bookmarks?: RoomBookmark[]
    }>('session.acceptContactInvite', invite)
    if (res.inviteLink) this.inviteLinks.set(res.roomId, res.inviteLink)
    if (res.bookmarks) this.bookmarks = res.bookmarks
    return this.getOrCreateRoom(res.roomId, res.state)
  }

  async reopenBookmarkedRooms(): Promise<RoomView[]> {
    const res = await this.rpcClient.call<
      Array<{ roomId: string; state?: Partial<RemoteRoomState>; inviteLink?: string; bookmarks?: RoomBookmark[] }>
    >('session.reopenBookmarkedRooms')
    if (res[0]?.bookmarks) this.bookmarks = res[0].bookmarks
    return res.map((r) => {
      if (r.inviteLink) this.inviteLinks.set(r.roomId, r.inviteLink)
      return this.getOrCreateRoom(r.roomId, r.state)
    })
  }

  async getPairingSnapshot(): Promise<Record<string, unknown>> {
    return await this.rpcClient.call<Record<string, unknown>>('session.getPairingSnapshot')
  }

  async importPairingSnapshot(snapshot: Record<string, unknown>): Promise<void> {
    await this.rpcClient.call<void>('session.importPairingSnapshot', snapshot)
  }

  async close(): Promise<void> {
    await this.rpcClient.call<void>('session.close')
  }

  async downloadFile(driveKeyHex: string, drivePath: string): Promise<Buffer | null> {
    const { result, binary } = await this.rpcClient.callBinary<{ found: boolean }>(
      'files.download',
      [driveKeyHex, drivePath],
      new Uint8Array(0)
    )
    return result.found ? Buffer.from(binary.buffer, binary.byteOffset, binary.byteLength) : null
  }

  listDirectory(): RoomAnnounceMessage[] {
    return this.directory
  }

  removeFromDirectory(roomId: string): void {
    this.directory = this.directory.filter((d) => d.roomId !== roomId)
    void this.rpcClient.call<void>('session.removeFromDirectory', roomId)
  }

  async findOrphanBlobs(): Promise<Array<{ path: string; bytes: number }>> {
    return this.rpcClient.call<Array<{ path: string; bytes: number }>>('session.findOrphanBlobs')
  }

  async deleteBlobs(blobKeys: string[]): Promise<number> {
    return this.rpcClient.call<number>('session.deleteBlobs', blobKeys)
  }

  getNetworkStatus(): NetworkStatus {
    return this.networkStatus
  }

  broadcastPresence(online = true): void {
    void this.rpcClient.call<void>('session.broadcastPresence', online)
  }

  /** Re-announces on the DHT after a network change. Deliberately awaited by nobody: the caller is
   * a wifi/cellular handoff, not a user action. */
  async resumeNetwork(): Promise<void> {
    await this.rpcClient.call<void>('session.resumeNetwork')
  }

  sendTyping(roomId: string, userId: string, typing: boolean): void {
    void this.rpcClient.call<void>('session.sendTyping', roomId, userId, typing)
  }

  sendReadReceipt(roomId: string, userId: string, messageId: string): void {
    void this.rpcClient.call<void>('session.sendReadReceipt', roomId, userId, messageId)
  }

  /**
   * What this shell told the worker it can speak.
   *
   * Answered locally rather than fetched, because this side is the one that declared it: the media
   * pipeline whose capability this describes runs here, not in the worker. Starts at the floor, so
   * a call placed before the capability probe finishes negotiates something that certainly works.
   */
  getAudioCodecs(): readonly string[] {
    return this.audioCodecs
  }

  setAudioCodecs(codecs: readonly string[]): void {
    this.audioCodecs = [...codecs]
    void this.rpcClient.call<void>('session.setAudioCodecs', this.audioCodecs)
  }

  getNickname(): string {
    return this.nickname
  }

  async setNickname(nickname: string): Promise<void> {
    this.nickname = nickname
    await this.rpcClient.call<void>('session.setNickname', nickname)
  }

  getAvatar(): string {
    return this.avatar
  }

  async setAvatar(avatar: string): Promise<void> {
    this.avatar = avatar
    await this.rpcClient.call<void>('session.setAvatar', avatar)
  }

  getPeerAvatar(userId: string): string {
    return this.peerAvatars.get(userId) || ''
  }

  listPeerAvatars(): Map<string, string> {
    return new Map(this.peerAvatars)
  }

  getWallpaper(): string {
    return this.wallpaper
  }

  async setWallpaper(wallpaperId: string): Promise<void> {
    this.wallpaper = wallpaperId
    await this.rpcClient.call<void>('session.setWallpaper', wallpaperId)
  }

  getAppBackground(): string {
    return this.appBackground
  }

  async setAppBackground(backgroundId: string): Promise<void> {
    this.appBackground = backgroundId
    await this.rpcClient.call<void>('session.setAppBackground', backgroundId)
  }

  listBookmarks(): RoomBookmark[] {
    return this.bookmarks
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.rooms.delete(roomId)
    this.bookmarks = this.bookmarks.filter((b) => b.id !== roomId)
    this.inviteLinks.delete(roomId)
    const res = await this.rpcClient.call<{ bookmarks?: RoomBookmark[] }>('session.deleteRoom', roomId)
    if (res?.bookmarks) this.bookmarks = res.bookmarks
  }

  markRoomRead(roomId: string): void {
    const bm = this.bookmarks.find((b) => b.id === roomId)
    if (bm) bm.lastReadAt = Date.now()
    void this.rpcClient.call<void>('session.markRoomRead', roomId)
  }

  isRoomFavorite(roomId: string): boolean {
    return this.bookmarks.find((b) => b.id === roomId)?.favorite ?? false
  }

  async setRoomFavorite(roomId: string, favorite: boolean): Promise<void> {
    const bm = this.bookmarks.find((b) => b.id === roomId)
    if (bm) bm.favorite = favorite
    const res = await this.rpcClient.call<{ bookmarks?: RoomBookmark[] }>(
      'session.setRoomFavorite',
      roomId,
      favorite
    )
    if (res?.bookmarks) this.bookmarks = res.bookmarks
  }

  async setRoomBroadcast(roomId: string, broadcast: boolean): Promise<void> {
    const room = this.rooms.get(roomId)
    if (room) room.isBroadcast = broadcast
    await this.rpcClient.call<void>('session.setRoomBroadcast', roomId, broadcast)
  }

  async updateRoomMeta(
    roomId: string,
    opts: { name?: string; avatar?: string; description?: string }
  ): Promise<void> {
    const bm = this.bookmarks.find((b) => b.id === roomId)
    if (bm) {
      if (opts.name !== undefined) bm.name = opts.name
      if (opts.avatar !== undefined) bm.avatar = opts.avatar
      if (opts.description !== undefined) bm.description = opts.description
    }
    const room = this.rooms.get(roomId)
    if (room) {
      if (opts.avatar !== undefined) room.avatar = opts.avatar
      if (opts.description !== undefined) room.description = opts.description
    }
    const res = await this.rpcClient.call<{ bookmarks?: RoomBookmark[] }>(
      'session.updateRoomMeta',
      roomId,
      opts
    )
    if (res?.bookmarks) this.bookmarks = res.bookmarks
  }

  clearRoomHistory(roomId: string): void {
    const bm = this.bookmarks.find((b) => b.id === roomId)
    if (bm) bm.clearedAt = Date.now()
    void this.rpcClient.call<void>('session.clearRoomHistory', roomId)
  }

  restoreRoomHistory(roomId: string): void {
    const bm = this.bookmarks.find((b) => b.id === roomId)
    if (bm) delete bm.clearedAt
    void this.rpcClient.call<void>('session.restoreRoomHistory', roomId)
  }

  async deleteMessage(roomId: string, messageId: string): Promise<void> {
    await this.rpcClient.call<void>('session.deleteMessage', roomId, messageId)
  }

  inviteLinkFor(roomId: string): string {
    return this.inviteLinks.get(roomId) || ''
  }

  regenerateInvite(roomId: string): string {
    const link = this.inviteLinks.get(roomId) || ''
    void this.rpcClient.call<{ inviteLink: string }>('session.regenerateInvite', roomId).then((res) => {
      if (res?.inviteLink) this.inviteLinks.set(roomId, res.inviteLink)
    })
    return link
  }

  listContacts(): ContactEntry[] {
    return this.contacts
  }

  async deleteContact(userId: string): Promise<void> {
    this.contacts = this.contacts.filter((c) => c.userId !== userId)
    await this.rpcClient.call<void>('session.deleteContact', userId)
  }

  async sendContactRequest(userId: string, nickname: string): Promise<boolean> {
    return this.rpcClient.call<boolean>('session.sendContactRequest', userId, nickname)
  }

  async respondToContact(userId: string, accept: boolean): Promise<void> {
    await this.rpcClient.call<void>('session.respondToContact', userId, accept)
  }

  async createContactInvite(): Promise<{ key: string; roomId: string }> {
    const res = await this.rpcClient.call<{ key: string; roomId: string }>(
      'session.createContactInvite'
    )
    if (res?.key) this.inviteLinks.set(res.roomId, res.key)
    return res
  }

  async muteMember(roomId: string, identityId: string): Promise<void> {
    await this.rpcClient.call<void>('session.muteMember', roomId, identityId)
  }

  async unmuteMember(roomId: string, identityId: string): Promise<void> {
    await this.rpcClient.call<void>('session.unmuteMember', roomId, identityId)
  }

  async banMember(roomId: string, writerKeyHex: string, identityId: string): Promise<void> {
    await this.rpcClient.call<void>('session.banMember', roomId, writerKeyHex, identityId)
  }

  async unbanMember(roomId: string, identityId: string): Promise<void> {
    await this.rpcClient.call<void>('session.unbanMember', roomId, identityId)
  }

  async promoteToModerator(roomId: string, identityId: string): Promise<void> {
    await this.rpcClient.call<void>('session.promoteToModerator', roomId, identityId)
  }

  async demoteModerator(roomId: string, identityId: string): Promise<void> {
    await this.rpcClient.call<void>('session.demoteModerator', roomId, identityId)
  }

  async promoteToAdmin(roomId: string, identityId: string): Promise<void> {
    await this.rpcClient.call<void>('session.promoteToAdmin', roomId, identityId)
  }

  async demoteAdmin(roomId: string, identityId: string): Promise<void> {
    await this.rpcClient.call<void>('session.demoteAdmin', roomId, identityId)
  }

  // ── Call Management ───────────────────────────────────────────────────────

  async startCall(peerId: string, roomId: string, media: { audio: boolean; video: boolean }): Promise<CallInfo> {
    const info = await this.rpcClient.call<CallInfo>('session.startCall', peerId, roomId, media)
    this.activeCall = info
    return info
  }

  async answerCall(callId: string, accept: boolean): Promise<void> {
    await this.rpcClient.call<void>('session.answerCall', callId, accept)
  }

  async endCall(callId?: string): Promise<void> {
    await this.rpcClient.call<void>('session.endCall', callId)
    if (!callId || this.activeCall?.callId === callId) {
      this.activeCall = null
    }
  }

  getActiveCall(): CallInfo | null {
    return this.activeCall
  }

  sendCallControl(action: string): void {
    void this.rpcClient.call<void>('session.sendCallControl', action)
  }

  sendCallFrame(frame: MediaFrameMessage): void {
    // The payload goes in the frame's binary tail, not through the JSON header — see
    // `WorkerDispatcher.pushEvent` for what JSON does to a `Uint8Array`.
    const { payload, ...rest } = frame
    void this.rpcClient.callBinary<void>('session.sendCallFrame', [rest], payload)
  }
}

// Guarantee at compile time that RemoteSessionView satisfies SessionView
const _satisfiesSessionView: (session: RemoteSessionView) => SessionView = (session) => session
void _satisfiesSessionView
