import path from 'node:path'
import fs from 'node:fs'
import type { Readable } from 'node:stream'
import Corestore, { type HyperCore } from 'corestore'
import Hyperdrive from 'hyperdrive'
import hypercoreCrypto from 'hypercore-crypto'
import type Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import type { Identity } from '../identity/index.js'
import { loadProfile } from '../identity/profile.js'
import { createSwarm, joinRoom, type PeerConnection } from '../network/swarm.js'
import type { TypingMessage, PresenceMessage, ReadReceiptMessage, RoomAnnounceMessage, ContactRequestMessage, ContactResponseMessage } from '../network/encoding.js'
import { LOBBY_TOPIC } from '../network/lobby.js'
import { Room, type ChatMessage } from '../rooms/room.js'
import { FileStore } from '../files/drive.js'
import { randomId } from '../util/id.js'
import { ProfileStore, type RoomBookmark, type ContactEntry } from './profile-store.js'

export type { RoomBookmark, ContactEntry }

export interface SessionEvents {
  onTyping?(message: TypingMessage): void
  onPresence?(message: PresenceMessage): void
  onReadReceipt?(message: ReadReceiptMessage): void
  onDirectoryChange?(): void
  onContactsChange?(): void
  onBookmarksChange?(): void
  onPeerConnected?(peer: PeerConnection): void
  onPeerDisconnected?(publicKey: Buffer): void
  onIncomingMessage?(roomId: string, message: ChatMessage): void
}

/** Drive paths are absolute; callers hand us both shapes. */
function drivePath(filePath: string): string {
  return filePath.startsWith('/') ? filePath : `/${filePath}`
}

const BOOKMARKS_FILE = 'rooms.json'
const DIRECTORY_FILE = 'directory.json'
const CONTACTS_FILE = 'contacts.json'
const PROFILE_FILE = 'profile.json'

/** How long a first join waits for some peer to serve the room before giving up. Generous because
 * a DHT hole-punch to a phone can take a while, and the alternative is a spurious failure. */
const JOIN_REPLICATION_TIMEOUT_MS = 45_000

/** Hard ceiling on one `Room.open`. The retry loop only advances when open resolves or throws, so
 * a room whose storage was left half-purged — open hanging instead of failing — stalled the whole
 * startup batch behind it, and with it the app's unlock. */
const ROOM_OPEN_TIMEOUT_MS = 20_000

/** How often a room still waiting on write access re-asks the owner. */
const WRITE_REQUEST_RETRY_MS = 15_000

interface CoreDeleteStorage {
  store: { deleteCore(ptr: unknown): Promise<void> }
  core: unknown
}

/** Access-control token gating write grants for a room; owner-held, in-memory only (lost on restart — reissued invite links must be re-shared, which is fine since it's the "revoke a leaked link" path anyway). */
interface InviteToken {
  code: string
  usedCount: number
}

/**
 * hypercore@11.35.1's own `Hypercore.purge()` is broken upstream (calls
 * `this._closeAllSessions`, which doesn't exist — should be `closeAllSessions`
 * on `this.core` — then `this.core.purge()`, which doesn't exist either;
 * confirmed identical on holepunchto/hypercore main, not version-specific).
 * This mirrors what hypercore's own `lib/audit.js` does to actually delete a
 * core's on-disk data, reaching past the broken public wrapper.
 */
async function purgeCore(core: HyperCore): Promise<void> {
  const internal = core as unknown as { close(): Promise<void>; core: { state: { storage: CoreDeleteStorage } } }
  const storage = internal.core.state.storage
  await internal.close()
  await storage.store.deleteCore(storage.core)
}

export class Session {
  readonly identity: Identity
  readonly peers = new Map<string, PeerConnection>()

  private readonly storageDir: string
  private readonly store: Corestore
  private readonly profileStore: ProfileStore
  private readonly swarm: Hyperswarm
  private readonly rooms = new Map<string, Room>()
  private readonly directory = new Map<string, RoomAnnounceMessage>()
  private readonly contacts = new Map<string, ContactEntry>()
  private readonly bookmarks = new Map<string, RoomBookmark>()
  private readonly invites = new Map<string, InviteToken>()
  private readonly pendingInviteCodes = new Map<string, string>()
  private readonly joiningContactRooms = new Set<string>()
  private fileStoreInstance: FileStore | null = null
  /** Foreign drives we download from, keyed by hex drive key — see `remoteDrive`. */
  private readonly remoteDrives = new Map<string, Promise<Hyperdrive>>()
  private nickname = ''
  private avatar = ''
  private wallpaper = ''
  private readonly peerAvatars = new Map<string, string>()
  private readonly peerNicknames = new Map<string, string>()
  private writeRequestTimer: ReturnType<typeof setInterval> | null = null
  private readonly events: SessionEvents

