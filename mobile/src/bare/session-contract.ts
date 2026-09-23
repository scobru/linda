// What of `Session` the worklet exposes, stated once.
//
// The worklet handlers and the proxy that calls them used to be two hand-written lists of string
// literals. TypeScript cannot relate one string to another, so a method added to `Session` and
// forgotten in either list produced a capability that simply did not exist on mobile — silently,
// with nothing failing. It happened twice in one week (contact links, orphaned-file cleanup).
//
// Both sides are now derived from `Session` itself. Adding a method to `Session` makes it a member
// of `ForwardedSessionMethod`, which makes `FORWARDED_SESSION_METHODS` incomplete, which fails the
// build. The choice to expose it or not becomes deliberate rather than accidental.
import type { Session } from '@core/app/session'
import type { WireMediaFrame } from './media-frame'

type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never
}[keyof T]

/** Every method of `Session`, public by construction: `keyof` does not see private members. */
export type SessionMethod = MethodNames<Session>

// The buckets are the desktop contract's words (`src/app/session-contract.ts`), so the two can be
// compared — `test/session-surface-parity.test.ts` does. This list used to be one `NotForwarded`
// type that put "written out by hand", "used inside the worklet" and "not on mobile at all" under
// one name, and from the list alone the last could not be told from the first two. That is the
// same silent missing capability this contract exists to prevent.

/**
 * Members the app reaches through code written out by hand, each for a reason:
 *
 * - `getRoom` — returns a live `Room`; the proxy hands back a `RoomProxy` keyed by id.
 * - `createRoom`, `ensurePersonalVault`, `joinRoomByKey`, `acceptContactInvite`,
 *   `reopenBookmarkedRooms` — must call `wireRoom` on what they return, which is what connects the
 *   room's events to the UI. Hiding that behind a generic forward is exactly the bug where a
 *   rebuilt room stopped emitting state.
 * - `listPeerAvatars` — returns a `Map`, which JSON flattens to `{}`.
 * - `downloadFile` — returns bytes, which ride the binary channel (`files.download`) instead.
 * - `mediaUrl` — starts the worklet's loopback media server on first use (`media.url`).
 */
export const ADAPTED = [
  'getRoom',
  'createRoom',
  'ensurePersonalVault',
  'joinRoomByKey',
  'acceptContactInvite',
  'reopenBookmarkedRooms',
  'listPeerAvatars',
  'downloadFile',
  'mediaUrl'
] as const satisfies readonly SessionMethod[]

/**
 * Members only the worklet itself uses, never the app:
 *
 * - `close` — the session's lifetime is the worklet's.
 * - `fileStore`, `createFileStream`, `statFile` — files are added (`room.sendFile`) and streamed
 *   (the media server) inside the worklet; nothing here survives JSON.
 * - `getPairingSnapshot`, `importPairingSnapshot` — device pairing runs in the worklet's own login
 *   flow, before and after the session it pairs.
 * - `setBotProfile` — only `LindaBot` announces itself as a bot, and a phone is not one.
 */
export const INTERNAL = [
  'close',
  'fileStore',
  'createFileStream',
  'statFile',
  'getPairingSnapshot',
  'importPairingSnapshot',
  'setBotProfile'
] as const satisfies readonly SessionMethod[]

/**
 * Members of `Session` the phone does not offer at all — declared gaps, not forgotten ones.
 *
 * - `getAppBackground`, `setAppBackground` — the desktop's app-wide background picture; the
 *   mobile app has no such setting.
 */
export const NOT_EXPOSED = [
  'getAppBackground',
  'setAppBackground'
] as const satisfies readonly SessionMethod[]

type NotForwarded = (typeof ADAPTED)[number] | (typeof INTERNAL)[number] | (typeof NOT_EXPOSED)[number]

export type ForwardedSessionMethod = Exclude<MethodNames<Session>, NotForwarded>

export const FORWARDED_SESSION_METHODS = [
  'answerCall',
  'banMember',
  'broadcastPresence',
  'clearRoomHistory',
  'restoreRoomHistory',
  'createContactInvite',
  'deleteBlobs',
  'deleteContact',
  'deleteMessage',
  'deleteRoom',
  'demoteAdmin',
  'demoteModerator',
  'endCall',
  'findOrphanBlobs',
  'getActiveCall',
  'getAudioCodecs',
  'getAvatar',
  'getNetworkStatus',
  'getNickname',
  'getPeerAvatar',
  'getWallpaper',
  'inviteLinkFor',
  'isRoomFavorite',
  'listBookmarks',
  'listContacts',
  'listDirectory',
  'markRoomRead',
  'muteMember',
  'promoteToAdmin',
  'promoteToModerator',
  'regenerateInvite',
  'removeFromDirectory',
  'respondToContact',
  'resumeNetwork',
  'sendCallControl',
  'sendCallFrame',
  'sendContactRequest',
  'sendReadReceipt',
  'sendTyping',
  'setAudioCodecs',
  'setAvatar',
  'setNickname',
  'setRoomBroadcast',
  'setRoomFavorite',
  'setWallpaper',
  'startCall',
  'unbanMember',
  'unmuteMember',
  'updateRoomMeta'
] as const satisfies readonly ForwardedSessionMethod[]

// The two checks that make the whole thing work. A new Session method fails the first with its own
// name in the error; a stale entry fails the second.
type MissingFromList = Exclude<ForwardedSessionMethod, (typeof FORWARDED_SESSION_METHODS)[number]>
const _everyMethodIsListed: [MissingFromList] extends [never]
  ? true
  : { error: 'add these to FORWARDED_SESSION_METHODS, or to ADAPTED, INTERNAL or NOT_EXPOSED'; missing: MissingFromList } = true
void _everyMethodIsListed

/**
 * Methods whose arguments change shape in transit, and what they become.
 *
 * Only one so far, and it was a cast until now: media frames cross as base64 rather than bytes
 * (see `media-frame.ts` for why), so the app called `(session as any).sendCallFrame(…)` against a
 * contract that said `Uint8Array`. Declaring the translation is the point — a cast says "trust
 * me", this says what the boundary actually carries, and the worklet handler is typed by the same
 * name on its own side.
 */
interface WireArgs {
  sendCallFrame: [WireMediaFrame]
}

/**
 * The same surface as seen from the app side. Every call crosses a message boundary, so results
 * arrive as promises even where `Session` is synchronous.
 */
export type RemoteSession = {
  [K in ForwardedSessionMethod]: Session[K] extends (...args: infer A) => infer R
    ? (...args: K extends keyof WireArgs ? WireArgs[K] : A) => Promise<Awaited<R>>
    : never
}
