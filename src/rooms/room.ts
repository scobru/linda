import Corestore from 'corestore'
import Autobase, { type AutobaseApplyHost, type AutobaseNode, type AutobaseView } from 'autobase'
import Hyperbee from 'hyperbee'
import b4a from 'b4a'
import sodium from 'sodium-universal'
import { randomId } from '../util/id.js'

export interface FileAttachment {
  driveKey: string
  path: string
  size: number
  name: string
  mimeType?: string
  thumbnail?: string
}

export interface ChatMessage {
  id: string
  roomId: string
  authorId: string
  body: string
  timestamp: number
  file?: FileAttachment
  replyTo?: string
  edited?: boolean
  deleted?: boolean
  reactions?: Record<string, string[]>
  /** Content-key epoch `body` is encrypted under. Absent = legacy plaintext (pre-encryption message), rendered as-is. */
  keyEpoch?: number
}

export interface MemberInfo {
  writerKey: string
  identityId: string
}

type RoomEntry =
  | { type: 'message'; message: ChatMessage }
  | { type: 'edit'; messageId: string; body: string; keyEpoch: number }
  | { type: 'delete'; messageId: string }
  | { type: 'reaction'; messageId: string; userId: string; emoji: string }
  | { type: 'addWriter'; key: string; identityId: string }
  | { type: 'removeWriter'; key: string }
  | { type: 'init'; ownerKey: string; ownerIdentityId: string }
  | { type: 'mute'; identityId: string }
  | { type: 'unmute'; identityId: string }
  | { type: 'ban'; identityId: string }
  | { type: 'unban'; identityId: string }
  | { type: 'promote'; identityId: string }
  | { type: 'demote'; identityId: string }
  | { type: 'setMeta'; name?: string; avatar?: string; description?: string }

interface OwnerRef {
  writerKey: string | null
  identityId: string | null
}

interface RoomMetaRef {
  name: string
  avatar: string
  description: string
}

/** `apply()`'s derived membership/moderation state lives only in JS closures — Autobase checkpoints already-applied log entries and won't replay them on reopen, so this must be persisted separately (message content survives reopen only because it's written into the `view` core itself, which has no such gap). */
interface PersistedRoomState {
  ownerWriterKey: string | null
  ownerIdentityId: string | null
  meta: RoomMetaRef
  writerIdentities: Array<[string, string]>
  moderatorIdentities: string[]
  mutedIdentities: string[]
  bannedIdentities: string[]
}

function serializeRoomState(owner: OwnerRef, meta: RoomMetaRef, writerIdentities: Map<string, string>, moderatorIdentities: Set<string>, mutedIdentities: Set<string>, bannedIdentities: Set<string>): PersistedRoomState {
  return {
    ownerWriterKey: owner.writerKey,
    ownerIdentityId: owner.identityId,
    meta: { ...meta },
    writerIdentities: [...writerIdentities.entries()],
    moderatorIdentities: [...moderatorIdentities],
    mutedIdentities: [...mutedIdentities],
    bannedIdentities: [...bannedIdentities]
  }
}


/** messageId -> mutable overlay state, replayed from edit/delete/reaction log entries; raw appended messages in the view stay immutable. */
type MessageOverlay = Map<string, { body?: string; bodyEpoch?: number; edited?: boolean; deleted?: boolean; reactions: Map<string, Set<string>> }>

function overlayFor(overlay: MessageOverlay, messageId: string) {
  let entry = overlay.get(messageId)
  if (!entry) {
    entry = { reactions: new Map() }
    overlay.set(messageId, entry)
  }
  return entry
}

/** owner: full control. mod: can kick/ban/mute plain members, never the owner or another mod. member: none of the above. */
type Role = 'owner' | 'mod' | 'member'

