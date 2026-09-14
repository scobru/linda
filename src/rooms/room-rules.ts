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
