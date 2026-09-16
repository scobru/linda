import { extractHashtags } from '../util/hashtag.js'
import { formatBytes } from '../util/bytes.js'

// ---------------------------------------------------------------------------
// Rules about a room's contents that both shells apply, stated once.
//
// These were written twice — once in `ui/app-shell.ts`, once across the mobile screens — and the
// copies had drifted: a moderator could delete another member's message from the desktop mailbox
// but not from the phone, though `Room.apply()` permits it on both.
//
// Everything here takes primitives rather than a `Room`, because the two platforms hold a room in
// different shapes: desktop has a `RoomView` with `isOwner()` / `isModerator()` methods, while
// mobile has a flat `RoomState` with `ownerId` and a `moderators` array. A rule that asked for a
// room would be usable on one side only, which is how the copies started.
// ---------------------------------------------------------------------------

/** What a viewer is allowed to be, resolved by the caller from whichever shape it holds. */
export interface Viewer {
  identityId: string
  isOwner: boolean
  isModerator: boolean
}

/**
 * Authors may delete their own messages; owners and moderators may delete anyone's.
 *
 * This mirrors what `Room.apply()` actually accepts — the UI is gating a button, not deciding the
 * rule, and a UI that gates more tightly than the log simply hides a capability the member has.
 * That is what the mobile copy did by omitting moderators.
 */
export function canDeleteMessage(message: { authorId: string }, viewer: Viewer): boolean {
  if (message.authorId === viewer.identityId) return true
  return viewer.isOwner || viewer.isModerator
}

/** A day's worth of messages, newest day last, as both notes views show them. */
export interface DayGroup<T> {
  /** The divider's label, already formatted for the reader's locale. */
  day: string
  items: T[]
}

/**
 * Groups messages into days for the notes view.
 *
 * Both shells did this and differed in two ways that show. The label was "Monday, 16 September
 * 2026" on the desktop and "Mon, 16 Sep 2026" on the phone; the long form is the one kept, since a
 * divider pill has room for it on either screen and the notes view is the reading surface.
 *
 * And only the desktop sorted first. Grouping walks the list in order and starts a new day
 * whenever the label changes, so a list that is not chronological silently produces two groups for
 * the same day — with a divider in the middle repeating a date the reader has already passed. The
 * sort belongs with the grouping rather than with whoever remembers to do it.
 */
export function groupMessagesByDay<T extends { timestamp: number; deleted?: boolean }>(
  messages: readonly T[]
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  const ordered = messages.filter((message) => !message.deleted).sort((a, b) => a.timestamp - b.timestamp)

  for (const message of ordered) {
    const day = new Date(message.timestamp).toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
    const current = groups[groups.length - 1]
    if (current && current.day === day) current.items.push(message)
    else groups.push({ day, items: [message] })
  }

  return groups
}

/** The part of a message the mailbox view reads. */
export interface MailboxMessage {
  body: string
  file?: { name: string; size: number }
  deleted?: boolean
}

/**
 * The subject line of a mailbox message — its first meaningful line, the way a mail client shows it.
 *
 * Both shells derived this and disagreed on every branch. A note headed `# Shopping list` read
 * "Shopping list" on the desktop and "# Shopping list" on the phone; a deleted message read
 * "Message deleted" there and "No subject" here; an attachment with no body read
 * "Attachment: plan.pdf" against a bare "plan.pdf".
 *
 * Each branch below is whichever of the two said more: the markdown heading stripped, because the
 * `#` is markup and not a title; the deletion named, because "No subject" describes a message that
 * never had one; the attachment labelled, because a filename alone in a subject column reads like
 * a truncated sentence.
 */