function makeApply(
  owner: OwnerRef,
  meta: RoomMetaRef,
  writerIdentities: Map<string, string>,
  overlay: MessageOverlay,
  messageAuthors: Map<string, string>,
  mutedIdentities: Set<string>,
  bannedIdentities: Set<string>,
  moderatorIdentities: Set<string>,
  onMessageMutation: () => void,
  persist: () => Promise<void>
) {
  function roleOf(authorKey: string): Role {
    if (authorKey === owner.writerKey) return 'owner'
    const id = writerIdentities.get(authorKey)
    return id !== undefined && moderatorIdentities.has(id) ? 'mod' : 'member'
  }
  function isPrivileged(identityId: string | undefined): boolean {
    return identityId !== undefined && (identityId === owner.identityId || moderatorIdentities.has(identityId))
  }

  return async function applyEntries(nodes: AutobaseNode<RoomEntry>[], view: AutobaseView, host: AutobaseApplyHost): Promise<void> {
    let dirty = false
    for (const node of nodes) {
      const entry = node.value
      const authorKey = b4a.toString(node.from.key, 'hex')
      if (entry.type === 'message') {
        const authorIdentity = writerIdentities.get(authorKey)
        if (authorIdentity && mutedIdentities.has(authorIdentity)) continue
        messageAuthors.set(entry.message.id, authorKey)
        await view.append(entry.message)
      } else if (entry.type === 'init') {
        if (owner.writerKey === null) {
          owner.writerKey = entry.ownerKey
          owner.identityId = entry.ownerIdentityId
          writerIdentities.set(entry.ownerKey, entry.ownerIdentityId)
          dirty = true
        }
      } else if (entry.type === 'addWriter') {
        if (authorKey !== owner.writerKey) continue
        await host.addWriter(b4a.from(entry.key, 'hex'))
        writerIdentities.set(entry.key, entry.identityId)
        dirty = true
      } else if (entry.type === 'removeWriter') {
        const role = roleOf(authorKey)
        if (role === 'member') continue
        const targetIdentity = writerIdentities.get(entry.key)
        if (role === 'mod' && isPrivileged(targetIdentity)) continue
        await host.removeWriter(b4a.from(entry.key, 'hex'))
        writerIdentities.delete(entry.key)
        if (targetIdentity) moderatorIdentities.delete(targetIdentity)
        dirty = true
      } else if (entry.type === 'edit') {
        if (authorKey !== messageAuthors.get(entry.messageId)) continue
        const state = overlayFor(overlay, entry.messageId)
        state.body = entry.body
        state.bodyEpoch = entry.keyEpoch
        state.edited = true
        onMessageMutation()
      } else if (entry.type === 'delete') {
        if (authorKey !== messageAuthors.get(entry.messageId)) continue
        overlayFor(overlay, entry.messageId).deleted = true
        onMessageMutation()
      } else if (entry.type === 'mute') {
        const role = roleOf(authorKey)
        if (role === 'member' || (role === 'mod' && isPrivileged(entry.identityId))) continue
        mutedIdentities.add(entry.identityId)
        dirty = true
        onMessageMutation()
      } else if (entry.type === 'unmute') {
        if (roleOf(authorKey) === 'member') continue
        mutedIdentities.delete(entry.identityId)
        dirty = true
        onMessageMutation()
      } else if (entry.type === 'ban') {
        const role = roleOf(authorKey)
        if (role === 'member' || (role === 'mod' && isPrivileged(entry.identityId))) continue
        bannedIdentities.add(entry.identityId)
        dirty = true
        onMessageMutation()
      } else if (entry.type === 'unban') {
        if (roleOf(authorKey) === 'member') continue
        bannedIdentities.delete(entry.identityId)
        dirty = true
        onMessageMutation()
      } else if (entry.type === 'promote') {
        if (authorKey !== owner.writerKey) continue
        moderatorIdentities.add(entry.identityId)
        dirty = true
        onMessageMutation()
      } else if (entry.type === 'demote') {
        if (authorKey !== owner.writerKey) continue
        moderatorIdentities.delete(entry.identityId)
        dirty = true
        onMessageMutation()
      } else if (entry.type === 'reaction') {
        const state = overlayFor(overlay, entry.messageId)
        const users = state.reactions.get(entry.emoji) ?? new Set<string>()
        if (users.has(entry.userId)) users.delete(entry.userId)
        else users.add(entry.userId)
        state.reactions.set(entry.emoji, users)
        onMessageMutation()
      } else if (entry.type === 'setMeta') {
        const role = roleOf(authorKey)
        if (role === 'owner' || role === 'mod') {
          if (entry.name !== undefined) meta.name = entry.name
          if (entry.avatar !== undefined) meta.avatar = entry.avatar
          if (entry.description !== undefined) meta.description = entry.description
          dirty = true
          onMessageMutation()
        }
      }
    }
    if (dirty) await persist()
  }
}

