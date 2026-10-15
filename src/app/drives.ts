// Reading shared files: our own file store, and the Hyperdrives of everyone else we download from.
// Split out of `Session`, which supplies the corestore, the swarm and what it knows about the
// network through `DriveHost`.
import type { Readable } from 'node:stream'
import type Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import hypercoreCrypto from 'hypercore-crypto'
import type Hyperswarm from 'hyperswarm'
import b4a from 'b4a'
import { FileStore } from '../files/drive.js'
import { joinRoom } from '../network/swarm.js'

/** Drive paths are absolute; callers hand us both shapes. */
export function drivePath(filePath: string): string {
  return filePath.startsWith('/') ? filePath : `/${filePath}`
}

export interface DriveHost {
  readonly store: Corestore
  readonly swarm: Hyperswarm
  /** How many peers are connected right now, for the message shown when a download gives up. */
  peerCount(): number
  /** A network resync in flight, if any — a fetch started during one waits for it. */
  networkResync(): Promise<void> | null
}

export class DriveAccess {
  private fileStoreInstance: FileStore | null = null
  private fileStoreOpening: Promise<FileStore> | null = null
  /** Foreign drives we download from, keyed by hex drive key — see `remoteDrive`. */
  private readonly remoteDrives = new Map<string, Promise<Hyperdrive>>()

  constructor(private readonly host: DriveHost) {}

  /** Our own file store if it has been opened already, without opening it. */
  localFileStore(): FileStore | null {
    return this.fileStoreInstance
  }

  async fileStore(): Promise<FileStore> {
    if (this.fileStoreInstance) return this.fileStoreInstance
    if (!this.fileStoreOpening) {
      this.fileStoreOpening = (async () => {
        const instance = await FileStore.open(this.host.store)
        const topic = hypercoreCrypto.discoveryKey(instance.key)
        await joinRoom(this.host.swarm, topic)
        this.fileStoreInstance = instance
        return instance
      })()
    }
    return this.fileStoreOpening
  }

  /**
   * One long-lived Hyperdrive per foreign drive key, opened on first use and kept until the
   * session closes.
   *
   * Opening a fresh `new Hyperdrive(store, key)` per download — which is what this used to do —
   * deadlocks on the second download from any given peer. Hyperdrive opens its metadata core
   * with `exclusive: true`, which takes a mutex on that core, and a drive only releases it when
   * it is closed; these drives were never closed. So the first download from a peer worked and
   * every later one hung forever inside `drive.ready()`, waiting on a lock the previous
   * download still held: no request ever went out, no retry ran, no error was thrown, and the
   * UI just sat there. Reusing the open drive sidesteps the lock entirely, and also stops us
   * re-joining the same swarm topic on every single download.
   */
  private remoteDrive(keyBuf: Buffer): Promise<Hyperdrive> {
    const keyHex = b4a.toString(keyBuf, 'hex')
    let pending = this.remoteDrives.get(keyHex)
    if (!pending) {
      pending = (async () => {
        const drive = new Hyperdrive(this.host.store, keyBuf)
        await drive.ready()
        // Held open across the join so a `get()` waits for the peer still being looked up
        // instead of resolving against empty local storage the moment it finds nothing.
        const done = this.host.store.findingPeers()
        this.host.swarm.join(drive.discoveryKey, { client: true, server: true })
        this.host.swarm.flush().then(done, done)
        return drive
      })()
      // A failed open must not be cached, or every later attempt replays the same failure.
      pending.catch(() => this.remoteDrives.delete(keyHex))
      this.remoteDrives.set(keyHex, pending)
    }
    return pending
  }

