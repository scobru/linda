import path from 'node:path'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import type { Readable } from 'node:stream'
import b4a from 'b4a'

export class RemoteDrive {
  private constructor(
    private readonly store: Corestore,
    private readonly swarm: Hyperswarm,
    readonly drive: Hyperdrive
  ) {}

  static async connect(storageDir: string, driveKey: Buffer): Promise<RemoteDrive> {
    const store = new Corestore(path.join(storageDir, 'remote-drives', b4a.toString(driveKey, 'hex')))
    const drive = new Hyperdrive(store, driveKey)
    await drive.ready()

    const swarm = new Hyperswarm()
    swarm.on('connection', (socket) => store.replicate(socket))
    // Without holding findingPeers() open across the join, a get() on this drive — which this
    // device has never replicated, moments after receiving the message pointing at it — resolves
    // against empty local storage the instant it finds nothing locally, instead of waiting for the
    // peer that's still being looked up. Same fix as Session.trackDiscovery for room opens, just
    // never applied here.
    const done = store.findingPeers()
    swarm.join(drive.discoveryKey, { client: true, server: false })
    swarm.flush().then(done, done)

    return new RemoteDrive(store, swarm, drive)
  }

  /** Fetches only the blocks needed for this path, on demand. Retries for a few seconds: `flush()`
   * in `connect()` can resolve before the peer serving this file is actually found (its own
   * discovery-key announce may not have propagated yet, moments after the file arrived), in which
   * case a single attempt would resolve against nothing found rather than wait for the connection
   * that's still forming. */
  async downloadFile(filePath: string): Promise<Buffer | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        const buffer = await this.drive.get(filePath)
        if (buffer || attempt >= 4) return buffer
      } catch (err) {
        if (attempt >= 4) throw err
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.min(attempt + 1, 2)))
    }
  }

  /** Streams blocks as they're requested, for progressive playback/download. */
  streamFile(filePath: string): Readable {
    return this.drive.createReadStream(filePath)
  }

  async close(): Promise<void> {
    await this.swarm.destroy()
    await this.store.close()
  }
}
