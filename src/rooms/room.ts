import { EventEmitter } from 'node:events'
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

/** A file shared in the room, derived from the chat message that carried it. There is no separate
 * upload channel: every `sendFile` leaves one of these behind, keyed by the message id, so the
 * Files tab is a second view over the message log rather than a store of its own. */
export interface RoomFile {
  messageId: string
  path: string
  name: string
  size: number
  mimeType?: string
  authorId: string
  timestamp: number
  driveKey?: string
}

type RoomEntry =
  | { type: 'message'; message: ChatMessage }
  | { type: 'edit'; messageId: string; body: string; keyEpoch: number }
  | { type: 'delete'; messageId: string }
  /** `op` absent = legacy toggle entry. A toggle is not idempotent, and Autobase re-runs `apply()`
   * over already-applied entries after a reorg (see `undo()` in autobase/lib/apply-state.js), which
   * would flip such a reaction back off. New entries state the intended end result instead. */
  | { type: 'reaction'; messageId: string; userId: string; emoji: string; op?: 'add' | 'remove' }
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
  | { type: 'setBroadcast'; enabled: boolean }

interface OwnerRef {
  writerKey: string | null
  identityId: string | null
}

interface RoomMetaRef {
  name: string
  avatar: string
  description: string
}

/** Kept apart from `RoomMetaRef`, whose fields are mirrored out to room-list bookmarks: this one
 * decides who may post, so it is authorization state rather than presentation. */
interface RoomModeRef {
  /** Only the owner and moderators may post. Enforced in `apply()`, so a patched client that
   * appends a message anyway just has it dropped when peers linearize the log. */
  broadcast: boolean
}

/** The room's membership/moderation/meta state as derived by `apply()`, stored as one record in the
 * state view. Small and rewritten whole on every change, unlike the per-message records beside it. */
interface PersistedRoomState {
  ownerWriterKey: string | null
  ownerIdentityId: string | null
  meta: RoomMetaRef
  /** Absent on records written before broadcast rooms existed; read as `false`. */
  broadcast?: boolean
  writerIdentities: Array<[string, string]>
  moderatorIdentities: string[]
  mutedIdentities: string[]
  bannedIdentities: string[]
}

function serializeRoomState(owner: OwnerRef, meta: RoomMetaRef, mode: RoomModeRef, writerIdentities: Map<string, string>, moderatorIdentities: Set<string>, mutedIdentities: Set<string>, bannedIdentities: Set<string>): PersistedRoomState {
  return {
    ownerWriterKey: owner.writerKey,
    ownerIdentityId: owner.identityId,
    meta: { ...meta },
    broadcast: mode.broadcast,
    writerIdentities: [...writerIdentities.entries()],
    moderatorIdentities: [...moderatorIdentities],
    mutedIdentities: [...mutedIdentities],
    bannedIdentities: [...bannedIdentities]
  }
}


function hydrateRoomState(state: PersistedRoomState, owner: OwnerRef, meta: RoomMetaRef, mode: RoomModeRef, writerIdentities: Map<string, string>, moderatorIdentities: Set<string>, mutedIdentities: Set<string>, bannedIdentities: Set<string>): void {
  owner.writerKey = state.ownerWriterKey
  owner.identityId = state.ownerIdentityId
  meta.name = state.meta.name
  meta.avatar = state.meta.avatar
  meta.description = state.meta.description
  mode.broadcast = state.broadcast ?? false
  writerIdentities.clear()
  for (const [key, id] of state.writerIdentities) writerIdentities.set(key, id)
  moderatorIdentities.clear()
  for (const id of state.moderatorIdentities) moderatorIdentities.add(id)
  mutedIdentities.clear()
  for (const id of state.mutedIdentities) mutedIdentities.add(id)
  bannedIdentities.clear()
  for (const id of state.bannedIdentities) bannedIdentities.add(id)
}

/** Mutable per-message state replayed from edit/delete/reaction entries; the raw message appended to the message view stays immutable. */
interface PersistedOverlay {
  body?: string
  bodyEpoch?: number
  edited?: boolean
  deleted?: boolean
  /** emoji -> identity ids that reacted with it. */
  reactions: Record<string, string[]>
}