function openView(store: Corestore): AutobaseView {
  return store.get('view', { valueEncoding: 'json' })
}

function applyOverlay(message: ChatMessage, overlay: MessageOverlay): ChatMessage {
  const state = overlay.get(message.id)
  if (!state) return message
  const reactions: Record<string, string[]> | undefined = state.reactions.size
    ? Object.fromEntries([...state.reactions.entries()].filter(([, users]) => users.size > 0).map(([emoji, users]) => [emoji, [...users]]))
    : undefined
  return {
    ...message,
    body: state.deleted ? '' : (state.body ?? message.body),
    keyEpoch: state.bodyEpoch ?? message.keyEpoch,
    edited: state.edited,
    deleted: state.deleted,
    reactions: reactions && Object.keys(reactions).length > 0 ? reactions : undefined
  }
}

export class Room {
  readonly id: string
  private base!: Autobase<RoomEntry>
  private readonly owner: OwnerRef
  private readonly meta: RoomMetaRef
  private readonly writerIdentities: Map<string, string>
  private readonly overlay: MessageOverlay
  private readonly mutedIdentities: Set<string>
  private readonly bannedIdentities: Set<string>
  private readonly moderatorIdentities: Set<string>
  private mutationListeners: Array<() => void> = []
  /** Content-encryption keys, by epoch. Never written to the replicated log (would leak to any reader) — distributed peer-to-peer over RPC by Session. */
  private readonly contentKeys = new Map<number, Buffer>()
  private currentEpoch = -1
  private keyListeners: Array<(epoch: number, keyHex: string) => void> = []

  private constructor(id: string, owner: OwnerRef, meta: RoomMetaRef, writerIdentities: Map<string, string>, overlay: MessageOverlay, mutedIdentities: Set<string>, bannedIdentities: Set<string>, moderatorIdentities: Set<string>) {
    this.id = id
    this.owner = owner
    this.meta = meta
    this.writerIdentities = writerIdentities
    this.overlay = overlay
    this.mutedIdentities = mutedIdentities
    this.bannedIdentities = bannedIdentities
    this.moderatorIdentities = moderatorIdentities
  }

  get name(): string {
    return this.meta.name
  }

  get avatar(): string {
    return this.meta.avatar
  }

  get description(): string {
    return this.meta.description
  }

  async updateMeta(opts: { name?: string; avatar?: string; description?: string }): Promise<void> {
    await this.base.append({ type: 'setMeta', ...opts })
  }

