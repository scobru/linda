// Invite tokens a room owner or admin has issued: the code a joiner must present to be granted
// write access. Split out of `Session`, which still decides who may issue and redeem one.
import type { Room } from '../rooms/room.js'
import type { ProfileStore } from './profile-store.js'
import { randomId } from '../util/id.js'

/** Access-control token gating write grants for a room; owner-held and saved with the profile, so a restart keeps it. Regenerating the invite replaces it, which is the "revoke a leaked link" path. */
export interface InviteToken {
  code: string
  usedCount: number
}

type InviteStore = Pick<ProfileStore, 'saveInviteToken'>

export class InviteBook {
  private readonly tokens = new Map<string, InviteToken>()

  constructor(private readonly store: InviteStore) {}

  get(roomId: string): InviteToken | undefined {
    return this.tokens.get(roomId)
  }

  /** Puts a token read back from the profile store into memory, without saving it again. */
  restore(roomId: string, token: InviteToken): void {
    this.tokens.set(roomId, { code: token.code, usedCount: token.usedCount })
  }

  /** Replaces the room's token with a fresh code, and replicates it when `identityId` may admit joiners. */
  issue(roomId: string, room: Room | undefined, identityId: string): InviteToken {
    const token: InviteToken = { code: randomId(16), usedCount: 0 }
    this.tokens.set(roomId, token)
    void this.store.saveInviteToken({ roomId, ...token })
    if (room && room.writable && room.isAdmin(identityId)) {
      void room.addInviteCode(token.code).catch(() => {})
    }
    return token
  }

  /** Counts a use of `code` and returns whether it was the room's current one. */
  redeem(roomId: string, code: string): boolean {
    const token = this.tokens.get(roomId)
    if (!token || token.code !== code) return false
    token.usedCount++
    void this.store.saveInviteToken({ roomId, ...token })
    return true
  }
}
