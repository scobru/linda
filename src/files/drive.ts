import fs from 'node:fs'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'

export interface SharedFile {
  path: string
  size: number
}

export class FileStore {
  readonly drive: Hyperdrive

  private constructor(drive: Hyperdrive) {
    this.drive = drive
  }

  /** `parentStore` is the identity's single shared Corestore. */
  static async open(parentStore: Corestore): Promise<FileStore> {
    const store = parentStore.namespace('files')
    const drive = new Hyperdrive(store)
    await drive.ready()
    return new FileStore(drive)
  }

  get key(): Buffer {
    return this.drive.key
  }

  async addFromDisk(drivePath: string, sourcePath: string): Promise<SharedFile> {
    const buffer = await fs.promises.readFile(sourcePath)
    await this.drive.put(drivePath, buffer)
    return { path: drivePath, size: buffer.length }
  }

  async addBuffer(drivePath: string, buffer: Buffer): Promise<SharedFile> {
    await this.drive.put(drivePath, buffer)
    return { path: drivePath, size: buffer.length }
  }
}