  /** `parentStore` is the identity's single shared Corestore; the room lives in its own namespace so one Hyperswarm connection can replicate every room and drive together. */
  static async open(
    parentStore: Corestore,
    roomId: string | null,
    bootstrapKey: Buffer | null,
    identityId: string,
    initialKeys?: Array<{ epoch: number; keyHex: string }>,
    storeNamespace?: string
  ): Promise<Room> {
    const tempId = storeNamespace || roomId || (bootstrapKey ? b4a.toString(bootstrapKey, 'hex').slice(0, 16) : randomId(8))
    const store = parentStore.namespace(tempId)
    const owner: OwnerRef = { writerKey: null, identityId: null }
    const meta: RoomMetaRef = { name: '', avatar: '', description: '' }
    const writerIdentities = new Map<string, string>()
    const overlay: MessageOverlay = new Map()
    const messageAuthors = new Map<string, string>()
    const mutedIdentities = new Set<string>()
    const bannedIdentities = new Set<string>()
    const moderatorIdentities = new Set<string>()
    const room = new Room(tempId, owner, meta, writerIdentities, overlay, mutedIdentities, bannedIdentities, moderatorIdentities)

    const stateBee = new Hyperbee<PersistedRoomState>(store.get({ name: 'state' }), { keyEncoding: 'utf-8', valueEncoding: 'json' })
    await stateBee.ready()
    const persistedState = (await stateBee.get('room'))?.value
    if (persistedState) {
      owner.writerKey = persistedState.ownerWriterKey
      owner.identityId = persistedState.ownerIdentityId
      meta.name = persistedState.meta.name
      meta.avatar = persistedState.meta.avatar
      meta.description = persistedState.meta.description
      for (const [k, v] of persistedState.writerIdentities) writerIdentities.set(k, v)
      for (const id of persistedState.moderatorIdentities) moderatorIdentities.add(id)
      for (const id of persistedState.mutedIdentities) mutedIdentities.add(id)
      for (const id of persistedState.bannedIdentities) bannedIdentities.add(id)
    }
    const persist = () => stateBee.put('room', serializeRoomState(owner, meta, writerIdentities, moderatorIdentities, mutedIdentities, bannedIdentities))

    if (initialKeys && initialKeys.length > 0) {
      for (const k of initialKeys) {
        room.contentKeys.set(k.epoch, b4a.from(k.keyHex, 'hex'))
        if (k.epoch > room.currentEpoch) room.currentEpoch = k.epoch
      }
    }

    const base = new Autobase<RoomEntry>(store, bootstrapKey, {
      valueEncoding: 'json',
      open: openView,
      apply: makeApply(owner, meta, writerIdentities, overlay, messageAuthors, mutedIdentities, bannedIdentities, moderatorIdentities, () => room.notifyMutation(), persist)
    })
    room.base = base
    await base.ready()
    if (base.update) await base.update()

    const canonicalId = b4a.toString(base.key, 'hex').slice(0, 16)
    ;(room as { id: string }).id = canonicalId

    if (bootstrapKey === null && room.currentEpoch === -1) {
      const key = b4a.toString(base.local.key, 'hex')
      owner.writerKey = key
      owner.identityId = identityId
      writerIdentities.set(key, identityId)
      await base.append({ type: 'init', ownerKey: key, ownerIdentityId: identityId })
      await persist()
      const contentKey = b4a.allocUnsafe(sodium.crypto_secretbox_KEYBYTES)
      sodium.randombytes_buf(contentKey)
      room.contentKeys.set(0, contentKey)

      room.currentEpoch = 0
    }
    return room
  }

  private notifyMutation(): void {
    for (const listener of this.mutationListeners) listener()
  }

  /** `base.activeWriters` is Autobase's internal writer-core bookkeeping (it always includes the local replica's own writer core, even before the owner approves it) — not an ACL. `writerIdentities` is: populated only from `init`/owner-authorized `addWriter` log entries and pruned on `removeWriter`, so its key set is the actual authorized-writer set. */
  listMembers(): MemberInfo[] {
    return [...this.writerIdentities.entries()].map(([writerKey, identityId]) => ({ writerKey, identityId }))
  }

  get ownerId(): string | null {
    return this.owner.identityId
  }

  isOwner(identityId: string): boolean {
    return this.owner.identityId === identityId
  }

  isModerator(identityId: string): boolean {
    return this.moderatorIdentities.has(identityId)
  }

  listModerators(): string[] {
    return [...this.moderatorIdentities]
  }

  /** Whether `identityId` may kick/ban/mute other plain members (owner or moderator). */
  canModerate(identityId: string): boolean {
    return this.isOwner(identityId) || this.isModerator(identityId)
  }

  /** Owner-only (enforced in `apply()`). */
  async promote(identityId: string): Promise<void> {
    await this.base.append({ type: 'promote', identityId })
  }

  /** Owner-only (enforced in `apply()`). */
  async demote(identityId: string): Promise<void> {
    await this.base.append({ type: 'demote', identityId })
  }

