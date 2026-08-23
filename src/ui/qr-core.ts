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

/** Official announcement room, auto-joined for every newly-created identity (see CreateScreen /
 * app-shell's create flow) so new users land with at least one populated channel. */
export const DEFAULT_CHANNEL: RoomInvite = {
  name: 'Linda News',
  key: '972f8a4a95bcaf92b6913b478b2468d1e796455c67c0622a06fb47b08475267d:7f5cc178a3965e2843a573a760ea1b66',
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