  private constructor(identity: Identity, storageDir: string, store: Corestore, profileStore: ProfileStore, events: SessionEvents, dhtPort?: number) {
    this.identity = identity
    this.storageDir = storageDir
    this.store = store
    this.profileStore = profileStore
    this.events = events
    for (const announce of this.loadDirectory()) this.directory.set(announce.roomId, announce)

    this.swarm = createSwarm(identity, {
      onTyping: events.onTyping,
      onPresence: (message) => {
        if (message.avatar) {
          this.peerAvatars.set(message.userId, message.avatar)
          void this.profileStore.setPeerAvatar(message.userId, message.avatar)
        }
        if (message.nickname) {
          this.peerNicknames.set(message.userId, message.nickname)
          // A contact bound from a link starts with a placeholder name, because the join gives us
          // an identity id and nothing else. Presence is where the real name shows up.
          void this.adoptPeerNickname(message.userId, message.nickname)
        }
        events.onPresence?.(message)
      },
      onReadReceipt: events.onReadReceipt,
      onRequestWrite: (message, channel) => {
        const room = [...this.rooms.values()].find((r) => b4a.toString(r.bootstrapKey, 'hex') === message.bootstrapKey)
        if (!room || !room.writable || !room.isOwner(identity.id)) return
        if (room.isBanned(message.identityId)) return
        // Two separate questions, and conflating them locked returning members out. A known
        // identity needs no invite code to be let back in — but if it comes back on a writer key
        // the room has never seen (it purged its copy and reopened, or it's a second device), that
        // key still has to be added, or the peer reads the room fine and can never post to it.
        const isKnownIdentity = room.listMembers().some((m) => m.identityId === message.identityId)
        if (!isKnownIdentity && !this.redeemInvite(room.id, message.inviteCode)) return
        const isExistingWriter = room.listMembers().some((m) => m.writerKey === message.writerKey)
        void (async () => {
          if (!isExistingWriter) {
            await room.addWriter(b4a.from(message.writerKey, 'hex'), message.identityId)
          }
          await this.claimContactInvite(room.id, message.identityId)
          const keyHex = room.currentKeyHex
          if (keyHex) channel.sendRoomKey({ roomId: room.id, epoch: room.keyEpoch, key: keyHex })
        })()
      },
      onRoomKey: (message) => {
        let room = this.rooms.get(message.roomId)
        if (!room) {
          room = [...this.rooms.values()].find((r) => 
            r.id === message.roomId || 
            b4a.toString(r.bootstrapKey, 'hex').startsWith(message.roomId) || 
            b4a.toString(r.bootstrapKey, 'hex') === message.roomId
          )
        }
        room?.receiveKey(message.epoch, message.key)
        if (room) void this.profileStore.saveRoomKey(room.id, message.epoch, message.key)
      },
      onRoomAnnounce: (message) => {
        const announce: RoomAnnounceMessage = {
          roomId: message.roomId,
          name: message.name,
          bootstrapKey: message.bootstrapKey,
          authorId: message.authorId ?? '',
          inviteCode: message.inviteCode ?? '',
          avatar: message.avatar ?? '',
          description: message.description ?? ''
        }
        for (const [id, a] of this.directory.entries()) {
          if (a.bootstrapKey === message.bootstrapKey) {
            this.directory.delete(id)
          }
        }
        this.directory.set(announce.roomId, announce)
        this.saveDirectory()
        events.onDirectoryChange?.()
      },
      onContactRequest: (message) => {
        if (message.avatar) {
          this.peerAvatars.set(message.fromId, message.avatar)
          void this.profileStore.setPeerAvatar(message.fromId, message.avatar)
        }
        const existing = this.contacts.get(message.fromId)

        // Peers re-send their request on every reconnect while it's unanswered (see
        // flushPendingContacts), so a request from someone we already accepted means our
        // acceptance never landed — or they lost it. We're the room owner (accepting is what
        // creates the room), so re-issue the same acceptance instead of ignoring them, which
        // used to leave them stuck on 'outgoing' forever with no way back.
        if (existing?.status === 'accepted') {
          const room = existing.roomId ? this.rooms.get(existing.roomId) : undefined
          if (room && room.isOwner(this.identity.id)) {
            this.deliverContactResponse({
              ...existing,
              pendingResponse: {
                accepted: true,
                roomId: room.id,
                name: this.nickname,
                bootstrapKey: b4a.toString(room.bootstrapKey, 'hex'),
                inviteCode: this.invites.get(room.id)?.code ?? ''
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
        if (existing?.status === 'outgoing' && this.identity.id > message.fromId) return

        const incoming: ContactEntry = { userId: message.fromId, nickname: message.nickname, status: 'incoming', avatar: message.avatar }
        this.contacts.set(message.fromId, incoming)
        void this.profileStore.saveContact(incoming)
        events.onContactsChange?.()
        if (existing?.status === 'outgoing') {
          void this.respondToContact(message.fromId, true).catch((err) => {
            console.warn('[session] auto-accept on crossed contact requests failed:', (err as Error).message)
          })
        }
      },
      onContactResponse: (message) => {
        const contact = this.contacts.get(message.fromId)
        // 'incoming' is reachable too: our own request crossed theirs and the tie-break made
        // them the accepter, leaving our local entry flipped to incoming.
        if (!contact || (contact.status !== 'outgoing' && contact.status !== 'incoming')) return
        if (!message.accepted) {
          this.contacts.delete(message.fromId)
          void this.profileStore.removeContact(message.fromId)
          events.onContactsChange?.()
          return
        }
        // An acceptance is re-sent whenever our request is re-sent (unacked, fire-and-forget),
        // so the same response can land twice — never open the room twice for it.
        if (this.joiningContactRooms.has(message.roomId)) return
        this.joiningContactRooms.add(message.roomId)
        void (async () => {
          try {
            const roomName = message.name || contact.nickname || message.fromId.slice(0, 8)
            let room = this.rooms.get(message.roomId)
            let storeId: string | undefined
            if (!room) {
              const initialKeys = await this.profileStore.getRoomKeys(message.roomId)
              // Fresh namespace, for the same reason as joinRoomByKey: reusing the room id as the
              // namespace regenerates the writer key we had before, which after a leave-and-purge
              // is a key the log already knows and nobody can re-grant.
              storeId = randomId(8)
              room = await Room.open(this.store, message.roomId, b4a.from(message.bootstrapKey, 'hex'), this.identity.id, initialKeys, storeId)
              this.setupRoomKeyPersistence(room)
              this.pendingInviteCodes.set(room.id, message.inviteCode)
              await this.joinTopic(room)
              this.trackRoom(room)
            }
            // Hyperswarm reuses the existing socket to this peer (already connected via a shared
            // room/lobby topic), so `onConnection` won't re-fire for this brand-new room's topic —
            // request write access explicitly instead of waiting for a connection event that never comes.
            for (const peer of this.peers.values()) this.requestWriteIfNeeded(room, peer)
            await this.saveBookmark({ id: room.id, name: roomName, bootstrapKey: message.bootstrapKey, avatar: message.avatar || contact.avatar, storeId })
            const updated: ContactEntry = { ...contact, nickname: roomName, status: 'accepted', roomId: room.id, avatar: message.avatar || contact.avatar, pendingResponse: undefined }
            this.contacts.set(message.fromId, updated)
            if (message.avatar) {
              this.peerAvatars.set(message.fromId, message.avatar)
              void this.profileStore.setPeerAvatar(message.fromId, message.avatar)
            }
            await this.profileStore.saveContact(updated)
            events.onContactsChange?.()
          } catch (err) {
            // Leaving the contact on 'outgoing' is the recoverable state: we re-send the request
            // on the next reconnect and the peer re-issues its acceptance.
            console.warn('[session] joining contact room failed:', (err as Error).message)
          } finally {
            this.joiningContactRooms.delete(message.roomId)
          }
        })()
      },
      onConnection: (peer) => {
        this.store.replicate(peer.socket)
        this.peers.set(b4a.toString(peer.remotePublicKey, 'hex'), peer)
        peer.rpc.sendPresence({ userId: this.identity.id, online: true, nickname: this.nickname, avatar: this.avatar })
        for (const announce of this.directory.values()) peer.rpc.sendRoomAnnounce(announce)
        for (const room of this.rooms.values()) {
          this.requestWriteIfNeeded(room, peer)
          this.syncKeyIfOwner(room, peer)
        }
        this.flushPendingContacts(peer)
        events.onPeerConnected?.(peer)
      },
      onDisconnection: (publicKey) => {
        this.peers.delete(b4a.toString(publicKey, 'hex'))
        events.onPeerDisconnected?.(publicKey)
      }
    }, dhtPort)

    this.trackDiscovery(LOBBY_TOPIC)
  }

  private setupRoomKeyPersistence(room: Room): void {
    room.onKeyChange((epoch, keyHex) => {
      void this.profileStore.saveRoomKey(room.id, epoch, keyHex)
    })
    const initialKeyHex = room.currentKeyHex
    if (initialKeyHex) {
      void this.profileStore.saveRoomKey(room.id, room.keyEpoch, initialKeyHex)
    }
  }

  /** `dhtPort` pins the swarm's UDP socket — see `createSwarm`; the UI surfaces it as the
   * VPN port-forwarding setting on the network status page. */
  static async create(identity: Identity, storageDir: string, events: SessionEvents = {}, dhtPort?: number): Promise<Session> {
    const storePath = path.join(storageDir, 'store')
    const store = fs.existsSync(storePath)
      ? new Corestore(storePath)
      : new Corestore(storePath, { primaryKey: hypercoreCrypto.hash(identity.secretKey), unsafe: true })
    const profileStore = await ProfileStore.open(store)
    const session = new Session(identity, storageDir, store, profileStore, events, dhtPort)
    await session.migrateJsonIfNeeded()
    for (const bookmark of await profileStore.listBookmarks()) session.bookmarks.set(bookmark.id, bookmark)
    // Self-heal directory entries orphaned by leaving/deleting a room you announced yourself,
    // from before deleteRoom() retracted its own announce on the way out.
    let prunedDirectory = false
    for (const [roomId, announce] of session.directory) {
      if (announce.authorId === identity.id && !session.bookmarks.has(roomId)) {
        session.directory.delete(roomId)
        prunedDirectory = true
      }
    }
    if (prunedDirectory) session.saveDirectory()
    for (const contact of await profileStore.listContacts()) session.contacts.set(contact.userId, contact)
    for (const token of await profileStore.listInviteTokens()) {
      session.invites.set(token.roomId, {
        code: token.code,
        usedCount: token.usedCount
      })
    }
    session.startWriteRequestRetry()
    session.wallpaper = await profileStore.getWallpaper()
    session.nickname = await profileStore.getNickname()
    session.avatar = await profileStore.getAvatar()
    for (const [uid, av] of await profileStore.listPeerAvatars()) {
      session.peerAvatars.set(uid, av)
    }
    session.broadcastPresence(true)
    // Opens and announces our own file drive up front rather than on first use. It used to be
    // created lazily by `fileStore()`, so after a restart a peer served none of the files it had
    // previously shared until it happened to upload something new: the drive's topic was never
    // re-announced and its core was never opened, so it was neither discoverable nor eligible to
    // be attached to an existing peer connection's replication stream. Rooms kept replicating
    // regardless (separate topic), which is why chat and presence looked perfectly healthy while
    // every download from that peer failed as "file unavailable / peer offline".
    void session.fileStore().catch((err) => {
      console.warn('[session] could not open local file drive:', (err as Error).message)
    })
    return session
  }

  getNickname(): string {
    return this.nickname
  }

  getWallpaper(): string {
    return this.wallpaper
  }

  async setWallpaper(id: string): Promise<void> {
    this.wallpaper = id
    await this.profileStore.setWallpaper(id)
  }

  async setNickname(nickname: string): Promise<void> {
    this.nickname = nickname
    this.broadcastPresence(true)
    await this.profileStore.setNickname(nickname)
  }

  getAvatar(): string {
    return this.avatar
  }

  async setAvatar(avatar: string): Promise<void> {
    this.avatar = avatar
    this.broadcastPresence(true)
    await this.profileStore.setAvatar(avatar)
  }

  listPeerAvatars(): Map<string, string> {
    return new Map(this.peerAvatars)
  }

  getPeerAvatar(userId: string): string {
    return this.peerAvatars.get(userId) || ''
  }

  broadcastPresence(online: boolean): void {
    for (const peer of this.peers.values()) {
      peer.rpc.sendPresence({ userId: this.identity.id, online, nickname: this.nickname, avatar: this.avatar })
    }
  }


  async fileStore(): Promise<FileStore> {
    if (!this.fileStoreInstance) {
      this.fileStoreInstance = await FileStore.open(this.store)
      const topic = hypercoreCrypto.discoveryKey(this.fileStoreInstance.key)
      await joinRoom(this.swarm, topic)
    }
    return this.fileStoreInstance
  }

  /**
   * One long-lived Hyperdrive per foreign drive key, opened on first use and kept until the
   * session closes.
   *
   * Opening a fresh `new Hyperdrive(store, key)` per download — which is what this used to do —
   * deadlocks on the second download from any given peer. Hyperdrive opens its metadata core
   * with `exclusive: true`, which takes a mutex on that core, and a drive only releases it when
   * it is closed; these drives were never closed. So the first download from a peer worked and
   * every later one hung forever inside `drive.ready()`, waiting on a lock the previous
   * download still held: no request ever went out, no retry ran, no error was thrown, and the
   * UI just sat there. Reusing the open drive sidesteps the lock entirely, and also stops us
   * re-joining the same swarm topic on every single download.
   */
  private remoteDrive(keyBuf: Buffer): Promise<Hyperdrive> {
    const keyHex = b4a.toString(keyBuf, 'hex')
    let pending = this.remoteDrives.get(keyHex)
    if (!pending) {
      pending = (async () => {
        const drive = new Hyperdrive(this.store, keyBuf)
        await drive.ready()
        // Held open across the join so a `get()` waits for the peer still being looked up
        // instead of resolving against empty local storage the moment it finds nothing.
        const done = this.store.findingPeers()
        this.swarm.join(drive.discoveryKey, { client: true, server: true })
        this.swarm.flush().then(done, done)
        return drive
      })()
      // A failed open must not be cached, or every later attempt replays the same failure.
      pending.catch(() => this.remoteDrives.delete(keyHex))
      this.remoteDrives.set(keyHex, pending)
    }
    return pending
  }

  /**
   * Downloads a file from any Hyperdrive key on the network or from local store.
   * Utilizes the existing session store replication (already active on all peer connections)
   * and joins the discovery key on Hyperswarm.
   */
  async downloadFile(driveKey: string | Buffer, filePath: string): Promise<Buffer | null> {
    const keyBuf = typeof driveKey === 'string' ? b4a.from(driveKey, 'hex') : driveKey
    const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`

    // 1. Check if this drive is our own local fileStore
    if (this.fileStoreInstance && b4a.equals(this.fileStoreInstance.key, keyBuf)) {
      try {
        const localBuf = await this.fileStoreInstance.drive.get(cleanPath)
        if (localBuf) return localBuf
      } catch {}
    }

    // 2. If a network resync (wifi <-> cellular handoff, see resumeNetwork) is already in
    // flight, wait for it — otherwise every attempt below races a socket that's actively being
    // torn down/rebound and fails fast, reporting the peer as offline when it's really just our
    // own interface that hasn't caught up yet.
    if (this.resumeNetworkPromise) await this.resumeNetworkPromise.catch(() => {})

    // 3. Open the drive in our session's corestore, which already replicates with connected
    // peers — reusing the one we opened last time for this key if there is one.
    const drive = await this.remoteDrive(keyBuf)

    // 5. Retry fetching with backoff. Generous enough to outlast a DHT re-announce and hole-punch
    // after a network handoff, which routinely takes well past 10s on cellular NATs — the old
    // 8-attempt/~12s budget gave up before reconnection finished, misreporting a reachable peer
    // as offline.
    // The per-attempt timeout matters as much as the retries: hypercore's `get` waits forever by
    // default, so once the metadata said the file exists but its blob blocks stalled, the very
    // first attempt hung indefinitely — no retry, no error, no alert, the UI just sat there.
    let lastErr: Error | null = null
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const buffer = await drive.get(cleanPath, { timeout: 5000 })
        if (buffer) return buffer
      } catch (err) {
        lastErr = err as Error
        if (attempt >= 11) throw err
      }
      await new Promise((resolve) => setTimeout(resolve, 800 * Math.min(attempt + 1, 5)))
    }
    // Out of retries. Returning a bare null here just surfaced as "file not available" no matter
    // what actually went wrong, which is useless on mobile where the console isn't reachable —
    // so report what state we ended up in. `length === 0` means the drive's metadata never
    // replicated to us at all (we never really connected to whoever serves it); a non-zero
    // length with no entry means we are talking to that drive but it does not have this path.
    const detail = await this.describeStalledDrive(drive, cleanPath)
    throw new Error(
      `Could not fetch ${cleanPath} after ${12} attempts — ${detail}` +
      (lastErr ? ` (last error: ${lastErr.message})` : '')
    )
  }

  /** The drive a key refers to: our own file store when the key is ours, a remote drive
   * otherwise. The same resolution `downloadFile` does, minus the fetching. */
  private async driveFor(driveKey: string): Promise<Hyperdrive> {
    const keyBuf = b4a.from(driveKey, 'hex')
    const own = await this.fileStore()
    if (b4a.equals(own.key, keyBuf)) return own.drive
    return this.remoteDrive(keyBuf)
  }

  /**
   * File size straight from drive metadata, without fetching any content — what a range request
   * has to be answered against. Null when the entry has not replicated to us yet.
   */
  async statFile(driveKey: string, filePath: string): Promise<{ size: number } | null> {
    const drive = await this.driveFor(driveKey)
    const entry = await drive.entry(drivePath(filePath))
    const size = entry?.value.blob?.byteLength
    return typeof size === 'number' ? { size } : null
  }

  /**
   * A byte range of a shared file as a stream, pulled from peers on demand — the piece that lets
   * playback start before the whole file has arrived. `downloadFile` stays the way to get a file
   * whole (saving it, previewing an image); this one feeds the media server.
   */
  async createFileStream(driveKey: string, filePath: string, range?: { start: number; end: number }): Promise<Readable> {
    const drive = await this.driveFor(driveKey)
    return drive.createReadStream(drivePath(filePath), range)
  }

  /** Best-effort snapshot of why a `downloadFile` gave up, for the message shown to the user. */
  private async describeStalledDrive(drive: Hyperdrive, cleanPath: string): Promise<string> {
    const peers = this.peers.size
    try {
      const length = drive.core.length
      if (length === 0) {
        return `the drive's index never reached us (0 entries synced, ${peers} peer(s) connected), so nothing is serving it right now`
      }
      const entry = await drive.entry(cleanPath)
      if (!entry) return `the drive synced (${length} entries) but has no such path`
      if (!entry.value.blob) return `the drive lists this path but it carries no data`
      return `the file is listed but its contents never transferred (${length} entries synced, ${peers} peer(s) connected)`
    } catch (err) {
      return `could not inspect the drive: ${(err as Error).message} (${peers} peer(s) connected)`
    }
  }

  async createRoom(name: string, isPublic = false, avatar = '', description = '', broadcast = false): Promise<Room> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Room name required')
    const existing = this.listBookmarks().find((b) => b.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      throw new Error(`A room named "${trimmed}" already exists`)
    }

    const storeId = randomId(8)
    const room = await Room.open(this.store, null, null, this.identity.id, undefined, storeId)
    const roomId = room.id
    this.setupRoomKeyPersistence(room)
    if (avatar || description) {
      await room.updateMeta({ name: trimmed, avatar, description })
    }
    if (broadcast) await room.setBroadcast(true)
    const token = this.issueInvite(roomId)
    await this.profileStore.saveInviteToken({ roomId, ...token })
    await this.joinTopic(room)
    this.trackRoom(room)
    const bootstrapKey = b4a.toString(room.bootstrapKey, 'hex')
    await this.saveBookmark({ id: roomId, name: trimmed, bootstrapKey, avatar, description, storeId })
    if (isPublic) {
      const inviteCode = this.invites.get(roomId)?.code ?? ''
      const announce: RoomAnnounceMessage = { roomId, name: trimmed, bootstrapKey, authorId: this.identity.id, inviteCode, avatar, description }
      this.directory.set(roomId, announce)
      this.saveDirectory()
      for (const peer of this.peers.values()) peer.rpc.sendRoomAnnounce(announce)
    }
    return room
  }

  /** Broadcast is replicated state, not a bookmark field: only the owner may change it and every
   * peer derives it from the log, so there is nothing to mirror locally. */
  async setRoomBroadcast(roomId: string, enabled: boolean): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return
    await room.setBroadcast(enabled)
  }

  /**
   * Deletes the message and, when it carried a file that lives on our own drive, the bytes too.
   * The blob removal is best-effort by nature: a moderator deleting someone else's file has no
   * copy to remove, and peers that already replicated it keep theirs. What propagates reliably is
   * the log entry, which drops the message and its Files-tab record for everyone.
   */
  async deleteMessage(roomId: string, messageId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('Room not found')
    const file = await room.getFile(messageId)
    await room.deleteMessage(messageId)
    if (file && this.fileStoreInstance && file.driveKey === b4a.toString(this.fileStoreInstance.key, 'hex')) {
      try {
        await this.fileStoreInstance.drive.del(file.path)
      } catch {}
    }
  }

  /**
   * Blobs on our own drive that no room's file index points at any more: bytes left behind by
   * messages deleted before deletion removed them, and by the old Room Vault, whose records this
   * build no longer reads.
   *
   * Throws unless every bookmarked room is open. A room that failed to open contributes no
   * referenced paths, so sweeping without it would report its live files as orphans.
   */
  async findOrphanBlobs(): Promise<Array<{ path: string; bytes: number }>> {
    if (this.rooms.size < this.bookmarks.size) {
      throw new Error(`Only ${this.rooms.size} of ${this.bookmarks.size} rooms are open — wait for them all to load, otherwise their files would look orphaned`)
    }
    const fileStore = await this.fileStore()
    const ourDriveKey = b4a.toString(fileStore.key, 'hex')

    const referenced = new Set<string>()
    for (const room of this.rooms.values()) {
      for (const file of await room.listFiles()) {
        if (file.driveKey === ourDriveKey) referenced.add(drivePath(file.path))
      }
    }

    const orphans: Array<{ path: string; bytes: number }> = []
    for await (const entry of fileStore.drive.list('/')) {
      if (!referenced.has(drivePath(entry.key))) {
        orphans.push({ path: entry.key, bytes: entry.value.blob?.byteLength ?? 0 })
      }
    }
    return orphans
  }

  /** Deletes blobs from our own drive. Paths are expected to come from `findOrphanBlobs`. */
  async deleteBlobs(paths: string[]): Promise<number> {
    const fileStore = await this.fileStore()
    let deleted = 0
    for (const path of paths) {
      try {
        await fileStore.drive.del(path)
        deleted++
      } catch (err) {
        console.warn('[session] could not delete blob', path, (err as Error).message)
      }
    }
    return deleted
  }

  async updateRoomMeta(roomId: string, opts: { name?: string; avatar?: string; description?: string }): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return
    await room.updateMeta(opts)
    const bookmark = this.bookmarks.get(roomId)
    if (bookmark) {
      const updated: RoomBookmark = {
        ...bookmark,
        name: opts.name ?? bookmark.name,
        avatar: opts.avatar !== undefined ? opts.avatar : bookmark.avatar,
        description: opts.description !== undefined ? opts.description : bookmark.description
      }
      this.bookmarks.set(roomId, updated)
      await this.profileStore.saveBookmark(updated)
    }
    const announce = this.directory.get(roomId)
    if (announce) {
      const updatedAnnounce: RoomAnnounceMessage = {
        ...announce,
        name: opts.name ?? announce.name,
        avatar: opts.avatar !== undefined ? opts.avatar : announce.avatar,
        description: opts.description !== undefined ? opts.description : announce.description
      }
      this.directory.set(roomId, updatedAnnounce)
      this.saveDirectory()
      for (const peer of this.peers.values()) peer.rpc.sendRoomAnnounce(updatedAnnounce)
    }
  }