  get bootstrapKey(): Buffer { return this.base.key }
  get localWriterKey(): Buffer { return this.base.local.key }
  get writable(): boolean { return this.base.writable }
  get messageCount(): number { return this.base.view.length }
  /** Whether a content-encryption key has been received yet; sending requires this in addition to `writable`. */
  get hasKey(): boolean { return this.currentEpoch >= 0 }
  get keyEpoch(): number { return this.currentEpoch }
  get currentKeyHex(): string | null {
    const key = this.contentKeys.get(this.currentEpoch)
    return key ? b4a.toString(key, 'hex') : null
  }

  /** Stores a content key received via RPC from the owner (on write grant, kick-triggered rotation, or reconnect sync). */
  receiveKey(epoch: number, keyHex: string): void {
    this.contentKeys.set(epoch, b4a.from(keyHex, 'hex'))
    if (epoch > this.currentEpoch) this.currentEpoch = epoch
    for (const listener of this.keyListeners) listener(epoch, keyHex)
  }

  onKeyChange(listener: (epoch: number, keyHex: string) => void): void {
    this.keyListeners.push(listener)
  }

  /** Owner-only (enforced by caller): generates and adopts a new epoch key, e.g. after kicking a member, so they lose access to future content. Caller is responsible for distributing it to remaining members via RPC. */
  rotateKey(): { epoch: number, keyHex: string } {
    const epoch = this.currentEpoch + 1
    const key = b4a.allocUnsafe(sodium.crypto_secretbox_KEYBYTES)
    sodium.randombytes_buf(key)
    this.contentKeys.set(epoch, key)
    this.currentEpoch = epoch
    const keyHex = b4a.toString(key, 'hex')
    for (const listener of this.keyListeners) listener(epoch, keyHex)
    return { epoch, keyHex }
  }

  private encryptText(plain: string): { body: string, keyEpoch: number } {
    if (this.currentEpoch < 0) throw new Error('no room key yet')
    const key = this.contentKeys.get(this.currentEpoch)!
    const plainBuf = b4a.from(plain, 'utf8')
    const nonce = b4a.allocUnsafe(sodium.crypto_secretbox_NONCEBYTES)
    sodium.randombytes_buf(nonce)
    const cipher = b4a.allocUnsafe(plainBuf.byteLength + sodium.crypto_secretbox_MACBYTES)
    sodium.crypto_secretbox_easy(cipher, plainBuf, nonce, key)
    return { body: b4a.toString(nonce, 'hex') + b4a.toString(cipher, 'hex'), keyEpoch: this.currentEpoch }
  }

  /** `undefined` epoch means the message predates encryption (legacy plaintext) — returned as-is. Missing key or corrupt ciphertext yields a placeholder rather than throwing. */
  private decryptText(body: string, keyEpoch: number | undefined): string {
    if (keyEpoch === undefined) return body
    const key = this.contentKeys.get(keyEpoch)
    if (!key) return '\u{1F512} locked message'
    try {
      const raw = b4a.from(body, 'hex')
      const nonceLen = sodium.crypto_secretbox_NONCEBYTES
      const nonce = raw.subarray(0, nonceLen)
      const cipher = raw.subarray(nonceLen)
      const plain = b4a.allocUnsafe(cipher.byteLength - sodium.crypto_secretbox_MACBYTES)
      const ok = sodium.crypto_secretbox_open_easy(plain, cipher, nonce, key)
      return ok === false ? '\u{1F512} decryption failed' : b4a.toString(plain, 'utf8')
    } catch {
      return '\u{1F512} decryption failed'
    }
  }

  async addWriter(publicKey: Buffer, identityId: string): Promise<void> {
    await this.base.append({ type: 'addWriter', key: b4a.toString(publicKey, 'hex'), identityId })
  }

  async removeWriter(publicKey: Buffer): Promise<void> {
    await this.base.append({ type: 'removeWriter', key: b4a.toString(publicKey, 'hex') })
  }

