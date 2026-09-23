import fs from 'node:fs'
import path from 'node:path'
import { Session } from '../app/session.js'
import b4a from 'b4a'
import type { ChatMessage, FileAttachment, Room } from '../rooms/room.js'
import { TYPING_PING_MS } from '../rooms/room-rules.js'
import { MessageSegmenter, splitMessage } from './chunks.js'
import { createIdentity, identityExists, recoverIdentity, unlockIdentity, type Identity } from '../identity/index.js'
import type { SwarmTransport } from '../network/swarm.js'
import { decodeInvite, encodeInvite } from '../ui/qr-core.js'
import { parseCommand, type BotCommand } from './commands.js'
import type { BotCommandInfo } from './bot-profile.js'
import { BotAccessPolicy, roomIdOf, type BotAccess } from './access.js'

// ---------------------------------------------------------------------------
// A Linda bot: a peer with no screen.
//
// Telegram's bots talk to Telegram's servers. Linda has none, so a bot here is what every other
// participant is — an identity running a `Session`, a member of the rooms it has been let into,
// reading and writing messages like anyone else. What this module adds is what a program needs and
// a person does not: every message handed over exactly once, commands parsed, contacts accepted on
// its own, and a place to remember how far it has read across restarts.
//
// End-to-end encryption does not stop at a bot: it is a member, so it reads what is written where
// it is. That is the same trust a room gives any member, and why only someone who can invite can add
// one.
// ---------------------------------------------------------------------------

export interface BotOptions {
  /** Where the bot keeps its identity, its rooms and its read positions. One directory per bot. */
  storageDir: string
  /** Encrypts the identity at rest. */
  passphrase: string
  /** Recovers an existing identity on first start instead of creating a new one. */
  mnemonic?: string
  /** Set on start when it differs from the stored one. */
  nickname?: string
  /** Accept contact requests, so people can start a direct chat with the bot. Default true. Only
   * from `access.users`, when that is set. */
  acceptContacts?: boolean
  /** Who the bot listens to, and where — see `BotAccess`. Absent: everyone, everywhere. */
  access?: BotAccess
  /** Test seam: which DHT to bootstrap from — see `SwarmTransport`. */
  transport?: SwarmTransport
}

/** One message, handed to a handler. */
export interface BotContext {
  roomId: string
  message: ChatMessage
  /** The command the message is, if it starts with one — see `parseCommand`. */
  command: BotCommand | null
  /** The file attached to the message, if there is one. Its bytes are behind `download()`. */
  file: FileAttachment | null
  /**
   * Answers in the same room. A long text goes out as several messages, cut between paragraphs
   * (see `splitMessage`); the first is a reply to this message. Resolves with what was sent.
   */
  reply(text: string): Promise<ChatMessage[]>
  /**
   * An answer produced piece by piece — an LLM's tokens as they arrive. Each `write` adds text;
   * whole messages go out a paragraph or so at a time; `end` sends the rest. "Typing…" shows from
   * the first write until the end.
   */
  stream(): BotReplyStream
  /**
   * Shows "typing…" in the room until the returned function is called or the handler returns —
   * for an answer that takes a while to work out.
   */
  typing(): () => void
  /** The attached file's bytes, fetched from its sender; null when there is none or it cannot be reached. */
  download(): Promise<Uint8Array | null>
  /** Answers with a file, and an optional caption. */
  replyFile(file: { name: string; data: Uint8Array; mimeType?: string }, caption?: string): Promise<ChatMessage>
}

export interface BotReplyStream {
  write(fragment: string): Promise<void>
  end(): Promise<void>
}

export type BotHandler = (ctx: BotContext) => void | Promise<void>

/**
 * How far into a room the bot has read.
 *
 * `next` is the first message index not yet handled. `since` is when the bot first saw the room:
 * anything older is history it was not there for, and answering a week of old `/commands` the
 * moment it joins would be wrong. `recent` is the ids of the last messages handled — see `drain`.
 */
interface Cursor {
  next: number
  since: number
  recent: string[]
}

/**
 * How far back each pass re-reads.
 *
 * Autobase can reorder: when writers' logs are merged differently, the view is truncated and
 * re-appended, and a message can land at an index the bot has already passed. Re-reading a short
 * window and skipping ids already handled catches that without handling anything twice.
 */