type RoomStateRecord =
  | { kind: 'room'; state: PersistedRoomState }
  /** The writer core that appended a message, captured when `apply()` linearized it. The only
   * unforgeable message-to-author binding there is, and what edit/delete authorization checks. */
  | { kind: 'author'; writerKey: string }
  | { kind: 'overlay'; overlay: PersistedOverlay }
  | { kind: 'roomFile'; file: RoomFile }

const ROOM_KEY = 'room'
const authorKeyFor = (messageId: string) => `author/${messageId}`
const overlayKeyFor = (messageId: string) => `overlay/${messageId}`
/** Keyed by message id, not drive path: deleting a message must find and drop its file record
 * without scanning, and a path is not guaranteed unique across re-uploads of the same name. */
const fileKeyFor = (messageId: string) => `file/${messageId}`

/** Everything `apply()` derives from the log. Autobase owns both cores: it truncates them back to
 * the fork point on a reorg and keeps them across a reopen, so derived state written here is
 * rewound and restored by the runtime. Derived state kept in JS closures gets neither — Autobase
 * checkpoints applied entries and never replays them, so a reopen silently lost it. */
interface RoomView {
  messages: AutobaseView
  state: Hyperbee<RoomStateRecord>
}

function openView(store: Corestore): RoomView {
  return {
    messages: store.get('view', { valueEncoding: 'json' }),
    state: new Hyperbee<RoomStateRecord>(store.get('state'), { keyEncoding: 'utf-8', valueEncoding: 'json' })
  }
}

async function readOverlay(state: Hyperbee<RoomStateRecord>, messageId: string): Promise<PersistedOverlay | null> {
  const record = (await state.get(overlayKeyFor(messageId)))?.value
  return record?.kind === 'overlay' ? record.overlay : null
}

/** Window over which mutation notifications from one Autobase batch are collapsed into one. Long
 * enough to swallow a sync burst, short enough to stay imperceptible in the UI. */
const MUTATION_NOTIFY_MS = 16

/** owner: full control. mod: can kick/ban/mute plain members, never the owner or another mod. member: none of the above. */
type Role = 'owner' | 'mod' | 'member'

