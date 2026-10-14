// Room content-key distribution: who gets the key, and when it rotates. Split out of `Session` so
// the rules for revoking a member live in one place. These take the two things they need from the
// session (its own identity id and its connected peers) rather than the session itself.
import b4a from 'b4a'
import type { Room } from '../rooms/room.js'
import type { PeerConnection } from '../network/swarm.js'

export interface KeyContext {
  /** This session's own identity id. */
  readonly identityId: string
  readonly peers: ReadonlyMap<string, PeerConnection>
}

/** Pushes the room's current content key to a reconnecting member who might have missed a rotation while offline. Any admin (not just the creator) can sync the key. `peer.remotePublicKey` is the same swarm keypair as the remote's `identity.id` (both derive from the one public key), so it doubles as their app identity here. */
export function syncKeyIfAdmin(ctx: KeyContext, room: Room, peer: PeerConnection): void {
  if (!room.isAdmin(ctx.identityId)) return
  const peerIdentityId = b4a.toString(peer.remotePublicKey, 'hex')
  if (!room.listMembers().some((m) => m.identityId === peerIdentityId)) return
  if (room.isBanned(peerIdentityId)) return
  const keyHex = room.currentKeyHex
  if (keyHex) peer.rpc.sendRoomKey({ roomId: room.id, epoch: room.keyEpoch, key: keyHex })
}

/** Revokes write access. If the caller is a room admin, also rotates the content key and pushes it to every currently-connected remaining member (offline members catch up via `syncKeyIfAdmin` on reconnect) — this is what actually stops the removed member from reading future messages. A moderator-issued ban revokes write access immediately (replicated, enforced in `Room.apply()`); mods hold no key-distribution rights, so the owner rotates when it applies that ban (`Session.setupRoomKeyPersistence`) — at once if online, otherwise the next time it syncs. */
export async function revokeWrite(ctx: KeyContext, room: Room, writerKeyHex: string): Promise<void> {
  // Revoke the person, not the key. One identity can hold several writer keys — a rejoin issues
  // a new one (see joinRoomByKey), and a second device brings its own — so removing only the key
  // that happened to be clicked left the member writing happily through another of theirs.
  const members = room.listMembers()
  const removedIdentity = members.find((m) => m.writerKey === writerKeyHex)?.identityId
  const keysToRemove = removedIdentity
    ? members.filter((m) => m.identityId === removedIdentity).map((m) => m.writerKey)
    : [writerKeyHex]
  for (const key of keysToRemove) await room.removeWriter(b4a.from(key, 'hex'))

  if (!room.isAdmin(ctx.identityId)) return
  rotateAndDistribute(ctx, room, removedIdentity)
}

/** Rotates the content key and sends it to every connected member except `excludedIdentity`. */
export function rotateAndDistribute(ctx: KeyContext, room: Room, excludedIdentity: string | undefined): void {
  const { epoch, keyHex } = room.rotateKey()

  // `listMembers()` can still list the member just removed: removal is a log entry and apply()
  // has not necessarily linearized it yet. Excluding them explicitly is what actually stops the
  // rotation from handing the fresh key straight back to the person it was rotated away from.
  const remainingIds = new Set(room.listMembers().map((m) => m.identityId))
  if (excludedIdentity) remainingIds.delete(excludedIdentity)

  for (const peer of ctx.peers.values()) {
    const peerIdentityId = b4a.toString(peer.remotePublicKey, 'hex')
    if (remainingIds.has(peerIdentityId)) peer.rpc.sendRoomKey({ roomId: room.id, epoch, key: keyHex })
  }
}
