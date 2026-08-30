/**
 * Pure invite encoding/decoding — no platform-specific dependencies.
 * Shared between desktop (qr.ts) and mobile (mobile-qr.ts).
 */

export interface RoomInvite {
  name: string
  key: string
  /**
   * `'contact'` marks a link whose room exists only to introduce two people: whoever opens it
   * joins and both sides record each other as contacts, with no visible "join this room" step.
   * Absent or `'room'` on every link written before contact links existed, and on ordinary room
   * invites — callers that only ever join rooms can keep ignoring this.
   */
  kind?: 'room' | 'contact'
  /** Identity that issued a contact link. Present only when `kind` is `'contact'`. */
  from?: string
}

export function encodeInvite(invite: RoomInvite): string {
  if (invite.kind === 'contact') {
    return `linda-pear://contact?name=${encodeURIComponent(invite.name)}&key=${invite.key}&from=${invite.from ?? ''}`
  }
  return `linda-pear://room?name=${encodeURIComponent(invite.name)}&key=${invite.key}`
}

/** Official announcement room, auto-joined for every newly-created identity (see CreateScreen /
 * app-shell's create flow) so new users land with at least one populated channel. */
export const DEFAULT_CHANNEL: RoomInvite = {
  name: 'Linda News',
  key: '84deb2dcb790fa1427c9e4b2d5df54fea8cacc84632099cc4ad82024cf7870f4:b53caf8a9eb94c386900d296771d84f3',
}

/** Second default room every new identity lands in alongside DEFAULT_CHANNEL — a general welcome
 * space rather than the read-only news broadcast. */
export const DEFAULT_WELCOME_CHANNEL: RoomInvite = {
  name: 'Linda Welcome',
  key: '33e106ade9495c6a0799d15c54b36f5abba67ee76444ad2ad0fd5015eea67a18:98a98c4b50ed37ba6cac97199710193e',
}

export const DEFAULT_CHANNELS: RoomInvite[] = [DEFAULT_CHANNEL, DEFAULT_WELCOME_CHANNEL]

export function decodeInvite(text: string): RoomInvite | null {
  try {
    const url = new URL(text)
    const key = url.searchParams.get('key')
    const name = url.searchParams.get('name')
    if (!key || !name) return null
    // `linda-pear://contact?...` carries the issuer so the opener can record them as a contact.
    // Without a `from` it is only a room invite wearing the wrong hostname, so treat it as one
    // rather than half-completing a handshake with nobody.
    const from = url.searchParams.get('from')
    if (url.hostname === 'contact' && from) return { name, key, kind: 'contact', from }
    return { name, key, kind: 'room' }
  } catch {
    return null
  }
}