const REREAD_WINDOW = 20

/** A pass over every room, for anything an event did not announce. */
const SWEEP_INTERVAL_MS = 30_000

const CURSORS_FILE = 'bot-cursors.json'

export class LindaBot {
  /** Only on the very first start: the recovery phrase for the identity just created. Keep it. */
  readonly createdMnemonic: string | null

  private readonly commands = new Map<string, BotHandler>()
  private readonly descriptions = new Map<string, string>()
  private profileQueued = false
  private readonly handlers: BotHandler[] = []
  private readonly cursors: Map<string, Cursor>
  /** One pass per room at a time; a pass asked for while one runs is folded into a single follow-up. */
  private readonly draining = new Map<string, Promise<void>>()
  private readonly pending = new Set<string>()
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  private closed = false
  private readonly access: BotAccessPolicy

  private constructor(
    readonly session: Session,
    readonly identity: Identity,
    private readonly options: BotOptions,
    createdMnemonic: string | null
  ) {
    this.createdMnemonic = createdMnemonic
    this.cursors = readCursors(options.storageDir)
    this.access = new BotAccessPolicy(options.access)
  }

  /** Opens (or creates) the bot's identity, starts its session and begins handling messages. */
  static async start(options: BotOptions): Promise<LindaBot> {
    // A malformed room list fails here, before anything is created, rather than after the session
    // is up.
    new BotAccessPolicy(options.access)
    fs.mkdirSync(options.storageDir, { recursive: true })
    let identity: Identity
    let createdMnemonic: string | null = null
    if (identityExists(options.storageDir)) {
      identity = unlockIdentity(options.passphrase, options.storageDir)
    } else if (options.mnemonic) {
      identity = recoverIdentity(options.mnemonic, options.passphrase, options.storageDir)
    } else {
      const created = createIdentity(options.passphrase, options.storageDir)
      identity = created.identity
      createdMnemonic = created.mnemonic
    }

    // The events reach the bot through this holder: the session has to exist before the bot that
    // listens to it does.
    let bot: LindaBot | null = null
    const session = await Session.create(identity, options.storageDir, {
      transport: options.transport,
      events: {
        onIncomingMessage: (roomId) => bot?.schedule(roomId),
        onBookmarksChange: () => bot?.scheduleAll(),
        onContactsChange: () => { void bot?.onContactsChange() }
      }
    })
    bot = new LindaBot(session, identity, options, createdMnemonic)
    try {
      if (options.nickname && session.getNickname() !== options.nickname) await session.setNickname(options.nickname)
      await session.reopenBookmarkedRooms()
      await bot.onContactsChange()
    } catch (err) {
      await session.close().catch(() => {})
      throw err
    }
    // A bot with no commands yet is still a bot: the badge should not wait for the first `command()`.
    bot.publishProfile()
    bot.scheduleAll()
    bot.sweepTimer = setInterval(() => bot?.scheduleAll(), SWEEP_INTERVAL_MS)
    bot.sweepTimer.unref?.()
    return bot
  }

  get id(): string {
    return this.identity.id
  }

