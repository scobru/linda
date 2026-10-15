// The Discover list: public rooms announced by peers (and by us), kept on disk so it survives a
// restart. Split out of `Session`, which only decides when to announce, retract and gossip.
import path from 'node:path'
import fs from 'node:fs'
import type { RoomAnnounceMessage } from '../network/encoding.js'

const DIRECTORY_FILE = 'directory.json'

export class RoomDirectory {
  private readonly entries = new Map<string, RoomAnnounceMessage>()

  /** `onChange` fires only for changes the user can see in Discover and did not make through `set`. */
  constructor(private readonly storageDir: string, private readonly onChange: () => void) {
    for (const announce of this.load()) this.entries.set(announce.roomId, announce)
  }

  get(roomId: string): RoomAnnounceMessage | undefined {
    return this.entries.get(roomId)
  }

  values(): IterableIterator<RoomAnnounceMessage> {
    return this.entries.values()
  }

  /** One entry per room key: the same room can arrive under several announce ids. */
  list(): RoomAnnounceMessage[] {
    const unique = new Map<string, RoomAnnounceMessage>()
    for (const a of this.entries.values()) {
      unique.set(a.bootstrapKey, a)
    }
    return [...unique.values()]
  }

  /** Stores our own announce, or an update to it, without notifying: the caller made the change. */
  set(announce: RoomAnnounceMessage): void {
    this.entries.set(announce.roomId, announce)
    this.save()
  }

  /** Stores an announce gossiped by a peer, replacing any older entry for the same room key. */
  receive(message: RoomAnnounceMessage): void {
    const announce: RoomAnnounceMessage = {
      roomId: message.roomId,
      name: message.name,
      bootstrapKey: message.bootstrapKey,
      authorId: message.authorId ?? '',
      inviteCode: message.inviteCode ?? '',
      avatar: message.avatar ?? '',
      description: message.description ?? ''
    }
    for (const [id, a] of this.entries.entries()) {
      if (a.bootstrapKey === message.bootstrapKey) {
        this.entries.delete(id)
      }
    }
    this.entries.set(announce.roomId, announce)
    this.save()
    this.onChange()
  }

  /** Drops an entry and tells the UI. Returns whether there was one. */
  remove(roomId: string): boolean {
    if (!this.entries.delete(roomId)) return false
    this.save()
    this.onChange()
    return true
  }

  /** Self-heals entries orphaned by leaving or deleting a room we announced ourselves, from before
   * deleteRoom() retracted its own announce on the way out. */
  pruneOrphans(authorId: string, hasRoom: (roomId: string) => boolean): void {
    let pruned = false
    for (const [roomId, announce] of this.entries) {
      if (announce.authorId === authorId && !hasRoom(roomId)) {
        this.entries.delete(roomId)
        pruned = true
      }
    }
    if (pruned) this.save()
  }

  private load(): RoomAnnounceMessage[] {
    const file = path.join(this.storageDir, DIRECTORY_FILE)
    if (!fs.existsSync(file)) return []
    const raw: Partial<RoomAnnounceMessage>[] = JSON.parse(fs.readFileSync(file, 'utf8'))
    return raw.map((entry) => ({
      roomId: entry.roomId ?? '',
      name: entry.name ?? '',
      bootstrapKey: entry.bootstrapKey ?? '',
      authorId: entry.authorId ?? '',
      inviteCode: entry.inviteCode ?? '',
      avatar: entry.avatar ?? '',
      description: entry.description ?? ''
    }))
  }

  private save(): void {
    fs.mkdirSync(this.storageDir, { recursive: true })
    fs.writeFileSync(path.join(this.storageDir, DIRECTORY_FILE), JSON.stringify([...this.entries.values()], null, 2))
  }
}