export function mailboxSubject(message: MailboxMessage): string {
  if (message.deleted) return 'Message deleted'
  const firstLine = (message.body || '').split('\n').find((line) => line.trim().length > 0)
  if (!firstLine) return message.file ? `Attachment: ${message.file.name}` : '(No subject)'
  const cleaned = firstLine.replace(/^#+\s*/, '').trim()
  return cleaned.length > 50 ? `${cleaned.slice(0, 50)}…` : cleaned
}

/**
 * The preview under the subject: what the message says *after* its first line.
 *
 * The desktop took `body.slice(0, 75)`, which starts with the subject the reader has just read —
 * two lines of the same words. Mobile's rule is the one a mail client follows, so it is the one
 * here.
 */
export function mailboxSnippet(message: MailboxMessage): string {
  if (message.deleted) return ''
  // After the line the subject came from, not after the first line: a body that opens with a blank
  // line would otherwise repeat the subject as its own preview.
  const lines = (message.body || '').split('\n')
  const subjectLine = lines.findIndex((line) => line.trim().length > 0)
  const rest = subjectLine === -1 ? '' : lines.slice(subjectLine + 1).join(' ').trim()
  if (rest) return rest
  return message.file ? `${message.file.name} (${formatBytes(message.file.size)})` : ''
}

/** A room as the unread rule sees it: when its newest message landed, and when this device last
 *  looked. Both are epoch ms, and both may be missing — a room nobody has written in, a room
 *  nobody has opened. */
export interface UnreadState {
  id: string
  lastMessageTime?: number | null
  lastReadAt?: number | null
}

/**
 * Whether a room should show as unread.
 *
 * Written four times — the desktop's `isRoomUnread`, mobile's room-list dot, mobile's unread
 * filter, mobile's app-icon badge — and only the first of them excluded the room being read. So a
 * message arriving in the conversation you have open right now bumped the phone's badge while you
 * were looking at the message, and did nothing on the desktop.
 *
 * Excluding it is the right half of that disagreement: the room is read, by definition, because
 * you are reading it. `markRoomRead` then persists what this already shows, rather than being the
 * only thing that makes it true.
 *
 * `openRoomId` is null when no room is on screen — which on mobile is any time the room list
 * itself is, since the screen clears it on blur.
 */
export function isRoomUnread(room: UnreadState, openRoomId: string | null): boolean {
  if (openRoomId !== null && openRoomId === room.id) return false
  const lastMessageTime = room.lastMessageTime ?? 0
  return lastMessageTime > 0 && lastMessageTime > (room.lastReadAt ?? 0)
}

/**
 * Everything the composer gate depends on, resolved by the caller from whichever shape it holds.
 *
 * `canModerate` rather than `canPost`: `Room.canPost()` already folds the ban, the mute and the
 * broadcast rule into one boolean, which is what a gate wants and the opposite of what a *reason*
 * wants — the folding is precisely the information the message needs back.
 */
export interface ComposerState {
  banned: boolean
  muted: boolean
  broadcast: boolean
  /** Owner, admin or moderator: who may still post in a broadcast room. */
  canModerate: boolean
  hasKey: boolean
  writable: boolean
  isAdmin: boolean
}

/** Why the composer is closed. `kind` is for the shell (an icon, a colour); `text` is the sentence. */
export interface ComposerBlock {
  kind: 'banned' | 'muted' | 'broadcast' | 'waiting-key' | 'syncing' | 'no-access'
  text: string
}

/**
 * Why this identity cannot type into this room, or null when it can.
 *
 * Both shells had this ladder and they disagreed on the order, so the same room produced two
 * different explanations depending on the device — and each order hid a case the other showed:
 *
 * - Mobile tested `!writable || !hasKey` first, above everything, and called it "You do not have
 *   write access to this room yet". A room whose keys are still arriving — seconds, on a fresh
 *   join — therefore told the member their access was refused, and to go ask for something they
 *   already had. Waiting is not a denial, so it sits below the denials here.
 * - Desktop had no rung for a ban, and `Room.canPost()` returns false for a banned member, so a
 *   ban in an ordinary room came out as "Only admins can send messages in this broadcast room" —
 *   in a room that is not a broadcast room.
 *
 * The order is: what was decided about you (ban, mute, broadcast), then what is still in flight
 * (keys, write access). A permanent state that outlasts the transient one must be the one named,
 * or the message resolves into a different message rather than into a working composer.
 */
export function composerBlock(state: ComposerState): ComposerBlock | null {
  if (state.banned) return { kind: 'banned', text: 'You have been removed from this room' }
  if (state.muted) return { kind: 'muted', text: 'You are muted in this room' }
  if (state.broadcast && !state.canModerate) {
    return { kind: 'broadcast', text: 'Only admins can send messages in this broadcast room' }
  }
  if (!state.hasKey) {
    return { kind: 'waiting-key', text: 'Waiting for room encryption keys from an online peer...' }
  }
  if (!state.writable) {
    return state.isAdmin
      ? { kind: 'syncing', text: 'Connecting to sync room access with an online peer...' }
      : { kind: 'no-access', text: 'You do not have write access to this room yet' }
  }
  return null
}

/**
 * Tags present in a room, most used first and alphabetical within a count.
 *
 * Deleted messages do not contribute: their body is gone, so a tag kept alive by one would filter
 * the stream down to nothing.
 */
export function countHashtags(messages: readonly { body: string; deleted?: boolean }[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const message of messages) {
    if (message.deleted) continue
    for (const tag of extractHashtags(message.body)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/**
 * The tag that should stay selected once the room's tags are recounted.
 *
 * A tag whose only message was deleted or cleared must not stay selected, or the stream sits empty
 * with no pill left to switch it off. Both shells had this rule; returning the next selection
 * rather than mutating lets a class field and a React state setter share it.
 */
export function survivingHashtag(active: string | null, tags: readonly [string, number][]): string | null {
  if (!active) return null
  return tags.some(([tag]) => tag === active) ? active : null
}