  listDirectory(): RoomAnnounceMessage[] {
    const unique = new Map<string, RoomAnnounceMessage>()
    for (const a of this.directory.values()) {
      unique.set(a.bootstrapKey, a)
    }
    return [...unique.values()]
  }

  /** Hides a Discover entry from this device only — for announces from a peer/identity you
   * don't own and can't retract (e.g. dead rooms from an old test identity). Reappears if that
   * author re-announces (they're still out there gossiping it), unlike deleteRoom's real retraction. */
  removeFromDirectory(roomId: string): void {
    if (!this.directory.delete(roomId)) return
    this.saveDirectory()
    this.events.onDirectoryChange?.()
  }

  listContacts(): ContactEntry[] {
    return [...this.contacts.values()].filter((c) => c.status !== 'declined')
  }

  async sendContactRequest(userId: string, nickname: string): Promise<boolean> {
    const existing = this.contacts.get(userId)
    // They already asked us: accepting is what the user means here, and firing a competing
    // request instead would have both sides create a room the other never joins.
    if (existing?.status === 'incoming') {
      await this.respondToContact(userId, true)
      return true
    }
    const peer = this.peers.get(userId)
    if (!peer) return false
    peer.rpc.sendContactRequest({ fromId: this.identity.id, nickname: this.nickname, avatar: this.avatar })
    const contact: ContactEntry = { userId, nickname, status: 'outgoing', avatar: this.peerAvatars.get(userId) }
    this.contacts.set(userId, contact)
    void this.profileStore.saveContact(contact)
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
    const room = await this.createRoom(this.uniqueRoomName('New direct chat'), false)
    const bookmark = this.bookmarks.get(room.id)
    if (bookmark) await this.saveBookmark({ ...bookmark, contactInvite: true })
    return { key: this.inviteLinkFor(room.id), roomId: room.id }
  }

