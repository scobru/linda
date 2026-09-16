import { extractHashtags } from '../util/hashtag.js'
import { isVoiceMessage } from './attachment-kind.js'
import { formatBytes } from '../util/bytes.js'

// ---------------------------------------------------------------------------
// The answers both shells give about a room, stated once: what its contents allow, how they are
// listed and labelled, and when they are worth interrupting someone for.
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

/**
 * Whether a room matches what was typed into the room-list search.
 *
 * The desktop searched the name and the description; mobile searched the name and the last
 * message. Same box, same query, different results — and neither was a superset of the other, so
 * each device could find a room the other could not.
 *
 * The rule is the union, which is also the least surprising one to use: if a word is visible in
 * the row, searching it finds the row. An empty query matches everything.
 */
export function matchesRoomQuery(
  room: { name: string; description?: string; lastMessageText?: string | null },
  query: string
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [room.name, room.description, room.lastMessageText]
    .some((field) => (field ?? '').toLowerCase().includes(needle))
}

// ── Membership ─────────────────────────────────────────────────────────────

/** Where a member stands in a room. `isAdmin` includes the owner, as `Room.isAdmin()` does. */
export interface MemberStanding {
  isOwner: boolean
  isAdmin: boolean
  isModerator: boolean
}

export type MemberRole = 'owner' | 'admin' | 'moderator' | 'member'

/**
 * The badge a member wears.
 *
 * The desktop derived it from `isOwner` and `isModerator` alone, so a **promoted admin** — someone
 * the desktop's own "Make Admin" button had just created — wore "Member" there and "Admin" on the
 * phone.
 */
export function memberRole(standing: MemberStanding): MemberRole {
  if (standing.isOwner) return 'owner'
  if (standing.isAdmin) return 'admin'
  if (standing.isModerator) return 'moderator'
  return 'member'
}

/** What that badge says. Owner and admin read the same, which is what both shells already showed. */
export function memberRoleLabel(role: MemberRole): string {
  return role === 'owner' || role === 'admin' ? 'Admin' : role === 'moderator' ? 'Mod' : 'Member'
}

/**
 * Whether a mute or a ban by this actor would survive `Room.apply()`.
 *
 * Mirrors the gate there (`room.ts`, the `mute` and `ban` cases) rather than approximating it,
 * because both shells approximated it and each was wrong in its own direction:
 *
 * - The desktop offered the action to an owner against an **admin**, and to a moderator against an
 *   admin. `apply()` drops both. The click wrote an entry, every peer discarded it, and the UI
 *   showed nothing at all — the worst kind of failure, one that looks like it worked.
 * - Mobile hid it from an **admin acting on a moderator**, which `apply()` accepts. That is the
 *   mirror of the bug #94 fixed for message deletion: a UI gating tighter than the log hides a
 *   capability the member actually has.
 *
 * Nobody may restrict an admin, the owner included — an admin is removed by demotion first.
 * Unmute and unban are looser in the log (any non-member may lift one), but a member who cannot be
 * muted cannot be un-muted either, so the same predicate covers both directions of the toggle.
 */
export function canRestrictMember(actor: MemberStanding, target: MemberStanding, isSelf: boolean): boolean {
  if (isSelf) return false
  if (target.isAdmin) return false
  if (actor.isAdmin) return true
  if (actor.isModerator) return !target.isModerator
  return false
}

/** Whether this actor may promote or demote at all — `apply()` asks only that they are an admin. */
export function canChangeMemberRole(actor: MemberStanding, isSelf: boolean): boolean {
  return !isSelf && actor.isAdmin
}

// ── Notifications ──────────────────────────────────────────────────────────

/** Older than this and a message is history catching up, not news. */
export const NOTIFICATION_MAX_AGE_MS = 60_000

/** Replication floods in during the first moments after a session opens; nothing there is new. */
export const NOTIFICATION_STARTUP_QUIET_MS = 4_000

/**
 * Whether a message arriving now is old news rather than something to interrupt for.
 *
 * Only mobile asked. On the desktop, opening the app after a while replayed a notification — with
 * a sound each — for every message that had arrived while it was closed, as the log replicated in.
 * The messages are not new; the app has just caught up with them.
 */