  /**
   * Downloads a file from any Hyperdrive key on the network or from local store.
   * Utilizes the existing session store replication (already active on all peer connections)
   * and joins the discovery key on Hyperswarm.
   */
  async downloadFile(driveKey: string | Buffer, filePath: string): Promise<Buffer | null> {
    const keyBuf = typeof driveKey === 'string' ? b4a.from(driveKey, 'hex') : driveKey
    const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`

    // 1. Check if this drive is our own local fileStore
    if (this.fileStoreInstance && b4a.equals(this.fileStoreInstance.key, keyBuf)) {
      try {
        const localBuf = await this.fileStoreInstance.drive.get(cleanPath)
        if (localBuf) return localBuf
      } catch {}
    }

    // 2. If a network resync (wifi <-> cellular handoff, see resumeNetwork) is already in
    // flight, wait for it — otherwise every attempt below races a socket that's actively being
    // torn down/rebound and fails fast, reporting the peer as offline when it's really just our
    // own interface that hasn't caught up yet.
    const resync = this.host.networkResync()
    if (resync) await resync.catch(() => {})

    // 3. Open the drive in our session's corestore, which already replicates with connected
    // peers — reusing the one we opened last time for this key if there is one.
    const drive = await this.remoteDrive(keyBuf)

    // 5. Retry fetching with backoff. Generous enough to outlast a DHT re-announce and hole-punch
    // after a network handoff, which routinely takes well past 10s on cellular NATs — the old
    // 8-attempt/~12s budget gave up before reconnection finished, misreporting a reachable peer
    // as offline.
    // The per-attempt timeout matters as much as the retries: hypercore's `get` waits forever by
    // default, so once the metadata said the file exists but its blob blocks stalled, the very
    // first attempt hung indefinitely — no retry, no error, no alert, the UI just sat there.
    let lastErr: Error | null = null
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        const buffer = await drive.get(cleanPath, { timeout: 5000 })
        if (buffer) return buffer
      } catch (err) {
        lastErr = err as Error
        if (attempt >= 11) throw err
      }
      await new Promise((resolve) => setTimeout(resolve, 800 * Math.min(attempt + 1, 5)))
    }
    // Out of retries. Returning a bare null here just surfaced as "file not available" no matter
    // what actually went wrong, which is useless on mobile where the console isn't reachable —
    // so report what state we ended up in. `length === 0` means the drive's metadata never
    // replicated to us at all (we never really connected to whoever serves it); a non-zero
    // length with no entry means we are talking to that drive but it does not have this path.
    const detail = await this.describeStalledDrive(drive, cleanPath)
    throw new Error(
      `Could not fetch ${cleanPath} after ${12} attempts — ${detail}` +
      (lastErr ? ` (last error: ${lastErr.message})` : '')
    )
  }

  /** The drive a key refers to: our own file store when the key is ours, a remote drive
   * otherwise. The same resolution `downloadFile` does, minus the fetching. */
  private async driveFor(driveKey: string): Promise<Hyperdrive> {
    const keyBuf = b4a.from(driveKey, 'hex')
    const own = await this.fileStore()
    if (b4a.equals(own.key, keyBuf)) return own.drive
    return this.remoteDrive(keyBuf)
  }

  /**
   * File size straight from drive metadata, without fetching any content — what a range request
   * has to be answered against. Null when the entry has not replicated to us yet.
   */
  async statFile(driveKey: string, filePath: string): Promise<{ size: number } | null> {
    const drive = await this.driveFor(driveKey)
    const entry = await drive.entry(drivePath(filePath))
    const size = entry?.value.blob?.byteLength
    return typeof size === 'number' ? { size } : null
  }

  /**
   * A byte range of a shared file as a stream, pulled from peers on demand — the piece that lets
   * playback start before the whole file has arrived. `downloadFile` stays the way to get a file
   * whole (saving it, previewing an image); this one feeds the media server.
   */
  async createFileStream(driveKey: string, filePath: string, range?: { start: number; end: number }): Promise<Readable> {
    const drive = await this.driveFor(driveKey)
    return drive.createReadStream(drivePath(filePath), range)
  }

  /** Best-effort snapshot of why a `downloadFile` gave up, for the message shown to the user. */
  private async describeStalledDrive(drive: Hyperdrive, cleanPath: string): Promise<string> {
    const peers = this.host.peerCount()
    try {
      const length = drive.core.length
      if (length === 0) {
        return `the drive's index never reached us (0 entries synced, ${peers} peer(s) connected), so nothing is serving it right now`
      }
      const entry = await drive.entry(cleanPath)
      if (!entry) return `the drive synced (${length} entries) but has no such path`
      if (!entry.value.blob) return `the drive lists this path but it carries no data`
      return `the file is listed but its contents never transferred (${length} entries synced, ${peers} peer(s) connected)`
    } catch (err) {
      return `could not inspect the drive: ${(err as Error).message} (${peers} peer(s) connected)`
    }
  }

  /** Closes every remote drive opened so far; a drive that never opened has nothing to release. */
  async close(): Promise<void> {
    for (const pending of this.remoteDrives.values()) {
      try {
        await (await pending).close()
      } catch { /* a drive that never opened has nothing to release */ }
    }
    this.remoteDrives.clear()
  }
}
