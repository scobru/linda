declare module 'corestore' {
  import { Duplex } from 'node:stream'

  export interface CoreOptions {
    valueEncoding?: string
  }

  export interface HyperCore {
    key: Buffer
    length: number
    append(value: unknown): Promise<{ length: number }>
    get(index: number): Promise<unknown>
    on(event: string, listener: (...args: any[]) => void): this
    off(event: string, listener: (...args: any[]) => void): this
    ready(): Promise<void>
    purge(): Promise<void>
  }

  export default class Corestore {
    constructor(storage: string, opts?: { primaryKey?: Buffer; unsafe?: boolean })
    readonly ns: Buffer
    get(name: string | { name: string; valueEncoding?: string } | { discoveryKey: Buffer }, opts?: CoreOptions): HyperCore
    namespace(name: string): Corestore
    list(namespace: Buffer): AsyncIterable<Buffer>
    replicate(stream: Duplex | boolean): Duplex
    /** Marks peer discovery as in progress for every core in the store; call the returned function
     * once discovery settles. Reads on a core with no local data wait while it is held. */
    findingPeers(): () => void
    ready(): Promise<void>
    close(): Promise<void>
  }
}

declare module 'autobase' {
  import Corestore from 'corestore'
  import { Duplex } from 'node:stream'

  export interface AutobaseNode<T> {
    value: T
    from: { key: Buffer }
  }

  export interface AutobaseView {
    length: number
    get(index: number): Promise<any>
    append(value: unknown): Promise<void | { length: number }>
    on(event: string, listener: (...args: any[]) => void): void
    off(event: string, listener: (...args: any[]) => void): void
  }

  export interface AutobaseApplyHost {
    addWriter(publicKey: Buffer, opts?: { indexer?: boolean }): Promise<void>
    removeWriter(publicKey: Buffer): Promise<void>
    ackWriter(publicKey: Buffer): Promise<void>
  }

  /** `V` is whatever `open()` returns. Every core opened from the store during `open()` becomes a
   * view Autobase manages — truncated on reorg, persisted across reopen — so returning an object of
   * several cores gives several views. */
  export interface AutobaseOptions<T, V = AutobaseView> {
    valueEncoding?: string
    open(store: Corestore): V
    apply(nodes: AutobaseNode<T>[], view: V, host: AutobaseApplyHost): Promise<void> | void
  }

  export default class Autobase<T = unknown, V = AutobaseView> {
    constructor(store: Corestore, bootstrap: Buffer | null, opts: AutobaseOptions<T, V>)
    ready(): Promise<void>
    update?(): Promise<boolean | void>
    close(): Promise<void>
    append(value: T): Promise<void>
    replicate(stream: Duplex | boolean): Duplex
    readonly key: Buffer
    readonly local: { key: Buffer }
    readonly view: V
    readonly writable: boolean
    on(event: string, listener: (...args: any[]) => void): this
    off(event: string, listener: (...args: any[]) => void): this
  }
}

declare module 'hyperdrive' {
  import Corestore from 'corestore'
  import { Duplex, Readable } from 'node:stream'

  export interface DriveEntry {
    key: string
    value: {
      executable: boolean
      linkname: string | null
      blob: { blockOffset: number; blockLength: number; byteOffset: number; byteLength: number } | null
      metadata: unknown
    }
  }

  export default class Hyperdrive {
    constructor(store: Corestore, key?: Buffer)
    ready(): Promise<void>
    put(path: string, buffer: Buffer, opts?: { executable?: boolean }): Promise<void>
    get(path: string, opts?: { timeout?: number }): Promise<Buffer | null>
    entry(path: string): Promise<DriveEntry | null>
    createReadStream(path: string, opts?: { start?: number; end?: number }): Readable
    del(path: string): Promise<void>
    replicate(stream: Duplex | boolean): Duplex
    close(): Promise<void>
    readonly key: Buffer
    readonly discoveryKey: Buffer
    /** The drive's metadata core; `length` is 0 until its index has replicated to us. */
    readonly core: { length: number }
  }
}