  /** Joins the room a contact link points at and records its issuer as an accepted contact. */
  async acceptContactInvite(invite: { from: string; name: string; key: string }): Promise<Room> {
    if (invite.from === this.identity.id) throw new Error('That is your own contact link')
    const nickname = invite.name || invite.from.slice(0, 8)
    const room = await this.joinRoomByKey(this.uniqueRoomName(nickname), invite.key)
    const contact: ContactEntry = {
      userId: invite.from,
      nickname,
      status: 'accepted',
      roomId: room.id,
      avatar: this.peerAvatars.get(invite.from)
    }
    this.contacts.set(invite.from, contact)
    await this.profileStore.saveContact(contact)
    this.events.onContactsChange?.()
    return room
  }

  /**
   * The other half of `createContactInvite`, run on the issuer when someone asks to write to the
   * placeholder room. That request is the first and only proof of who took the link up.
   *
   * Only the first claimant binds: the link doubles as an ordinary room invite, so a second joiner
   * would otherwise overwrite the contact and quietly repoint it at a room now holding three people.
   */
  private async claimContactInvite(roomId: string, identityId: string): Promise<void> {
    const bookmark = this.bookmarks.get(roomId)
    if (!bookmark?.contactInvite || identityId === this.identity.id) return
    const nickname = this.peerNicknames.get(identityId) || identityId.slice(0, 8)
    const contact: ContactEntry = {
      userId: identityId,
      nickname,
      status: 'accepted',
      roomId,
      avatar: this.peerAvatars.get(identityId)
    }
    this.contacts.set(identityId, contact)
    await this.profileStore.saveContact(contact)
    await this.saveBookmark({ ...bookmark, name: this.uniqueRoomName(nickname), contactInvite: undefined })
    this.events.onContactsChange?.()
  }