function makeApply(
  owner: OwnerRef,
  meta: RoomMetaRef,
  mode: RoomModeRef,
  writerIdentities: Map<string, string>,
  mutedIdentities: Set<string>,
  bannedIdentities: Set<string>,
  moderatorIdentities: Set<string>,
  /** Owner key already established before this Autobase was constructed — for rooms created before
   * the state view existed, whose `init` entry is checkpointed and will never be applied again. */
  seededOwnerKey: string | null,
  /** `messageId` names the one message whose rendered form changed, so callers can invalidate just
   * that entry; omitted means "something broader changed, assume everything is stale". */
  onMessageMutation: (messageId?: string) => void,
  onMetaChange: () => void,
  onFilesChange: () => void,
  /** Reloads the in-memory mirror if Autobase rewound the state view under it. Awaited before any
   * entry is processed, so a reorg can never land halfway through a re-apply. */
  refreshState: (state: Hyperbee<RoomStateRecord>) => Promise<void>
) {
  function roleOf(authorKey: string): Role {
    if (authorKey === owner.writerKey) return 'owner'
    const id = writerIdentities.get(authorKey)
    return id !== undefined && moderatorIdentities.has(id) ? 'mod' : 'member'
  }
  function isPrivileged(identityId: string | undefined): boolean {
    return identityId !== undefined && (identityId === owner.identityId || moderatorIdentities.has(identityId))
  }

  return async function applyEntries(nodes: AutobaseNode<RoomEntry>[], view: RoomView, host: AutobaseApplyHost): Promise<void> {
    const state = view.state
    await refreshState(state)

    /** Rewritten after every change rather than once per batch: Autobase rewinds a view to any past
     * length, so each entry that alters this state must leave its own restorable snapshot. */
    const persist = () => state.put(ROOM_KEY, { kind: 'room', state: serializeRoomState(owner, meta, mode, writerIdentities, moderatorIdentities, mutedIdentities, bannedIdentities) })

    async function authorOf(messageId: string): Promise<string | undefined> {
      const record = (await state.get(authorKeyFor(messageId)))?.value
      return record?.kind === 'author' ? record.writerKey : undefined
    }
    async function mutateOverlay(messageId: string, mutate: (overlay: PersistedOverlay) => void): Promise<void> {
      const overlay = (await readOverlay(state, messageId)) ?? { reactions: {} }
      mutate(overlay)
      await state.put(overlayKeyFor(messageId), { kind: 'overlay', overlay })
      onMessageMutation(messageId)
    }

    for (const node of nodes) {
      const entry = node.value
      const authorKey = b4a.toString(node.from.key, 'hex')
      if (entry.type === 'message') {
        const authorIdentity = writerIdentities.get(authorKey)
        if (authorIdentity && (mutedIdentities.has(authorIdentity) || bannedIdentities.has(authorIdentity))) continue
        if (mode.broadcast && roleOf(authorKey) === 'member') continue
        await state.put(authorKeyFor(entry.message.id), { kind: 'author', writerKey: authorKey })
        await view.messages.append(entry.message)
        // The Files tab reads these; writing one here rather than from a separate upload entry is
        // what keeps the two views from ever disagreeing about what the room holds.
        const attachment = entry.message.file
        if (attachment) {
          await state.put(fileKeyFor(entry.message.id), {
            kind: 'roomFile',
            file: {
              messageId: entry.message.id,
              path: attachment.path,
              name: attachment.name,
              size: attachment.size,
              mimeType: attachment.mimeType,
              authorId: entry.message.authorId,
              timestamp: entry.message.timestamp,
              driveKey: attachment.driveKey
            }
          })
          onFilesChange()
        }
      } else if (entry.type === 'init') {
        // Only the first `init` establishes ownership; any later one is a second writer trying to
        // take the room over. "First" is decided against the durable record, not the in-memory
        // mirror — the mirror starts empty on every reopen, which would re-open that window.
        if (seededOwnerKey !== null) continue
        const record = (await state.get(ROOM_KEY))?.value
        if (record?.kind === 'room' && record.state.ownerWriterKey !== null) continue
        owner.writerKey = entry.ownerKey
        owner.identityId = entry.ownerIdentityId
        writerIdentities.set(entry.ownerKey, entry.ownerIdentityId)
        await persist()
      } else if (entry.type === 'addWriter') {
        if (authorKey !== owner.writerKey) continue
        await host.addWriter(b4a.from(entry.key, 'hex'))
        writerIdentities.set(entry.key, entry.identityId)
        await persist()
      } else if (entry.type === 'removeWriter') {
        const role = roleOf(authorKey)
        const targetIdentity = writerIdentities.get(entry.key)
        // Leaving is not a moderation action. Only owners and moderators could remove a writer,
        // which meant a plain member could not remove *themselves* either — so leaving a room was
        // purely local and everyone else went on listing you as a member forever. Removing your
        // own key is now always allowed.
        //
        // The owner is excluded deliberately: they are the room's only source of write grants and
        // content keys, so an owner dropping their own key would strand every remaining member
        // with no way to admit anyone or rotate anything. An owner who wants out deletes the room.
        const isSelfRemoval = authorKey === entry.key && authorKey !== owner.writerKey
        if (!isSelfRemoval) {
          if (role === 'member') continue
          if (role === 'mod' && isPrivileged(targetIdentity)) continue
        }
        await host.removeWriter(b4a.from(entry.key, 'hex'))
        writerIdentities.delete(entry.key)
        if (targetIdentity) moderatorIdentities.delete(targetIdentity)
        await persist()
      } else if (entry.type === 'edit') {
        if (authorKey !== await authorOf(entry.messageId)) continue
        await mutateOverlay(entry.messageId, (overlay) => {
          overlay.body = entry.body
          overlay.bodyEpoch = entry.keyEpoch
          overlay.edited = true
        })
      } else if (entry.type === 'delete') {
        // Widened from author-only when the vault folded into the message log. The vault let
        // moderators remove someone else's file; deleting the message is now the only way to do
        // that, so restricting this to the author would have quietly dropped the moderation.
        if (authorKey !== await authorOf(entry.messageId) && roleOf(authorKey) === 'member') continue
        await mutateOverlay(entry.messageId, (overlay) => { overlay.deleted = true })
        if ((await state.get(fileKeyFor(entry.messageId)))?.value?.kind === 'roomFile') {
          await state.del(fileKeyFor(entry.messageId))
          onFilesChange()
        }
      } else if (entry.type === 'mute') {
        const role = roleOf(authorKey)
        if (role === 'member' || (role === 'mod' && isPrivileged(entry.identityId))) continue
        mutedIdentities.add(entry.identityId)
        await persist()
        onMessageMutation()
      } else if (entry.type === 'unmute') {
        if (roleOf(authorKey) === 'member') continue
        mutedIdentities.delete(entry.identityId)
        await persist()
        onMessageMutation()
      } else if (entry.type === 'ban') {
        const role = roleOf(authorKey)
        if (role === 'member' || (role === 'mod' && isPrivileged(entry.identityId))) continue
        bannedIdentities.add(entry.identityId)
        await persist()
        onMessageMutation()
      } else if (entry.type === 'unban') {
        if (roleOf(authorKey) === 'member') continue
        bannedIdentities.delete(entry.identityId)
        await persist()
        onMessageMutation()
      } else if (entry.type === 'promote') {
        if (authorKey !== owner.writerKey) continue
        moderatorIdentities.add(entry.identityId)
        await persist()
        onMessageMutation()
      } else if (entry.type === 'demote') {
        if (authorKey !== owner.writerKey) continue
        moderatorIdentities.delete(entry.identityId)
        await persist()
        onMessageMutation()
      } else if (entry.type === 'reaction') {
        await mutateOverlay(entry.messageId, (overlay) => {
          const users = new Set(overlay.reactions[entry.emoji] ?? [])
          const add = entry.op === undefined ? !users.has(entry.userId) : entry.op === 'add'
          if (add) users.add(entry.userId)
          else users.delete(entry.userId)
          overlay.reactions[entry.emoji] = [...users]
        })
      } else if (entry.type === 'setMeta') {
        const role = roleOf(authorKey)
        if (role === 'owner' || role === 'mod') {
          if (entry.name !== undefined) meta.name = entry.name
          if (entry.avatar !== undefined) meta.avatar = entry.avatar
          if (entry.description !== undefined) meta.description = entry.description
          await persist()
          onMessageMutation()
          onMetaChange()
        }
      } else if (entry.type === 'setBroadcast') {
        // Owner-only, unlike `setMeta`: this decides who may post at all, and a moderator flipping
        // it off would hand every member the write access the owner deliberately withheld.
        if (authorKey !== owner.writerKey) continue
        mode.broadcast = entry.enabled
        await persist()
        onMetaChange()
      }
    }
  }
}

