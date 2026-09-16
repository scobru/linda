import RPC from 'bare-rpc'
import type { Duplex } from 'streamx'
import { packFrame, unpackFrame } from './frame.js'
import { withRpcDeadline } from './rpc-deadline.js'

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
        const { header, binary } = unpackFrame(req.data)
        // See `WorkerDispatcher.pushEvent`: bytes that cannot survive JSON ride the tail, and the
        // header names the property they belong to. `slice()` rather than the view itself: the
        // tail starts at `4 + headerLen`, an offset that is odd for half of all headers, and
        // `MediaPipeline` builds an `Int16Array` over `payload.buffer` at `payload.byteOffset` —
        // which throws on an unaligned offset. `new Uint8Array(view)` copies into a fresh buffer
        // starting at 0, and the copy also outlives the received frame. Not `.slice()`: under Node
        // the tail is a `Buffer`, whose `slice` returns another view rather than a copy.
        if (header.binaryField && header.payload) {
          header.payload[header.binaryField] = new Uint8Array(binary)
        }
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
    // Unbounded for everything but the login path — see `rpc-deadline.ts`. Without this, a worker
    // that is alive and not answering left the window on "Unlocking..." with no error and no way
    // back, which is the state mobile fixed for itself and the desktop kept.
    const replyBuf = (await withRpcDeadline(req.reply() as Promise<Uint8Array | null>, method))
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
    const replyBuf = (await withRpcDeadline(req.reply() as Promise<Uint8Array | null>, method))
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