  /** Replaces the placeholder name a link-bound contact starts with once presence reveals the real one. */
  private async adoptPeerNickname(userId: string, nickname: string): Promise<void> {
    const contact = this.contacts.get(userId)
    if (!contact || contact.nickname === nickname) return
    if (contact.nickname !== userId.slice(0, 8)) return
    const updated: ContactEntry = { ...contact, nickname }
    this.contacts.set(userId, updated)
    await this.profileStore.saveContact(updated)
    this.events.onContactsChange?.()
  }

  async respondToContact(userId: string, accept: boolean): Promise<void> {
    const contact = this.contacts.get(userId)
    if (!contact || contact.status !== 'incoming') return
    if (!accept) {
      const declined: ContactEntry = { ...contact, status: 'declined', pendingResponse: { accepted: false, roomId: '', name: '', bootstrapKey: '', inviteCode: '' } }
      this.contacts.set(userId, declined)
      await this.profileStore.saveContact(declined)
      this.deliverContactResponse(declined)
      this.events.onContactsChange?.()
      return
    }
    // Never let room creation abort the accept: `createRoom` rejects a blank or already-used
    // name, and a peer with no nickname set — or a second room already named after them — is
    // exactly the case that used to throw here and leave both sides desynced.
    const room = await this.createRoom(this.uniqueRoomName(contact.nickname || userId.slice(0, 8)), false, contact.avatar)
    const updated: ContactEntry = {
      ...contact,
      status: 'accepted',
      roomId: room.id,
      pendingResponse: {
        accepted: true,
        roomId: room.id,
        name: this.nickname,
        bootstrapKey: b4a.toString(room.bootstrapKey, 'hex'),
        inviteCode: this.invites.get(room.id)?.code ?? ''
      }
    }
    this.contacts.set(userId, updated)
    await this.profileStore.saveContact(updated)
    this.deliverContactResponse(updated)
    this.events.onContactsChange?.()
  }

  /** `createRoom` throws on a blank or duplicate name; contact nicknames are neither unique nor
   * guaranteed non-empty, so derive one that always passes. */
  private uniqueRoomName(base: string): string {
    const trimmed = base.trim() || 'Contact'
    const taken = new Set(this.listBookmarks().map((b) => b.name.trim().toLowerCase()))
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
    const peer = this.peers.get(contact.userId)
    if (!peer) return
    peer.rpc.sendContactResponse({
      fromId: this.identity.id,
      accepted: pending.accepted,
      roomId: pending.roomId,
      name: pending.name,
      bootstrapKey: pending.bootstrapKey,
      inviteCode: pending.inviteCode,
      avatar: this.avatar
    })
    if (!pending.accepted) {
      this.contacts.delete(contact.userId)
      void this.profileStore.removeContact(contact.userId)
      return
    }
    const cleared: ContactEntry = { ...contact, pendingResponse: undefined }
    this.contacts.set(contact.userId, cleared)
    void this.profileStore.saveContact(cleared)
  }

  /** Contact handshakes are fire-and-forget over a live socket, and mobile peers drop off
   * whenever the app backgrounds — replay whatever is still owed to this peer now it's back. */
  private flushPendingContacts(peer: PeerConnection): void {
    const contact = this.contacts.get(b4a.toString(peer.remotePublicKey, 'hex'))
    if (!contact) return
    if (contact.pendingResponse) {
      this.deliverContactResponse(contact)
      return
    }
    if (contact.status === 'outgoing') {
      peer.rpc.sendContactRequest({ fromId: this.identity.id, nickname: this.nickname, avatar: this.avatar })
    }
  }

  async deleteContact(userId: string): Promise<void> {
    const contact = this.contacts.get(userId)
    this.contacts.delete(userId)
    await this.profileStore.removeContact(userId)
    if (contact?.roomId) await this.deleteRoom(contact.roomId)
  }