function applyOverlay(message: ChatMessage, overlay: PersistedOverlay | null): ChatMessage {
  if (!overlay) return message
  const reactions = Object.fromEntries(Object.entries(overlay.reactions).filter(([, users]) => users.length > 0))
  return {
    ...message,
    body: overlay.deleted ? '' : (overlay.body ?? message.body),
    keyEpoch: overlay.bodyEpoch ?? message.keyEpoch,
    edited: overlay.edited,
    deleted: overlay.deleted,
    reactions: Object.keys(reactions).length > 0 ? reactions : undefined
  }
}

export class Room {
  readonly id: string
  private base!: Autobase<RoomEntry, RoomView>
  private readonly owner: OwnerRef
  private readonly meta: RoomMetaRef
  private readonly mode: RoomModeRef
  private readonly writerIdentities: Map<string, string>
  private readonly mutedIdentities: Set<string>
  private readonly bannedIdentities: Set<string>
  private readonly moderatorIdentities: Set<string>
  private readonly events = new EventEmitter()
  private readonly pendingMutationIds = new Set<string>()
  /** Content-encryption keys, by epoch. Never written to the replicated log (would leak to any reader) — distributed peer-to-peer over RPC by Session. */
  private readonly contentKeys = new Map<number, Buffer>()
  private currentEpoch = -1
  /** Decrypted, overlay-merged messages by view index. Reading a message costs a view read plus a
   * secretbox open, and the UI re-reads the room on every redraw — without this, a room's whole
   * history was decrypted again on each incoming message. */
  private readonly messageCache = new Map<number, ChatMessage>()
  private readonly messageIndexById = new Map<string, number>()
  private mutationNotifyTimer: ReturnType<typeof setTimeout> | null = null
  /** Set when Autobase truncates the state view, cleared once the mirror below has been reloaded from it. */
  private stateRewound = false

