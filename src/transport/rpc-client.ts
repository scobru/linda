import RPC from 'bare-rpc'
import type { Duplex } from 'streamx'
import { packFrame, unpackFrame } from './frame.js'

/**
 * Client-side RPC transport speaking over a Streamx Duplex (such as pear-run/pear-pipe
 * or an in-memory duplex stream in tests).
 *
 * Uses bare-rpc for request/response and push events, with binary-safe length-prefixed framing.
 */
export class RpcClient {
  private rpc: RPC
  private listeners = new Map<string, Set<(payload: any) => void>>()

  constructor(readonly stream: Duplex) {
    this.rpc = new RPC(stream as any, (req: any) => {
      // In bare-rpc, incoming push events (rpc.event()) do not have a reply() method
      if (req.reply) return
      if (!req.data) return
      try {
        const { header } = unpackFrame(req.data)
        const handlers = this.listeners.get(header.event)
        if (handlers) {
          for (const handler of handlers) handler(header.payload)
        }
      } catch (err) {
        console.error('[rpc-client] failed to handle incoming event:', err)
      }
    })
  }

  async call<T = any>(method: string, ...args: unknown[]): Promise<T> {
    const req = this.rpc.request(0)
    req.send(packFrame({ method, args }) as any)
    const replyBuf = (await req.reply()) as Uint8Array | null
    if (!replyBuf) throw new Error(`Empty RPC reply for ${method}`)
    const { header } = unpackFrame(replyBuf)
    if (!header.ok) throw new Error(header.error || `RPC error in ${method}`)
    return header.result as T
  }

  async callBinary<T = any>(
    method: string,
    args: unknown[],
    binary: Uint8Array
  ): Promise<{ result: T; binary: Uint8Array }> {
    const req = this.rpc.request(0)
    req.send(packFrame({ method, args }, binary) as any)
    const replyBuf = (await req.reply()) as Uint8Array | null
    if (!replyBuf) throw new Error(`Empty RPC reply for ${method}`)
    const { header, binary: replyBinary } = unpackFrame(replyBuf)
    if (!header.ok) throw new Error(header.error || `RPC error in ${method}`)
    return { result: header.result as T, binary: replyBinary }
  }

  on(event: string, handler: (payload: any) => void): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler)
    return () => {
      set?.delete(handler)
      if (set?.size === 0) this.listeners.delete(event)
    }
  }
}