  /**
   * Handles `/name …`. Registering a name twice replaces the first handler.
   *
   * The command is also announced: the apps show it when someone types `/` in a room the bot is
   * in, with `description` as its one line — see `bot/bot-profile.ts`.
   */
  command(name: string, handler: BotHandler, description = ''): this {
    const key = name.replace(/^\//, '').toLowerCase()
    this.commands.set(key, handler)
    this.descriptions.set(key, description)
    this.publishProfile()
    return this
  }

  /** The commands as announced to peers, in the order they were registered. */
  get announcedCommands(): BotCommandInfo[] {
    return [...this.descriptions].map(([name, description]) => ({ name, description }))
  }

  /** Tells every peer, once per burst of `command()` calls, that this is a bot and what it answers. */
  private publishProfile(): void {
    if (this.profileQueued || this.closed) return
    this.profileQueued = true
    queueMicrotask(() => {
      this.profileQueued = false
      if (!this.closed) this.session.setBotProfile({ commands: this.announcedCommands })
    })
  }

  /** Handles every message, commands included, after any command handler has run. */
  onMessage(handler: BotHandler): this {
    this.handlers.push(handler)
    return this
  }

  /**
   * A fresh `linda-pear://contact` link: whoever opens it gets a direct chat with the bot.
   *
   * One link per person — a contact link binds to the first identity that takes it up (see
   * `Session.createContactInvite`) — so hand out a new one each time.
   */
  async createContactLink(): Promise<string> {
    const { key } = await this.session.createContactInvite()
    return encodeInvite({ kind: 'contact', name: this.session.getNickname() || this.id.slice(0, 8), key, from: this.id })
  }

  /**
   * Joins a room from a `linda-pear://` link — a room invite or a contact link. Returns the room id.
   * Refuses, before joining anything, a room or a contact that `access` rules out.
   */
  async join(link: string): Promise<string> {
    const invite = decodeInvite(link)
    if (!invite) throw new Error('not a Linda invite link')
    if (invite.kind === 'contact' && invite.from) {
      if (!this.access.allowsUser(invite.from)) throw new Error('that contact is not on this bot\'s allowed list')
    } else {
      const roomId = roomIdOf(invite.key)
      if (!roomId || !this.access.allowsRoom(roomId, null)) throw new Error('that room is not on this bot\'s allowed list')
    }
    const room = invite.kind === 'contact' && invite.from
      ? await this.session.acceptContactInvite({ from: invite.from, name: invite.name, key: invite.key })
      : await this.session.joinRoomByKey(invite.name, invite.key)
    this.schedule(room.id)
    return room.id
  }

  /** Posts to a room the bot is a member of. */
  async send(roomId: string, text: string, replyTo?: string): Promise<ChatMessage> {
    const room = this.session.getRoom(roomId)
    if (!room) throw new Error(`not a member of room ${roomId}`)
    return room.send(this.id, text, replyTo)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.sweepTimer) clearInterval(this.sweepTimer)
    await Promise.allSettled([...this.draining.values()])
    writeCursors(this.options.storageDir, this.cursors)
    this.session.broadcastPresence(false)
    await this.session.close()
  }

  // ── Reading ─────────────────────────────────────────────────────────────

  private scheduleAll(): void {
    for (const bookmark of this.session.listBookmarks()) this.schedule(bookmark.id)
  }

  private schedule(roomId: string): void {
    if (this.closed) return
    if (this.draining.has(roomId)) {
      this.pending.add(roomId)
      return
    }
    const run = this.drain(roomId)
      .catch((err) => console.warn(`[bot] reading room ${roomId} failed:`, (err as Error).message))
      .finally(() => {
        this.draining.delete(roomId)
        if (this.pending.delete(roomId)) this.schedule(roomId)
      })
    this.draining.set(roomId, run)
  }

  /** Hands every message not yet handled in one room to the handlers, in order. */
  private async drain(roomId: string): Promise<void> {
    const room = this.session.getRoom(roomId)
    // Without the room key, bodies do not decrypt yet; the key arriving triggers another pass.
    if (!room || !room.hasKey) return

    let cursor = this.cursors.get(roomId)
    if (!cursor) {
      cursor = { next: 0, since: Date.now(), recent: [] }
      this.cursors.set(roomId, cursor)
    }
    const handled = new Set(cursor.recent)
    const count = room.messageCount
    let changed = false

    for (let i = Math.max(0, Math.min(cursor.next, count) - REREAD_WINDOW); i < count && !this.closed; i++) {
      const message = await room.getMessage(i)
      if (i >= cursor.next) {
        cursor.next = i + 1
        changed = true
      }
      if (handled.has(message.id)) continue
      if (!message.authorId || message.authorId === this.id || message.deleted || message.timestamp < cursor.since) continue
      // Passed over for good, like history: a user or room allowed later starts from then on.
      if (!this.access.allowsMessage(message.authorId, roomId, this.directChatWith(roomId))) continue
      handled.add(message.id)
      cursor.recent = [...cursor.recent, message.id].slice(-REREAD_WINDOW * 2)
      changed = true
      await this.dispatch(room, message)
    }

    if (changed) writeCursors(this.options.storageDir, this.cursors)
  }

