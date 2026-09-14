import type { Session } from './session.js'

/**
 * What of `Session` crosses a process boundary, stated once.
 *
 * The desktop worker path used to describe this surface twice by hand — the handler table in
 * `worker/dispatcher.ts` and the proxy methods in `transport/remote-session-view.ts` — and
 * TypeScript cannot relate one hand-written list to another. Three defects came out of that in a
 * single review: `banMember` sent two arguments to a three-argument handler (a function taking
 * fewer arguments is assignable to a type with more, so the `SessionView` guard passed), typing
 * indicators and read receipts had no handler at all, and `resumeNetwork` never reached the worker.
 * The mobile side had already hit the same class of bug twice in one week and solved it by deriving
 * its list from `Session` itself; see `mobile/src/bare/session-contract.ts`.
 *
 * So every member of `Session` lands in exactly one of three buckets, and the compiler enforces
 * that it lands in one. Adding a method to `Session` and forgetting it here fails the build with
 * its own name in the error, which is the whole point.
 */

type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never
}[keyof T]

/**
 * What the worker republishes once the call has returned. These are the four shapes the 25
 * non-trivial handlers actually had between them, not a case per method.
 *
 * - `none` — nothing to republish; the caller's own return value is the whole answer.
 * - `roomState` — the room's derived state changed (membership, roles, mutes, bans, broadcast).
 * - `bookmarks` — the bookmark list changed (favourite, read marker, cleared history, deletion).
 * - `roomState+bookmarks` — both, which only `updateRoomMeta` needs.
 */
export type Effect = 'none' | 'roomState' | 'bookmarks' | 'roomState+bookmarks'

/**
 * Two invariants the generic handler leans on, both true of every member below and worth breaking
 * loudly rather than silently if they ever stop being:
 *
 * 1. Any method whose effect mentions a room takes that room's id as its first argument.
 * 2. A `bookmarks` effect answers with the refreshed list, so the client can reconcile the
 *    optimistic write it already made. Three of the hand-written handlers did this and three did
 *    not; the ones that did not were simply inconsistent, and their callers ignore the extra field.
 */

/**
 * Members answered on the client from state the worker pushes, never by a round trip. The UI reads
 * these synchronously — `getNickname()` returns a string, not a promise — so they cannot become
 * generic forwards without changing every call site. `WorkerDispatcher.extractSessionState` seeds
 * them and the pushed events keep them current.
 */
type Mirrored =
  | 'getNickname'
  | 'getAvatar'
  | 'getWallpaper'
  | 'getAppBackground'
  | 'getPeerAvatar'
  | 'listPeerAvatars'
  | 'listBookmarks'
  | 'listContacts'
  | 'listDirectory'
  | 'getNetworkStatus'
  | 'isRoomFavorite'
  | 'inviteLinkFor'
  | 'getActiveCall'

/**
 * Members a generic forward would break, each for a reason:
 *
 * - `createRoom`, `ensurePersonalVault`, `joinRoomByKey`, `acceptContactInvite`,
 *   `reopenBookmarkedRooms` — return a live `Room` that must be wired to the event stream before
 *   the client hears about it. Hiding that behind a forward is exactly the bug where a rebuilt
 *   room stopped emitting state.
 * - `getRoom` — hands back a live `Room`; the client gets a `RemoteRoomView` keyed by id instead.
 * - `downloadFile`, `fileStore`, `createFileStream`, `statFile` — bytes and streams, which travel
 *   on the frame's binary tail rather than through the JSON header.
 * - `sendCallFrame` — same reason: the payload rides the tail.
 * - `regenerateInvite` — its reply wraps the new link, which the client stores in its invite-link
 *   mirror rather than returning to the caller.
 * - `mediaUrl` — starts a loopback media server inside the worker on first use.
 * - `close` — worker lifecycle, torn down with the media server rather than forwarded.
 */
type Adapted =
  | 'createRoom'
  | 'ensurePersonalVault'
  | 'joinRoomByKey'
  | 'acceptContactInvite'
  | 'reopenBookmarkedRooms'
  | 'getRoom'
  | 'downloadFile'
  | 'fileStore'
  | 'createFileStream'
  | 'statFile'
  | 'sendCallFrame'
  | 'regenerateInvite'
  | 'mediaUrl'
  | 'close'

/** Every `Session` member that crosses the boundary as a plain forward. */
export type ForwardedMethod = Exclude<MethodNames<Session>, Mirrored | Adapted>

/**
 * The single declaration. The key is the method name, so an unclassified member makes this
 * `Record` incomplete and the build names it.
 */
export const FORWARDED: Record<ForwardedMethod, Effect> = {
  // Moderation — every one of these changes the room's derived state.
  muteMember: 'roomState',
  unmuteMember: 'roomState',
  banMember: 'roomState',
  unbanMember: 'roomState',
  promoteToModerator: 'roomState',
  demoteModerator: 'roomState',
  promoteToAdmin: 'roomState',
  demoteAdmin: 'roomState',
  setRoomBroadcast: 'roomState',

  // Bookmark-shaped changes.
  deleteRoom: 'bookmarks',
  markRoomRead: 'bookmarks',
  setRoomFavorite: 'bookmarks',
  clearRoomHistory: 'bookmarks',
  restoreRoomHistory: 'bookmarks',

  // The one member that changes both.
  updateRoomMeta: 'roomState+bookmarks',

  // Profile, presence and network.
  setNickname: 'none',
  setAvatar: 'none',
  setWallpaper: 'none',
  setAppBackground: 'none',
  broadcastPresence: 'none',
  sendTyping: 'none',
  sendReadReceipt: 'none',
  resumeNetwork: 'none',

  // Contacts and directory.
  sendContactRequest: 'none',
  respondToContact: 'none',
  createContactInvite: 'none',
  deleteContact: 'none',
  removeFromDirectory: 'none',

  // Rooms, invites and storage hygiene.
  deleteMessage: 'none',
  findOrphanBlobs: 'none',
  deleteBlobs: 'none',

  // Device pairing.
  getPairingSnapshot: 'none',
  importPairingSnapshot: 'none',

  // Calls. `sendCallFrame` is absent on purpose — see `Adapted`.
  startCall: 'none',
  answerCall: 'none',
  endCall: 'none',
  sendCallControl: 'none'
}

/** Iterating a `Record` keyed by a union needs the keys typed, which `Object.keys` does not do. */
export const FORWARDED_METHODS = Object.keys(FORWARDED) as ForwardedMethod[]
