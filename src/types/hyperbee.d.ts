declare module 'hyperbee' {
  import type { HyperCore } from 'corestore'

  export interface HyperbeeOptions {
    keyEncoding?: string
    valueEncoding?: string
  }

  export interface HyperbeeNode<T> {
    key: string
    value: T
  }

  export default class Hyperbee<T = unknown> {
    constructor(core: HyperCore, opts?: HyperbeeOptions)
    ready(): Promise<void>
    put(key: string, value: T): Promise<void>
    get(key: string): Promise<HyperbeeNode<T> | null>
    del(key: string): Promise<void>
    createReadStream(opts?: { gte?: string; lte?: string; gt?: string; lt?: string }): AsyncIterable<HyperbeeNode<T>>
    close(): Promise<void>
  }

  export {}
}