  private async dispatch(room: Room, message: ChatMessage): Promise<void> {
    const command = parseCommand(message.body)

    // "Typing…" is sticky on the other side for `TYPING_STOP_MS`, so it is re-asserted every
    // `TYPING_PING_MS` for as long as the bot is working, and withdrawn as soon as it is not.
    let typingTimer: ReturnType<typeof setInterval> | null = null
    const setTyping = (typing: boolean) => this.session.sendTyping(room.id, this.id, typing)
    const stopTyping = () => {
      if (!typingTimer) return
      clearInterval(typingTimer)
      typingTimer = null
      setTyping(false)
    }
    const startTyping = () => {
      if (!typingTimer) {
        setTyping(true)
        typingTimer = setInterval(() => setTyping(true), TYPING_PING_MS)
        typingTimer.unref?.()
      }
      return stopTyping
    }

    /** Sends parts in order; only the first of the whole answer is a reply to the message. */
    let answered = false
    const sendParts = async (parts: string[]): Promise<ChatMessage[]> => {
      const sent: ChatMessage[] = []
      for (const part of parts) {
        sent.push(await room.send(this.id, part, answered ? undefined : message.id))
        answered = true
      }
      return sent
    }

    const ctx: BotContext = {
      roomId: room.id,
      message,
      command,
      file: message.file ?? null,
      reply: (text) => sendParts(splitMessage(text)),
      stream: () => {
        const segmenter = new MessageSegmenter()
        let chain: Promise<unknown> = Promise.resolve()
        return {
          write: (fragment) => {
            startTyping()
            chain = chain.then(() => sendParts(segmenter.push(fragment)))
            return chain.then(() => {})
          },
          end: async () => {
            chain = chain.then(() => sendParts(segmenter.flush()))
            await chain
            stopTyping()
          }
        }
      },
      typing: startTyping,
      download: async () => {
        if (!message.file) return null
        return this.session.downloadFile(message.file.driveKey, message.file.path)
      },
      replyFile: async (file, caption = '') => {
        // The same path the apps take: the bytes go into this identity's own drive, and the
        // message carries where to fetch them from.
        const store = await this.session.fileStore()
        const shared = await store.addBuffer(`/${room.id}/${Date.now()}-${file.name}`, b4a.from(file.data))
        return room.sendFile(this.id, {
          driveKey: b4a.toString(store.key, 'hex'),
          path: shared.path,
          size: shared.size,
          name: file.name,
          mimeType: file.mimeType
        }, caption)
      }
    }
    const handlers = [
      ...(command && this.commands.has(command.name) ? [this.commands.get(command.name)!] : []),
      ...this.handlers
    ]
    // A handler that throws is that handler's problem: the next message still gets handled.
    for (const handler of handlers) {
      try {
        await handler(ctx)
      } catch (err) {
        console.warn(`[bot] handler failed on message ${message.id}:`, (err as Error).message)
      }
    }
    stopTyping()
  }

  // ── Contacts ────────────────────────────────────────────────────────────

  private async onContactsChange(): Promise<void> {
    if (this.closed) return
    for (const contact of this.session.listContacts()) {
      if (contact.status !== 'incoming') continue
      const allowed = this.access.allowsUser(contact.userId)
      // Declined, not left pending: someone the bot will never listen to should hear so.
      if (allowed && this.options.acceptContacts === false) continue
      await this.session.respondToContact(contact.userId, allowed).catch((err) => {
        console.warn(`[bot] answering ${contact.userId}'s contact request failed:`, (err as Error).message)
      })
    }
    this.scheduleAll()
  }

  /** The contact a room is a direct chat with, if it is one. */
  private directChatWith(roomId: string): string | null {
    return this.session.listContacts().find((c) => c.status === 'accepted' && c.roomId === roomId)?.userId ?? null
  }
}

function readCursors(storageDir: string): Map<string, Cursor> {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(storageDir, CURSORS_FILE), 'utf8')) as Record<string, Cursor>
    return new Map(Object.entries(raw))
  } catch {
    return new Map()
  }
}

function writeCursors(storageDir: string, cursors: Map<string, Cursor>): void {
  const file = path.join(storageDir, CURSORS_FILE)
  // Write-then-rename, so a crash mid-write leaves the previous positions rather than a torn file
  // that would make the bot forget them all.
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(Object.fromEntries(cursors)))
  fs.renameSync(`${file}.tmp`, file)
}
