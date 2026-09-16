// ---------------------------------------------------------------------------
// How a peer is named and pictured, given that the app holds up to three versions of each.
//
// A contact carries a `nickname` and an `avatar` copied from the moment the request was sent or
// accepted. They are a snapshot: blank if the other side had not set one yet, and never updated
// afterwards. Presence carries the current ones, and `ProfileStore` keeps the last presence seen so
// a restart does not go back to the snapshot.
//
// Every surface that shows a peer chose its own order over those three, and they did not agree.
// The desktop resolved a contact's name live and its picture from the snapshot; mobile did the
// reverse of both; the room list on each did something else again. So a contact who changed their
// name kept the old one forever on the phone, and a contact who changed their picture kept the old
// one on both — while the same person, in the same app, showed up correctly one screen over.
// ---------------------------------------------------------------------------

/** The three places a peer's name or picture can come from, in the order they should be trusted. */
export interface PeerSources {
  /** What presence says right now. Absent until that peer has been seen this session. */
  live?: string | null
  /** The last presence seen, persisted — what to use before that peer reconnects. */
  stored?: string | null
  /** Copied when the contact or room was created. Never updates; may be blank. */
  snapshot?: string | null
}

const firstSet = (sources: PeerSources): string | undefined =>
  [sources.live, sources.stored, sources.snapshot].find((value) => !!value) ?? undefined

/**
 * A peer's picture, or undefined to fall back to a generated avatar.
 *
 * The snapshot is last because it is the only one that cannot be right by accident: the other two
 * were true at some point about the peer's own choice, and this one was true when a third party
 * copied it.
 */
export function peerAvatar(sources: PeerSources): string | undefined {
  return firstSet(sources)
}

/**
 * A peer's display name, falling back to the head of their identity id.
 *
 * The id prefix is the last resort rather than an error: a peer who has never set a nickname and
 * has never been seen online has no name to show, and eight hex characters are at least stable and
 * recognisable between two rooms.
 */
export function peerName(userId: string, sources: PeerSources): string {
  return firstSet(sources) ?? userId.slice(0, 8)
}
