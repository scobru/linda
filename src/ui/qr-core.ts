/**
 * Pure invite encoding/decoding — no platform-specific dependencies.
 * Shared between desktop (qr.ts) and mobile (mobile-qr.ts).
 */

export interface RoomInvite {
  name: string
  key: string
}

export function encodeInvite(invite: RoomInvite): string {
  return `linda-pear://room?name=${encodeURIComponent(invite.name)}&key=${invite.key}`
}

export function decodeInvite(text: string): RoomInvite | null {
  try {
    const url = new URL(text)
    const key = url.searchParams.get('key')
    const name = url.searchParams.get('name')
    if (!key || !name) return null
    return { name, key }
  } catch {
    return null
  }
}
