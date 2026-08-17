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
    swarm.join(drive.discoveryKey, { client: true, server: false })
    await swarm.flush()

    return new RemoteDrive(store, swarm, drive)
  }

  /** Fetches only the blocks needed for this path, on demand. */
  async downloadFile(filePath: string): Promise<Buffer | null> {
    return this.drive.get(filePath)
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
