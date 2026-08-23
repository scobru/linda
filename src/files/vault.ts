import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import b4a from 'b4a'
import type { Readable } from 'node:stream'

export interface VaultEntry {
  path: string
  size: number
}

export class RoomVault {
  readonly drive: Hyperdrive
  readonly roomId: string

  private constructor(roomId: string, drive: Hyperdrive) {
    this.roomId = roomId
    this.drive = drive
  }

  /**
   * Opens or creates a shared Hyperdrive for a specific room.
   * If `driveKey` is provided (e.g. from the room metadata), it opens that specific drive.
   * Otherwise, it creates a local writable drive namespaced under `vault-${roomId}`.
   */
  static async open(parentStore: Corestore, roomId: string, driveKey?: Buffer | string | null): Promise<RoomVault> {
    const store = parentStore.namespace(`vault-${roomId}`)
    const keyBuf = driveKey ? (typeof driveKey === 'string' ? b4a.from(driveKey, 'hex') : driveKey) : null
    const drive = keyBuf ? new Hyperdrive(store, keyBuf) : new Hyperdrive(store)
    await drive.ready()
    return new RoomVault(roomId, drive)
  }

  get key(): Buffer {
    return this.drive.key
  }

  get keyHex(): string {
    return b4a.toString(this.drive.key, 'hex')
  }

  get discoveryKey(): Buffer {
    return this.drive.discoveryKey
  }

  get writable(): boolean {
    return (this.drive as unknown as { writable?: boolean }).writable ?? true
  }

  async put(filePath: string, buffer: Buffer): Promise<VaultEntry> {
    const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`
    await this.drive.put(cleanPath, buffer)
    return { path: cleanPath, size: buffer.length }
  }

  async get(filePath: string): Promise<Buffer | null> {
    const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const buffer = await this.drive.get(cleanPath)
        if (buffer) return buffer
      } catch (err) {
        if (attempt >= 4) throw err
      }
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)))
    }
    return null
  }

  createReadStream(filePath: string): Readable {
    const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`
    return this.drive.createReadStream(cleanPath)
  }

  async del(filePath: string): Promise<void> {
    const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`
    await this.drive.del(cleanPath)
  }

  async list(prefix = '/'): Promise<VaultEntry[]> {
    const entries: VaultEntry[] = []
    try {
      const driveAny = this.drive as unknown as { readdir?(p: string): AsyncIterable<string>; entries?(): AsyncIterable<{ key: string; value: { blob?: { byteLength: number } } }> }
      if (typeof driveAny.readdir === 'function') {
        const stream = driveAny.readdir(prefix)
        for await (const name of stream) {
          const entryPath = prefix === '/' ? `/${name}` : `${prefix}/${name}`
          try {
            const stat = await this.drive.entry(entryPath)
            if (stat?.value?.blob) {
              entries.push({
                path: entryPath,
                size: stat.value.blob.byteLength
              })
            }
          } catch {}
        }
      } else if (typeof driveAny.entries === 'function') {
        for await (const entry of driveAny.entries()) {
          if (entry.key.startsWith(prefix) && entry.value?.blob) {
            entries.push({
              path: entry.key,
              size: entry.value.blob.byteLength
            })
          }
        }
      }
    } catch {}
    return entries
  }

  async close(): Promise<void> {
    const driveAny = this.drive as unknown as { close?(): Promise<void> }
    if (typeof driveAny.close === 'function') {
      await driveAny.close()
    }
  }
}

