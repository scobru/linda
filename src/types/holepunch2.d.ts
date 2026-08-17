declare module 'hyperswarm' {
  import { EventEmitter } from 'node:events'
  import { Duplex } from 'node:stream'

  export interface PeerInfo {
    publicKey: Buffer
    client: boolean
  }

  export interface HyperswarmOptions {
    keyPair?: { publicKey: Buffer; secretKey: Buffer }
  }

  export interface JoinOptions {
    server?: boolean
    client?: boolean
  }

  export default class Hyperswarm extends EventEmitter {
    constructor(opts?: HyperswarmOptions)
    join(topic: Buffer, opts?: JoinOptions): { flushed(): Promise<void> }
    leave(topic: Buffer): Promise<void>
    flush(): Promise<void>
    destroy(): Promise<void>
    on(event: 'connection', listener: (socket: Duplex, info: PeerInfo) => void): this
    on(event: string, listener: (...args: any[]) => void): this
  }
}

declare module 'protomux' {
  import { Duplex } from 'node:stream'

  export interface MessageOptions<T> {
    encoding: {
      preencode(state: unknown, value: T): void
      encode(state: unknown, value: T): void
      decode(state: unknown): T
    }
    onmessage(message: T): void
  }

  export interface MuxMessage<T> {
    send(value: T): void
  }

  export interface MuxChannel {
    open(): void
    close(): void
    addMessage<T>(opts: MessageOptions<T>): MuxMessage<T>
    userData: unknown
  }

  export interface ChannelOptions {
    protocol: string
    onopen?(): void
    onclose?(): void
  }

  export default class Protomux {
    static from(socket: Duplex): Protomux
    createChannel(opts: ChannelOptions): MuxChannel
  }
}

declare module 'compact-encoding' {
  export interface Encoding<T> {
    preencode(state: unknown, value: T): void
    encode(state: unknown, value: T): void
    decode(state: unknown): T
  }
  export const string: Encoding<string>
  export const bool: Encoding<boolean>
  export const uint: Encoding<number>
  export const buffer: Encoding<Buffer>
  export const none: Encoding<undefined>
}