  private constructor(id: string, owner: OwnerRef, meta: RoomMetaRef, mode: RoomModeRef, writerIdentities: Map<string, string>, mutedIdentities: Set<string>, bannedIdentities: Set<string>, moderatorIdentities: Set<string>) {
    this.id = id
    this.owner = owner
    this.meta = meta
    this.mode = mode
    this.writerIdentities = writerIdentities
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

  /** Broadcast room: everyone can read and react, only the owner and moderators can post. */
  get isBroadcast(): boolean {
    return this.mode.broadcast
  }

  /** Whether this identity's messages would survive `apply()`. Mirrors the gates there, so the UI
   * can hide the composer instead of letting a message be appended and silently dropped. */
  canPost(identityId: string): boolean {
    if (this.mutedIdentities.has(identityId) || this.bannedIdentities.has(identityId)) return false
    return !this.mode.broadcast || this.canModerate(identityId)
  }

  /** Owner-only (enforced in `apply()`). */
  async setBroadcast(enabled: boolean): Promise<void> {
    await this.base.append({ type: 'setBroadcast', enabled })
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
    const mode: RoomModeRef = { broadcast: false }
    const writerIdentities = new Map<string, string>()
    const mutedIdentities = new Set<string>()
    const bannedIdentities = new Set<string>()
    const moderatorIdentities = new Set<string>()
    const room = new Room(tempId, owner, meta, mode, writerIdentities, mutedIdentities, bannedIdentities, moderatorIdentities)

    // Rooms created before the state view existed kept this state in a Hyperbee alongside Autobase.
    // Their log entries are checkpointed and will never be applied again, so that copy is the only
    // record of who owns them — read it once as the seed. Nothing writes here any more; the state
    // view takes over as soon as a single entry mutates the room.
    const legacyStateBee = new Hyperbee<PersistedRoomState>(store.get({ name: 'state' }), { keyEncoding: 'utf-8', valueEncoding: 'json' })
    await legacyStateBee.ready()
    const legacyState = (await legacyStateBee.get('room'))?.value
    if (legacyState) hydrateRoomState(legacyState, owner, meta, mode, writerIdentities, moderatorIdentities, mutedIdentities, bannedIdentities)
    const seededOwnerKey = owner.writerKey

    if (initialKeys && initialKeys.length > 0) {
      for (const k of initialKeys) {
        room.contentKeys.set(k.epoch, b4a.from(k.keyHex, 'hex'))
        if (k.epoch > room.currentEpoch) room.currentEpoch = k.epoch
      }
    }

    const base = new Autobase<RoomEntry, RoomView>(store, bootstrapKey, {
      valueEncoding: 'json',
      open: openView,
      apply: makeApply(owner, meta, mode, writerIdentities, mutedIdentities, bannedIdentities, moderatorIdentities, seededOwnerKey, (messageId) => room.notifyMutation(messageId), () => room.notifyMetaChange(), () => room.notifyFilesChange(), (state) => room.refreshState(state))
    })
    room.base = base
    // The mirror starts empty, and Autobase never replays checkpointed entries that would refill
    // it — so the first thing to touch it, whether that is an `apply()` during `ready()` or the
    // explicit refresh below, has to load it from the state view.
    room.stateRewound = true
    await base.ready()
    await room.refreshState(base.view.state)
    // A reorg makes Autobase truncate the views and re-apply from the fork point, so every cached
    // message at or past the truncation point may now be a different message entirely, and the
    // room state mirrored in memory is now ahead of the state view it was derived from.
    base.view.messages.on('truncate', () => room.invalidateMessage())
    base.view.state.core.on('truncate', () => {
      room.stateRewound = true
      void room.refreshState(base.view.state)
    })
    if (base.update) await base.update()

    const canonicalId = b4a.toString(base.key, 'hex').slice(0, 16)
    ;(room as { id: string }).id = canonicalId

    if (bootstrapKey === null && room.currentEpoch === -1) {
      const key = b4a.toString(base.local.key, 'hex')
      owner.writerKey = key
      owner.identityId = identityId
      writerIdentities.set(key, identityId)
      await base.append({ type: 'init', ownerKey: key, ownerIdentityId: identityId })
      const contentKey = b4a.allocUnsafe(sodium.crypto_secretbox_KEYBYTES)
      sodium.randombytes_buf(contentKey)
      room.contentKeys.set(0, contentKey)

      room.currentEpoch = 0
    }
    return room
  }

  /** Membership, moderation and meta are mirrored in memory so the getters that report them can
   * stay synchronous; the state view holds the durable copy `apply()` writes alongside. Reload the
   * mirror whenever Autobase may have rewound that view — reading the record first and assigning
   * from it without awaiting keeps a second caller from overwriting a reload already applied.
   * A missing record means nothing has been written yet, so whatever the mirror holds (a
   * pre-state-view room's seed, or an in-flight `init`) is still the best answer. */
  private async refreshState(state: Hyperbee<RoomStateRecord>): Promise<void> {
    if (!this.stateRewound) return
    const record = (await state.get(ROOM_KEY))?.value
    if (!this.stateRewound) return
    this.stateRewound = false
    if (record?.kind !== 'room') return
    hydrateRoomState(record.state, this.owner, this.meta, this.mode, this.writerIdentities, this.moderatorIdentities, this.mutedIdentities, this.bannedIdentities)
    this.invalidateMessage()
    this.notifyMetaChange()
  }

  /** Autobase hands `apply()` a whole linearization batch at once, so a sync burst used to fire one
   * notification per entry — and every consumer redrew that many times. Drop the stale cache
   * entries immediately, but collapse the burst into a single notification. */
  private notifyMutation(messageId?: string): void {
    this.invalidateMessage(messageId)
    if (messageId !== undefined) this.pendingMutationIds.add(messageId)
    if (this.mutationNotifyTimer !== null) return
    this.mutationNotifyTimer = setTimeout(() => {
      this.mutationNotifyTimer = null
      const ids = [...this.pendingMutationIds]
      this.pendingMutationIds.clear()
      // Resolve each mutated message to its view index — only messages already read once
      // (i.e. currently rendered somewhere) are in this map, which is exactly the set a
      // listener can usefully redraw. Falls back to the tail so an untraceable change
      // (e.g. a full state rewind, where messageId is unknown) still triggers a redraw.
      const indexes = new Set(ids.map((id) => this.messageIndexById.get(id)).filter((i): i is number => i !== undefined))
      if (indexes.size === 0) indexes.add(this.base.view.messages.length - 1)
      for (const index of indexes) this.events.emit('mutation', index)
    }, MUTATION_NOTIFY_MS)
  }

  /** Without a `messageId` the change wasn't traceable to one message, so nothing cached can be trusted. */
  private invalidateMessage(messageId?: string): void {
    if (messageId === undefined) {
      this.messageCache.clear()
      this.messageIndexById.clear()
      return
    }
    const index = this.messageIndexById.get(messageId)
    if (index !== undefined) this.messageCache.delete(index)
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
  get messageCount(): number { return this.base.view.messages.length }
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
    // Anything read before this key arrived was cached as a locked-message placeholder.
    this.invalidateMessage()
    this.events.emit('key', epoch, keyHex)
  }

  onKeyChange(listener: (epoch: number, keyHex: string) => void): () => void {
    this.events.on('key', listener)
    return () => { this.events.off('key', listener) }
  }

  /** Owner-only (enforced by caller): generates and adopts a new epoch key, e.g. after kicking a member, so they lose access to future content. Caller is responsible for distributing it to remaining members via RPC. */
  rotateKey(): { epoch: number, keyHex: string } {
    const epoch = this.currentEpoch + 1
    const key = b4a.allocUnsafe(sodium.crypto_secretbox_KEYBYTES)
    sodium.randombytes_buf(key)
    this.contentKeys.set(epoch, key)
    this.currentEpoch = epoch
    const keyHex = b4a.toString(key, 'hex')
    this.events.emit('key', epoch, keyHex)
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

  /** Announces our departure to the room's other members. The owner cannot — see `apply()`. */
  async announceLeave(): Promise<void> {
    // Compared by writer key rather than identity: this is about the key being dropped, and the
    // owner check in apply() keys off the same thing.
    if (b4a.toString(this.base.local.key, 'hex') === this.owner.writerKey) return
    await this.removeWriter(this.base.local.key)
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
    if (this.bannedIdentities.has(authorId)) throw new Error('You are banned from this room')
    if (!this.canPost(authorId)) throw new Error('Only admins can post in a broadcast room')
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
    if (this.bannedIdentities.has(authorId)) throw new Error('You are banned from this room')
    if (!this.canPost(authorId)) throw new Error('Only admins can post in a broadcast room')
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
    const overlay = await readOverlay(this.base.view.state, messageId)
    const reacted = overlay?.reactions[emoji]?.includes(userId) ?? false
    await this.base.append({ type: 'reaction', messageId, userId, emoji, op: reacted ? 'remove' : 'add' })
  }

  async getMessage(index: number): Promise<ChatMessage> {
    const cached = this.messageCache.get(index)
    if (cached) return cached
    try {
      const raw = await this.base.view.messages.get(index) as ChatMessage
      const merged = applyOverlay(raw, await readOverlay(this.base.view.state, raw.id))
      const message = merged.deleted ? merged : { ...merged, body: this.decryptText(merged.body, merged.keyEpoch) }
      this.messageCache.set(index, message)
      this.messageIndexById.set(message.id, index)
      return message
    } catch {
      return { id: `err-${index}`, roomId: this.id, authorId: '', body: '\u26A0\uFE0F message unavailable', timestamp: 0 }
    }
  }

  /** Defaults to the full log; pass a range (e.g. the last N) to page a long history instead
   * of decrypting every message on every open. */
  async *messages(start = 0, end = this.messageCount): AsyncIterable<ChatMessage> {
    for (let i = start; i < end; i++) yield await this.getMessage(i)
  }

  /** The returned unsubscribe must be called when the caller stops caring about the room — every
   * registration that outlives its consumer keeps redrawing a dead view, and the cost multiplies
   * because each surviving listener re-triggers the same work on every incoming message. */
  onMessage(listener: (index: number) => void): () => void {
    const onAppend = () => listener(this.base.view.messages.length - 1)
    this.base.view.messages.on('append', onAppend)
    this.events.on('mutation', listener)
    return () => {
      this.base.view.messages.off('append', onAppend)
      this.events.off('mutation', listener)
    }
  }

  /** Fires when the room's name/avatar/description changes — including on a device that only
   * received the change over replication, not the one that made it. Lets callers keep any
   * cached copy of these fields (e.g. a room-list bookmark) in sync. */
  onMetaChange(listener: () => void): () => void {
    this.events.on('meta', listener)
    return () => { this.events.off('meta', listener) }
  }

  private notifyMetaChange(): void {
    this.events.emit('meta')
  }

  /** Every file ever sent to the room whose message has not been deleted, newest first. */
  async listFiles(): Promise<RoomFile[]> {
    const files: RoomFile[] = []
    const stream = this.base.view.state.createReadStream({
      gte: 'file/',
      lte: 'file/ÿ'
    })
    for await (const node of stream) {
      if (node.value && node.value.kind === 'roomFile') {
        files.push(node.value.file)
      }
    }
    return files.sort((a, b) => b.timestamp - a.timestamp)
  }

  /** The file a single message carried, or null. A direct key hit — a batch delete calls this once
   * per message, and a full `listFiles()` scan each time would make that quadratic. */
  async getFile(messageId: string): Promise<RoomFile | null> {
    const record = (await this.base.view.state.get(fileKeyFor(messageId)))?.value
    return record?.kind === 'roomFile' ? record.file : null
  }

  onFilesChange(listener: () => void): () => void {
    this.events.on('files', listener)
    return () => { this.events.off('files', listener) }
  }

  private notifyFilesChange(): void {
    this.events.emit('files')
  }

  /** Fires only for genuinely new messages (view append), not edits/deletes/reactions — unlike `onMessage`, which fires for both. Used for desktop notifications, where a mutation to an old message shouldn't ping the user. */
  onNewMessage(listener: (message: ChatMessage) => void): () => void {
    const onAppend = () => { void this.getMessage(this.base.view.messages.length - 1).then(listener) }
    this.base.view.messages.on('append', onAppend)
    return () => this.base.view.messages.off('append', onAppend)
  }

  onWritableChange(listener: () => void): () => void {
    this.base.on('writable', listener)
    this.base.on('unwritable', listener)
    return () => {
      this.base.off('writable', listener)
      this.base.off('unwritable', listener)
    }
  }

  async close(): Promise<void> {
    if (this.mutationNotifyTimer !== null) clearTimeout(this.mutationNotifyTimer)
    await this.base.close()
  }
}