export function isHistoricalMessage(messageTime: number, sessionStartedAt: number, now: number): boolean {
  return now - sessionStartedAt < NOTIFICATION_STARTUP_QUIET_MS || now - messageTime > NOTIFICATION_MAX_AGE_MS
}

/**
 * What a notification says a message was.
 *
 * The desktop sent `body.slice(0, 200)`, which is empty for a message that is only an attachment —
 * a sound, a banner, and no text at all. Mobile said "Shared an image" for every attachment,
 * including the PDFs and the zips. Same answer as the room list: name the file.
 */
export function notificationBody(message: { body: string; file?: { name: string } }): string {
  return lastMessagePreview(message).slice(0, 200)
}

// ── Typing cadence ─────────────────────────────────────────────────────────

/**
 * How long a peer's "typing" claim stands before the sender retracts it.
 *
 * Both shells already used 3s, which is the part that has to agree: it is the receiver's indicator
 * that hangs for this long, so a sender using a shorter window would blink off between keystrokes
 * on the other side.
 */
export const TYPING_STOP_MS = 3000

/**
 * How often a keystroke may re-assert it.
 *
 * Mobile throttled; the desktop fired on every `input` event, and each one fans out to every
 * connected peer. Typing "hello everyone" put fourteen pings on the wire instead of one, and told
 * the receiver nothing new — its indicator is already sticky for `TYPING_STOP_MS`. Must stay below
 * that, or the claim lapses between pings and the indicator flickers.
 */
export const TYPING_PING_MS = 2000

/**
 * Whether a keystroke should re-announce typing, given when the last announcement went out.
 *
 * `0` means never — which is also what both shells reset to when they retract the claim, so the
 * first keystroke of a fresh burst always announces. Stated rather than left to arithmetic: with
 * epoch milliseconds `now - 0 >= TYPING_PING_MS` happens to be true, and a caller that ever passed
 * a relative clock would silently lose that first ping.
 */
export function shouldSendTypingPing(lastPingAt: number, now: number): boolean {
  if (lastPingAt === 0) return true
  return now - lastPingAt >= TYPING_PING_MS
}

/** A room as the room list sees it. `lastMessageTime` is absent for a room nobody has written in. */
export interface RoomListEntry {
  id: string
  isVault?: boolean
  favorite?: boolean
  contactInvite?: boolean
  lastMessageTime?: number | null
}

/**
 * The room list: which rooms show, and in what order.
 *
 * Two disagreements, and the shells were each right about one of them.
 *
 * The desktop hid rooms behind an unclaimed contact link — a placeholder with nobody in it yet,
 * which `claimContactInvite` renames and unflags the moment the other side joins. Mobile listed
 * them, so an empty "New direct chat" sat in the phone's list for as long as the link went
 * unopened. Hiding is right: there is no conversation there to open.
 *
 * Mobile sorted by the newest message, the desktop returned 0 and left bookmark insertion order —
 * so the same account showed its rooms in two unrelated orders. Recency is what a chat list is
 * for, and it is the only one of the two that moves a room when something happens in it.
 *
 * A room with no messages sorts to the bottom, which is where mobile already put it.
 */
export function orderRoomList<T extends RoomListEntry>(rooms: readonly T[]): T[] {
  return rooms
    .filter((room) => !room.contactInvite)
    .slice()
    .sort((a, b) => {
      if (!!a.isVault !== !!b.isVault) return a.isVault ? -1 : 1
      if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1
      return (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0)
    })
}

/**
 * The one-line preview under a room's name.
 *
 * The desktop said "Shared an image" for every attachment — a PDF, a zip, a voice note, all of
 * them images. Mobile named the file, which is never wrong, so that is the shape kept; a voice
 * message is the one case where the name (`voice-2026-03-01T12-00-00.opus`) says less than the
 * word does.
 */
export function lastMessagePreview(message: { body: string; file?: { name: string } }): string {
  if (!message.file) return message.body
  return isVoiceMessage(message.file) ? 'Voice message' : `Shared ${message.file.name}`
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
