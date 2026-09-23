import { decodeInvite } from '../ui/qr-core.js'

// ---------------------------------------------------------------------------
// Who a bot listens to, and where.
//
// By default a bot talks to anyone who reaches it: whoever opens one of its contact links, whoever
// shares a room with it. That is right for a public bot and wrong for most of the rest — a bot that
// runs your home server's commands should answer you, in the rooms you chose, and nobody else.
//
// The rule is applied where the bot decides, not where Linda does: a person the bot ignores can
// still post in a room they share, since the room is not the bot's to police. The bot just does
// not act on it — no handler runs, no reply goes out — and it will not join a room, or accept a
// contact, that the policy rules out.
// ---------------------------------------------------------------------------

export interface BotAccess {
  /**
   * Identity ids the bot listens to. Absent: everyone. Messages from anyone else are passed over,
   * and their contact requests declined.
   */
  users?: readonly string[]
  /**
   * Rooms the bot may be in and answer in, each as a room id or as the room's invite
   * (a `linda-pear://room` link or its raw `key:code`). Absent: any room.
   *
   * A direct chat with a user in `users` is always allowed: its room only comes into being when the
   * two of you connect, so it could not be listed in advance. Without `users`, a room list means
   * only those rooms — direct chats included.
   */
  rooms?: readonly string[]
}

/**
 * The id of the room an invite points at: the first 16 hex characters of its bootstrap key — the
 * same derivation `Session.joinRoomByKey` uses. Accepts a room id as is, a raw `key:code` invite, a
 * bare bootstrap key, or a `linda-pear://` link. Null for anything else.
 */
export function roomIdOf(entry: string): string | null {
  const text = entry.trim()
  const decoded = text.includes('://') ? decodeInvite(text) : null
  const key = (decoded ? decoded.key : text).split(':')[0]!.toLowerCase()
  return /^[0-9a-f]{16}([0-9a-f]{48})?$/.test(key) ? key.slice(0, 16) : null
}

export class BotAccessPolicy {
  private readonly users: ReadonlySet<string> | null
  private readonly rooms: ReadonlySet<string> | null

  constructor(access: BotAccess = {}) {
    this.users = access.users ? new Set(access.users.map((id) => id.trim().toLowerCase())) : null
    if (access.rooms) {
      const ids = new Set<string>()
      for (const entry of access.rooms) {
        const id = roomIdOf(entry)
        if (!id) throw new Error(`not a room id or invite: ${entry}`)
        ids.add(id)
      }
      this.rooms = ids
    } else {
      this.rooms = null
    }
  }

  /** Whether the bot listens to this identity. */
  allowsUser(identityId: string): boolean {
    return this.users === null || this.users.has(identityId.toLowerCase())
  }

  /**
   * Whether the bot may be in this room. `directChatWith` is the contact the room is a direct chat
   * with, if it is one.
   */
  allowsRoom(roomId: string, directChatWith: string | null): boolean {
    if (this.rooms === null || this.rooms.has(roomId)) return true
    return directChatWith !== null && this.users !== null && this.allowsUser(directChatWith)
  }

  /** Whether a message should reach the handlers. */
  allowsMessage(authorId: string, roomId: string, directChatWith: string | null): boolean {
    return this.allowsUser(authorId) && this.allowsRoom(roomId, directChatWith)
  }
}
