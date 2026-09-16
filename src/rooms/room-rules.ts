import { extractHashtags } from '../util/hashtag.js'

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
