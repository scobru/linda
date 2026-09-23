import fs from 'node:fs'
import path from 'node:path'
import { Session } from '../app/session.js'
import type { ChatMessage, Room } from '../rooms/room.js'
import { createIdentity, identityExists, recoverIdentity, unlockIdentity, type Identity } from '../identity/index.js'
import type { SwarmTransport } from '../network/swarm.js'
import { decodeInvite, encodeInvite } from '../ui/qr-core.js'
import { parseCommand, type BotCommand } from './commands.js'

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
  /** Accept every contact request, so anyone can start a direct chat with the bot. Default true. */
  acceptContacts?: boolean
  /** Test seam: which DHT to bootstrap from — see `SwarmTransport`. */
  transport?: SwarmTransport
}

/** One message, handed to a handler. */
export interface BotContext {
  roomId: string
  message: ChatMessage
  /** The command the message is, if it starts with one — see `parseCommand`. */
  command: BotCommand | null
  /** Answers in the same room, as a reply to this message. */
  reply(text: string): Promise<ChatMessage>
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
  private readonly handlers: BotHandler[] = []
  private readonly cursors: Map<string, Cursor>
  /** One pass per room at a time; a pass asked for while one runs is folded into a single follow-up. */
  private readonly draining = new Map<string, Promise<void>>()
  private readonly pending = new Set<string>()
  private sweepTimer: ReturnType<typeof setInterval> | null = null
  private closed = false

  private constructor(
    readonly session: Session,
    readonly identity: Identity,
    private readonly options: BotOptions,
    createdMnemonic: string | null
  ) {
    this.createdMnemonic = createdMnemonic
    this.cursors = readCursors(options.storageDir)
  }

  /** Opens (or creates) the bot's identity, starts its session and begins handling messages. */
  static async start(options: BotOptions): Promise<LindaBot> {
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
    bot.scheduleAll()
    bot.sweepTimer = setInterval(() => bot?.scheduleAll(), SWEEP_INTERVAL_MS)
    bot.sweepTimer.unref?.()
    return bot
  }

  get id(): string {
    return this.identity.id
  }

  /** Handles `/name …`. Registering a name twice replaces the first handler. */
  command(name: string, handler: BotHandler): this {
    this.commands.set(name.replace(/^\//, '').toLowerCase(), handler)
    return this
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

  /** Joins a room from a `linda-pear://` link — a room invite or a contact link. Returns the room id. */
  async join(link: string): Promise<string> {
    const invite = decodeInvite(link)
    if (!invite) throw new Error('not a Linda invite link')
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
      handled.add(message.id)
      cursor.recent = [...cursor.recent, message.id].slice(-REREAD_WINDOW * 2)
      changed = true
      await this.dispatch(room, message)
    }

    if (changed) writeCursors(this.options.storageDir, this.cursors)
  }

  private async dispatch(room: Room, message: ChatMessage): Promise<void> {
    const command = parseCommand(message.body)
    const ctx: BotContext = {
      roomId: room.id,
      message,
      command,
      reply: (text) => room.send(this.id, text, message.id)
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
  }

  // ── Contacts ────────────────────────────────────────────────────────────

  private async onContactsChange(): Promise<void> {
    if (this.options.acceptContacts === false || this.closed) return
    for (const contact of this.session.listContacts()) {
      if (contact.status !== 'incoming') continue
      await this.session.respondToContact(contact.userId, true).catch((err) => {
        console.warn(`[bot] accepting ${contact.userId} failed:`, (err as Error).message)
      })
    }
    this.scheduleAll()
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