  /** Leaves the swarm topic, purges every hypercore stored under the room's corestore namespace (system/view/writer cores), and drops the bookmark. Irreversible. */
  async deleteRoom(roomId: string): Promise<void> {
    const bookmark = this.bookmarks.get(roomId)
    if (bookmark) {
      const topic = hypercoreCrypto.discoveryKey(b4a.from(bookmark.bootstrapKey, 'hex'))
      await this.swarm.leave(topic)
    }

    const room = this.rooms.get(roomId)
    if (room) {
      await room.close()
      this.rooms.delete(roomId)
    }

    // Forget the room before reclaiming its disk space, not after. Purging reaches into hypercore
    // internals (see `purgeCore`), and a throw in there used to abort the whole method with the
    // bookmark still saved — leaving a room the user had left sitting in their list, its data
    // already destroyed, reopening to an empty shell with no members and no way out.
    this.bookmarks.delete(roomId)
    await this.profileStore.removeBookmark(roomId)

    // If this was your own public announce (you were the host), drop it from your own
    // directory too — otherwise Discover keeps offering a room whose data you just purged,
    // and Join can never succeed since nothing is left to open. Peers who already gossiped
    // the announce keep their stale copy; there's no retraction broadcast, only local cleanup.
    if (this.directory.delete(roomId)) {
      this.saveDirectory()
      this.events.onDirectoryChange?.()
    }

    // The room's cores live under the namespace recorded on its bookmark. This used to purge
    // `namespace(roomId)` unconditionally, which is the right place only for rooms joined before
    // joins got their own namespace — for every room the user created, it scrubbed an unrelated
    // empty namespace and left the actual data on disk forever.
    const namespace = bookmark?.storeId ?? roomId
    try {
      const namespaced = this.store.namespace(namespace)
      await namespaced.ready()
      for await (const discoveryKey of namespaced.list(namespaced.ns)) {
        const core = namespaced.get({ discoveryKey })
        await core.ready()
        await purgeCore(core)
      }
      await namespaced.close()
    } catch (err) {
      // Best effort by design: wasted disk is recoverable, a room you cannot leave is not.
      console.warn(`[session] could not purge storage for room ${roomId}:`, (err as Error).message)
    }
  }

  /** `invite` is `bootstrapKeyHex` or `bootstrapKeyHex:inviteCode` (compound form shared via link/QR). */
  async joinRoomByKey(name: string, invite: string, avatar = '', description = ''): Promise<Room> {
    const sep = invite.indexOf(':')
    const bootstrapKeyHex = sep === -1 ? invite : invite.slice(0, sep)
    const inviteCode = sep === -1 ? '' : invite.slice(sep + 1)
    const bootstrapKey = b4a.from(bootstrapKeyHex, 'hex')
    const roomId = bootstrapKeyHex.slice(0, 16)

    const existingRoom = this.rooms.get(roomId)
    if (existingRoom?.writable) {
      if (inviteCode) this.pendingInviteCodes.set(roomId, inviteCode)
      for (const peer of this.peers.values()) this.requestWriteIfNeeded(existingRoom, peer)
      return existingRoom
    }
    if (existingRoom) {
      // Opening an invite for a room that is already here and still cannot be written to is the
      // user asking to start over — nobody pastes an invite for a room that works. This used to
      // hand back the existing room untouched, which made the link a no-op against exactly the
      // broken state it was needed for: a room whose local writer core was purged by a failed
      // leave can only be fixed by rebuilding it, never by asking for access again.
      //
      // Messages and membership come back from peers; the only thing discarded is this device's
      // unusable copy.
      await this.deleteRoom(roomId)
    }

    const initialKeys = await this.profileStore.getRoomKeys(roomId)
    // Fresh namespace per join, rather than reusing `roomId` as the namespace.
    //
    // Autobase derives its writer key from the corestore namespace (`store.get({ name: 'local' })`),
    // so joining under `roomId` regenerated the exact same writer key every time. That is fine on a
    // first join and broken on a re-join after leaving: leaving purges the local writer core, but
    // the room's log still lists that key as a writer with blocks behind it, so the returning member
    // came back holding an empty core the network believes is long — and never became writable
    // again. It also could not be rescued by re-granting access, because the key was already in the
    // writer set and there was nothing to add.
    //
    // A new namespace means a genuinely new writer key, which the owner grants through the normal
    // `addWriter` path.
    const storeId = randomId(8)
    const room = await this.openRoomWithRetry(roomId, bootstrapKey, initialKeys, storeId)
    this.setupRoomKeyPersistence(room)
    this.pendingInviteCodes.set(roomId, inviteCode)
    await this.joinTopic(room)
    this.trackRoom(room)
    // See onContactResponse: an already-connected peer's socket is reused for this room's
    // topic too, so `onConnection` won't fire again to trigger the write request on its own.
    for (const peer of this.peers.values()) this.requestWriteIfNeeded(room, peer)
    await this.saveBookmark({ id: roomId, name: name.trim(), bootstrapKey: bootstrapKeyHex, avatar, description, storeId })
    return room
  }

