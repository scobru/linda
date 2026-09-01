declare module '@hyperswarm/secret-stream' {
  import { Duplex } from 'node:stream'

  export interface NoiseSecretStreamOptions {
    keyPair?: { publicKey: Buffer; secretKey: Buffer }
    remotePublicKey?: Buffer
    autoStart?: boolean
    keepAlive?: number
  }

  export default class NoiseSecretStream extends Duplex {
    constructor(isInitiator: boolean, rawStream?: Duplex | null, opts?: NoiseSecretStreamOptions)
    readonly publicKey: Buffer | null
    readonly remotePublicKey: Buffer | null
    readonly connected: boolean
    once(event: 'connect' | 'close' | 'error', listener: (...args: any[]) => void): this
    on(event: 'connect' | 'close' | 'error', listener: (...args: any[]) => void): this
    destroy(err?: Error): this
  }
}

declare module 'multicast-dns' {
  import { EventEmitter } from 'node:events'

  export interface MdnsAnswer {
    name: string
    type: string
    ttl?: number
    data: Buffer | Buffer[] | string
  }

  export interface MdnsPacket {
    questions?: Array<{ name: string; type: string }>
    answers?: MdnsAnswer[]
  }

  export interface MdnsRinfo {
    address: string
    port: number
  }

  export interface MulticastDns extends EventEmitter {
    query(name: string, type?: string): void
    respond(answers: MdnsAnswer[], rinfo?: MdnsRinfo): void
    destroy(cb?: () => void): void
  }

  export default function multicastDns(opts?: { port?: number }): MulticastDns
}