  isMuted(identityId: string): boolean {
    return this.mutedIdentities.has(identityId)
  }

  listMuted(): string[] {
    return [...this.mutedIdentities]
  }

  async muteMember(identityId: string): Promise<void> {
    await this.base.append({ type: 'mute', identityId })
  }

  async unmuteMember(identityId: string): Promise<void> {
    await this.base.append({ type: 'unmute', identityId })
  }

  /** Blocks future write-grants for this identity — checked by `Session`'s `onRequestWrite` handler. Owner/mod-only and mod-vs-owner/mod protected, enforced in `apply()`. Does not itself revoke an existing writer; pair with `removeWriter`. */
  isBanned(identityId: string): boolean {
    return this.bannedIdentities.has(identityId)
  }

  listBanned(): string[] {
    return [...this.bannedIdentities]
  }

  async banMember(identityId: string): Promise<void> {
    await this.base.append({ type: 'ban', identityId })
  }

  async unbanMember(identityId: string): Promise<void> {
    await this.base.append({ type: 'unban', identityId })
  }

  async send(authorId: string, body: string, replyTo?: string): Promise<ChatMessage> {
    if (this.mutedIdentities.has(authorId)) throw new Error('You are muted in this room')
    const encrypted = this.encryptText(body)
    const message: ChatMessage = {
      id: randomId(),
      roomId: this.id,
      authorId,
      body: encrypted.body,
      keyEpoch: encrypted.keyEpoch,
      timestamp: Date.now(),
      replyTo
    }
    await this.base.append({ type: 'message', message })
    return { ...message, body }
  }

  async sendFile(authorId: string, file: FileAttachment, body = ''): Promise<ChatMessage> {
    if (this.mutedIdentities.has(authorId)) throw new Error('You are muted in this room')
    const encrypted = this.encryptText(body)
    const message: ChatMessage = {
      id: randomId(),
      roomId: this.id,
      authorId,
      body: encrypted.body,
      keyEpoch: encrypted.keyEpoch,
      timestamp: Date.now(),
      file
    }
    await this.base.append({ type: 'message', message })
    return { ...message, body }
  }

  async editMessage(messageId: string, body: string): Promise<void> {
    const encrypted = this.encryptText(body)
    await this.base.append({ type: 'edit', messageId, body: encrypted.body, keyEpoch: encrypted.keyEpoch })
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.base.append({ type: 'delete', messageId })
  }

  async toggleReaction(userId: string, messageId: string, emoji: string): Promise<void> {
    await this.base.append({ type: 'reaction', messageId, userId, emoji })
  }

  async getMessage(index: number): Promise<ChatMessage> {
    try {
      const raw = await this.base.view.get(index) as ChatMessage
      const merged = applyOverlay(raw, this.overlay)
      if (merged.deleted) return merged
      return { ...merged, body: this.decryptText(merged.body, merged.keyEpoch) }
    } catch {
      return { id: `err-${index}`, roomId: this.id, authorId: '', body: '\u26A0\uFE0F message unavailable', timestamp: 0 }
    }
  }

  async *messages(): AsyncIterable<ChatMessage> {
    for (let i = 0; i < this.base.view.length; i++) yield await this.getMessage(i)
  }

  onMessage(listener: (index: number) => void): void {
    this.base.view.on('append', () => listener(this.base.view.length - 1))
    this.mutationListeners.push(() => listener(this.base.view.length - 1))
  }

  /** Fires only for genuinely new messages (view append), not edits/deletes/reactions — unlike `onMessage`, which fires for both. Used for desktop notifications, where a mutation to an old message shouldn't ping the user. */
  onNewMessage(listener: (message: ChatMessage) => void): void {
    this.base.view.on('append', () => { void this.getMessage(this.base.view.length - 1).then(listener).catch(() => {}) })
  }

  onWritableChange(listener: () => void): void {
    this.base.on('writable', listener)
    this.base.on('unwritable', listener)
  }

  async close(): Promise<void> {
    await this.base.close()
  }
}