  /** Opens every bookmarked room concurrently. Serially, each room waited on its own network
   * round-trips before the next one started, so startup cost was the sum over all bookmarks. */
  async reopenBookmarkedRooms(): Promise<Room[]> {
    const results = await Promise.all(this.listBookmarks().map(async (bookmark) => {
      try {
        const bootstrapKey = b4a.from(bookmark.bootstrapKey, 'hex')
        const initialKeys = await this.profileStore.getRoomKeys(bookmark.id)
        const room = await this.openRoomWithRetry(bookmark.id, bootstrapKey, initialKeys, bookmark.storeId)
        this.setupRoomKeyPersistence(room)
        await this.joinTopic(room)
        this.trackRoom(room)
        return room
      } catch (err) {
        // Only genuine corruption drops the bookmark. Failing to reach a room is a statement about
        // the network, not about the room: deleting it there meant a spell offline, or one peer
        // being asleep, silently removed rooms the user is still a member of and whose invite they
        // may no longer have.
        if ((err as { code?: string }).code === 'ROOM_UNREACHABLE') {
          console.warn(`[session] could not reach room ${bookmark.id} on startup, keeping it:`, (err as Error).message)
          return null
        }
        console.warn(`[session] cleaning up corrupted/purged room bookmark ${bookmark.id}:`, (err as Error).message)
        this.bookmarks.delete(bookmark.id)
        await this.profileStore.removeBookmark(bookmark.id)
        return null
      }
    }))
    return results.filter((room): room is Room => room !== null)
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId)
  }

  /** Common wiring for every newly-opened Room, active or not (bookmarked rooms all stay open/replicating in the background — see `reopenBookmarkedRooms`) — currently just forwards new messages from anyone but self, for desktop notifications. */
  private trackRoom(room: Room): void {
    this.rooms.set(room.id, room)
    room.onNewMessage((message) => {
      if (message.authorId === this.identity.id) return
      this.events.onIncomingMessage?.(room.id, message)
    })
    // A room's name/avatar/description replicate through Autobase to every member on their
    // own, but the bookmark (what the room list actually renders) is a separate local cache
    // that only the device making the change updates on its own — so it never picked up a
    // change made on another device until now.
    room.onMetaChange(() => {
      const bookmark = this.bookmarks.get(room.id)
      if (!bookmark) return
      void this.saveBookmark({ ...bookmark, name: room.name || bookmark.name, avatar: room.avatar, description: room.description })
      this.events.onBookmarksChange?.()
    })
  }

  listBookmarks(): RoomBookmark[] {
    return [...this.bookmarks.values()]
  }

  private async migrateJsonIfNeeded(): Promise<void> {
    const profileFile = path.join(this.storageDir, PROFILE_FILE)
    if (fs.existsSync(profileFile)) {
      const diskProf = loadProfile(this.storageDir)
      if (diskProf.nickname) await this.profileStore.setNickname(diskProf.nickname)
      if (diskProf.avatar) await this.profileStore.setAvatar(diskProf.avatar)
      fs.renameSync(profileFile, `${profileFile}.migrated`)
    }


    const bookmarksFile = path.join(this.storageDir, BOOKMARKS_FILE)
    if (fs.existsSync(bookmarksFile)) {
      const old: RoomBookmark[] = JSON.parse(fs.readFileSync(bookmarksFile, 'utf8'))
      for (const bookmark of old) await this.profileStore.saveBookmark(bookmark)
      fs.renameSync(bookmarksFile, `${bookmarksFile}.migrated`)
    }

    const contactsFile = path.join(this.storageDir, CONTACTS_FILE)
    if (fs.existsSync(contactsFile)) {
      const old: ContactEntry[] = JSON.parse(fs.readFileSync(contactsFile, 'utf8'))
      for (const contact of old) await this.profileStore.saveContact(contact)
      fs.renameSync(contactsFile, `${contactsFile}.migrated`)
    }
  }

  /** Joins the topic and holds Corestore's `findingPeers` open until the swarm has finished looking.
   * Without it, a `get()` on a core this device has never replicated resolves against empty local
   * storage the instant it finds nothing, rather than waiting for the peer that is about to
   * connect — the difference between a room that populates and one that looks empty then fills in
   * seconds later. Deliberately not awaited: the caller should open the room concurrently with
   * discovery, not after it. */
  /** Returns when peer discovery for this topic has settled, so callers can spend a wait on the
   * lookup actually finishing rather than on a fixed sleep. */
  private trackDiscovery(topic: Buffer): Promise<void> {
    const done = this.store.findingPeers()
    joinRoom(this.swarm, topic)
    const flushed = this.swarm.flush().then(done, done)
    return flushed.then(() => undefined, () => undefined)
  }

  private async joinTopic(room: Room): Promise<void> {
    this.trackDiscovery(hypercoreCrypto.discoveryKey(room.bootstrapKey))
    room.onWritableChange(() => { if (room.writable) this.pendingInviteCodes.delete(room.id) })
    for (const peer of this.peers.values()) this.requestWriteIfNeeded(room, peer)
  }

  /**
   * Opening a room this device has never replicated can hit Autobase's local-resume check before
   * the swarm connection to the peer serving it has come up, which throws STORAGE_EMPTY
   * immediately instead of waiting. Joins the topic first to get a connection underway, then
   * retries through that race before giving up.
   *
   * The first wait is spent on discovery itself rather than a fixed sleep: the previous version
   * slept through a blind ~29s budget whether or not the lookup had even settled, which on a slow
   * hole-punch gave up seconds before the peer arrived.
   *
   * Only a first join needs any of this. A room already on this device opens straight from local
   * storage, which is why every other room keeps working while one refuses to load.
   */
  private async openRoomWithRetry(
    roomId: string | null,
    bootstrapKey: Buffer,
    initialKeys?: Array<{ epoch: number; keyHex: string }>,
    storeNamespace?: string
  ): Promise<Room> {
    const discovered = this.trackDiscovery(hypercoreCrypto.discoveryKey(bootstrapKey))
    const deadline = Date.now() + JOIN_REPLICATION_TIMEOUT_MS
    let waitedForDiscovery = false
    for (;;) {
      try {
        return await Promise.race([
          Room.open(this.store, roomId, bootstrapKey, this.identity.id, initialKeys, storeNamespace),
          new Promise<never>((_, reject) => setTimeout(
            () => reject(Object.assign(new Error('Opening the room took too long'), { code: 'STORAGE_EMPTY' })),
            ROOM_OPEN_TIMEOUT_MS
          ))
        ])
      } catch (err) {
        if ((err as { code?: string }).code !== 'STORAGE_EMPTY') throw err
        if (Date.now() >= deadline) {
          throw Object.assign(new Error(this.joinFailureReason()), { code: 'ROOM_UNREACHABLE' })
        }
        if (!waitedForDiscovery) {
          waitedForDiscovery = true
          await Promise.race([discovered, new Promise((resolve) => setTimeout(resolve, deadline - Date.now()))])
          continue
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  }

  /**
   * A room's data lives only on its members' devices. "Check your connection" was the only thing
   * this ever said, which misdirects in the common case: the network is fine and simply nobody
   * holding that room is reachable — a group whose only member is an offline desktop cannot be
   * joined no matter how long the wait.
   */
  private joinFailureReason(): string {
    return this.peers.size === 0
      ? 'Could not reach any peers — check your connection and try again.'
      : 'Nobody who has this room is online right now. Its messages live only on its members\' devices, so one of them has to be running for you to join.'
  }

  private requestWriteIfNeeded(room: Room, peer: PeerConnection): void {
    if (room.writable) return
    const inviteCode = this.pendingInviteCodes.get(room.id) ?? ''
    peer.rpc.sendRequestWrite({ bootstrapKey: b4a.toString(room.bootstrapKey, 'hex'), writerKey: b4a.toString(room.localWriterKey, 'hex'), identityId: this.identity.id, inviteCode })
  }

  /** Owner-only: pushes the room's current content key to a reconnecting member who might have missed a rotation while offline. `peer.remotePublicKey` is the same swarm keypair as the remote's `identity.id` (both derive from the one public key), so it doubles as their app identity here. */
  private syncKeyIfOwner(room: Room, peer: PeerConnection): void {
    if (!room.isOwner(this.identity.id)) return
    const peerIdentityId = b4a.toString(peer.remotePublicKey, 'hex')
    if (!room.listMembers().some((m) => m.identityId === peerIdentityId)) return
    const keyHex = room.currentKeyHex
    if (keyHex) peer.rpc.sendRoomKey({ roomId: room.id, epoch: room.keyEpoch, key: keyHex })
  }

  /** Revokes write access. If the caller is the room owner, also rotates the content key and pushes it to every currently-connected remaining member (offline members catch up via `syncKeyIfOwner` on reconnect) — this is what actually stops the removed member from reading future messages. A moderator-issued kick/ban still revokes write access immediately (real, replicated, enforced in `Room.apply()`) but the content key isn't rotated: mods aren't key-holders in this design (only the owner distributes room keys, see `onRequestWrite`/`syncKeyIfOwner` below), so a mod-kicked member could still decrypt messages sent before the owner next rotates. Same accepted trade-off as the existing offline-owner addWriter gap. */
  private async revokeWrite(room: Room, writerKeyHex: string): Promise<void> {
    await room.removeWriter(b4a.from(writerKeyHex, 'hex'))
    if (!room.isOwner(this.identity.id)) return
    const { epoch, keyHex } = room.rotateKey()
    const remainingIds = new Set(room.listMembers().map((m) => m.identityId))
    for (const peer of this.peers.values()) {
      const peerIdentityId = b4a.toString(peer.remotePublicKey, 'hex')
      if (remainingIds.has(peerIdentityId)) peer.rpc.sendRoomKey({ roomId: room.id, epoch, key: keyHex })
    }
  }

  /** Owner or moderator (enforced in `Room.apply()`; a mod can't target the owner or another mod): removes a member's write access. They can still rejoin with a valid invite (unlike `banMember`). */
  async kickMember(roomId: string, writerKeyHex: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return
    await this.revokeWrite(room, writerKeyHex)
  }

  /** Owner or moderator: kicks the member (see `revokeWrite`) AND blocks any future write-grant for their identity, even with a valid invite code. The ban itself is a replicated `Room` log entry (see `room.ts`), not owner-local state, so any moderator's ban is visible to the owner's `onRequestWrite` gate too. */
  async banMember(roomId: string, writerKeyHex: string, identityId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return
    await this.revokeWrite(room, writerKeyHex)
    await room.banMember(identityId)
  }

  /** Owner or moderator: lifts a ban so the identity can request write access again with a valid invite. Does not restore their old write access by itself. */
  async unbanMember(roomId: string, identityId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return
    await room.unbanMember(identityId)
  }

  /** Owner or moderator: silences a member without revoking read access or membership — enforced in `Room`'s `apply()` (see `room.ts`), not just client-side, so a muted member's own client can't bypass it by ignoring the UI gate. */
  async muteMember(roomId: string, identityId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return
    await room.muteMember(identityId)
  }

  async unmuteMember(roomId: string, identityId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return
    await room.unmuteMember(identityId)
  }

  /** Owner-only (enforced in `Room.apply()`): grants moderator role — kick/ban/mute powers over plain members, never over the owner or other mods, and never invite/promote/write-grant management. */
  async promoteToModerator(roomId: string, identityId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return
    await room.promote(identityId)
  }

  async demoteModerator(roomId: string, identityId: string): Promise<void> {
    const room = this.rooms.get(roomId)
    if (!room) return
    await room.demote(identityId)
  }

  private issueInvite(roomId: string): InviteToken {
    const token: InviteToken = { code: randomId(16), usedCount: 0 }
    this.invites.set(roomId, token)
    void this.profileStore.saveInviteToken({ roomId, ...token })
    return token
  }

  private redeemInvite(roomId: string, code: string): boolean {
    const token = this.invites.get(roomId)
    if (!token || token.code !== code) return false
    token.usedCount++
    void this.profileStore.saveInviteToken({ roomId, ...token })
    return true
  }

  /** Owner-only: the current shareable `bootstrapKeyHex:inviteCode` link for a room, issuing a token if none exists yet. */
  inviteLinkFor(roomId: string): string {
    const room = this.rooms.get(roomId)
    if (!room) throw new Error('room not open')
    const token = this.invites.get(roomId) ?? this.issueInvite(roomId)
    return `${b4a.toString(room.bootstrapKey, 'hex')}:${token.code}`
  }

  /** Owner-only: invalidates the previous invite link (any pending join requests using the old code will be rejected) and returns the new one. */
  regenerateInvite(roomId: string): string {
    this.issueInvite(roomId)
    return this.inviteLinkFor(roomId)
  }

  private async saveBookmark(bookmark: RoomBookmark): Promise<void> {
    this.bookmarks.set(bookmark.id, bookmark)
    await this.profileStore.saveBookmark(bookmark)
  }

  /** Local-only "Clear Chat History": hides every message up to now from this device's view of
   * the room. Doesn't touch the replicated log — nothing is deleted for other members, or for
   * this identity on another device (see RoomBookmark.clearedAt). */
  clearRoomHistory(roomId: string): void {
    const bookmark = this.bookmarks.get(roomId)
    if (!bookmark) return
    void this.saveBookmark({ ...bookmark, clearedAt: Date.now() })
  }

  /** Stamps a room as viewed "now" so it drops out of the unread filter until its next message. */
  markRoomRead(roomId: string): void {
    const bookmark = this.bookmarks.get(roomId)
    if (!bookmark) return
    void this.saveBookmark({ ...bookmark, lastReadAt: Date.now() })
  }

  /** Favourites live on the bookmark rather than in each UI's own local storage, so both
   * platforms read the same flag and it survives independently of the renderer. */
  async setRoomFavorite(roomId: string, favorite: boolean): Promise<void> {
    const bookmark = this.bookmarks.get(roomId)
    if (!bookmark) return
    await this.saveBookmark({ ...bookmark, favorite })
  }

  isRoomFavorite(roomId: string): boolean {
    return this.bookmarks.get(roomId)?.favorite === true
  }

  private loadDirectory(): RoomAnnounceMessage[] {
    const file = path.join(this.storageDir, DIRECTORY_FILE)
    if (!fs.existsSync(file)) return []
    const raw: Partial<RoomAnnounceMessage>[] = JSON.parse(fs.readFileSync(file, 'utf8'))
    return raw.map((entry) => ({
      roomId: entry.roomId ?? '',
      name: entry.name ?? '',
      bootstrapKey: entry.bootstrapKey ?? '',
      authorId: entry.authorId ?? '',
      inviteCode: entry.inviteCode ?? '',
      avatar: entry.avatar ?? '',
      description: entry.description ?? ''
    }))
  }

  private saveDirectory(): void {
    fs.mkdirSync(this.storageDir, { recursive: true })
    fs.writeFileSync(path.join(this.storageDir, DIRECTORY_FILE), JSON.stringify([...this.directory.values()], null, 2))
  }

  private resumeNetworkPromise: Promise<void> | null = null

  /** Call after the OS reports a network change (e.g. mobile switching wifi <-> cellular). The
   * swarm's UDP socket stays bound to whatever interface/NAT mapping was active when it was
   * created — hyperdht's own "network-change" heuristic only fires from noticing its external
   * address shift in DHT replies, which never arrives once the old socket can no longer route
   * out at all. Suspend+resume forces a clean rebind and re-announces every joined topic.
   *
   * Toggling wifi off fires several network-type changes in quick succession (wifi -> none ->
   * cellular) — each one calling this. Two overlapping suspend()/resume() cycles race Hyperswarm's
   * own suspended flag and can leave the swarm neither cleanly suspended nor resumed, needing a
   * force-restart to recover. Coalesced into a single in-flight cycle instead: a call that arrives
   * while one is already running just waits on it — since resume() always rebinds against
   * whatever network is active *when it runs*, that's still correct for the latest state. */
  async resumeNetwork(): Promise<void> {
    if (this.resumeNetworkPromise) return this.resumeNetworkPromise
    this.resumeNetworkPromise = (async () => {
      try {
        await this.swarm.suspend()
        await this.swarm.resume()
      } finally {
        this.resumeNetworkPromise = null
      }
    })()
    return this.resumeNetworkPromise
  }

  /** Snapshot of the swarm's current reachability — surfaced in a UI so a user stuck behind a
   * NAT that blocks hole-punching (common on some mobile carriers) has something to screenshot
   * for a bug report instead of just "it doesn't connect". `host`/`port` are hyperdht's own
   * inferred external address, not necessarily reachable — `firewalled` is the actual signal. */
  getNetworkStatus(): { connections: number; host: string | null; port: number; firewalled: boolean; publicKey: string } {
    return {
      connections: this.swarm.connections.size,
      host: this.swarm.dht.host,
      port: this.swarm.dht.port,
      firewalled: this.swarm.dht.firewalled,
      publicKey: this.identity.id
    }
  }

  /**
   * Re-asks for write access on rooms that still lack it.
   *
   * The owner only ever grants in response to a request, and a request was only sent on join and
   * on each *new* peer connection. One dropped or ill-timed request — the owner's room not open
   * yet, the grant racing a reconnect — therefore stranded a member as read-only indefinitely,
   * because an already-established connection never produces another `onConnection` to retry on.
   */
  private startWriteRequestRetry(): void {
    if (this.writeRequestTimer) return
    this.writeRequestTimer = setInterval(() => {
      for (const room of this.rooms.values()) {
        if (room.writable) continue
        for (const peer of this.peers.values()) this.requestWriteIfNeeded(room, peer)
      }
    }, WRITE_REQUEST_RETRY_MS)
    // Node keeps the process alive for a pending interval; this one must never be the reason a
    // headless session refuses to exit.
    this.writeRequestTimer.unref?.()
  }

  async close(): Promise<void> {
    if (this.writeRequestTimer) {
      clearInterval(this.writeRequestTimer)
      this.writeRequestTimer = null
    }
    for (const pending of this.remoteDrives.values()) {
      try {
        await (await pending).close()
      } catch { /* a drive that never opened has nothing to release */ }
    }
    this.remoteDrives.clear()
    for (const room of this.rooms.values()) await room.close()
    await this.swarm.destroy()
    await this.store.close()
  }
}
