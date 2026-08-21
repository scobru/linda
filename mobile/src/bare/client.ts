// RN-side bridge to the Bare worklet (see mobile/worklet/entry.ts). Uses bare-rpc
// (github.com/holepunchto/bare-rpc — the same library Keet uses over bare-kit's IPC) for
// binary-safe, length-framed request/reply. Replaces a hand-rolled newline-delimited JSON
// protocol whose read buffer was rebuilt with string concat+slice on every chunk (O(n^2) on
// bursts of small frames) and could not carry raw bytes without base64 bloat.
// Frame layout (both directions): <4-byte LE header length><JSON header bytes><binary tail>.
import { Worklet } from 'react-native-bare-kit'
import RPC from 'bare-rpc'
import b4a from 'b4a'
// bare-pack output has no type declarations; module.exports is a plain string
import workletBundle from '../../worklet/dist/worklet.bundle.cjs'

function packFrame(header: unknown, binary?: Uint8Array): Uint8Array {
  const json = b4a.from(JSON.stringify(header), 'utf8')
  const lenPrefix = new Uint8Array(4)
  new DataView(lenPrefix.buffer).setUint32(0, json.byteLength, true)
  return binary && binary.byteLength ? b4a.concat([lenPrefix, json, binary]) : b4a.concat([lenPrefix, json])
}

function unpackFrame(buf: Uint8Array): { header: any; binary: Uint8Array } {
  const headerLen = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, true)
  const header = JSON.parse(b4a.toString(buf.subarray(4, 4 + headerLen), 'utf8'))
  return { header, binary: buf.subarray(4 + headerLen) }
}

class BareClient {
  private worklet = new Worklet()
  private started = false
  private rpc: RPC | null = null
  private listeners = new Map<string, Set<(payload: any) => void>>()

  private ensureStarted(): void {
    if (this.started) return
    this.started = true
    this.worklet.start('/app.bundle', workletBundle)
    this.rpc = new RPC(this.worklet.IPC as any, (req: any) => {
      if (req.reply) return // stray incoming request; the worklet never calls us
      const { header } = unpackFrame(req.data)
      for (const handler of this.listeners.get(header.event) ?? []) handler(header.payload)
    })
  }

  private async request(method: string, args: unknown[], binary?: Uint8Array): Promise<{ result: any; binary: Uint8Array }> {
    this.ensureStarted()
    const req = this.rpc!.request(0)
    req.send(packFrame({ method, args }, binary) as any)
    const replyBuf: Uint8Array = await (req.reply() as unknown as Promise<Uint8Array>)
    const { header, binary: replyBinary } = unpackFrame(replyBuf)
    if (!header.ok) throw new Error(header.error)
    return { result: header.result, binary: replyBinary }
  }

  call<T = any>(method: string, ...args: unknown[]): Promise<T> {
    return this.request(method, args).then((r) => r.result)
  }

  /** Like call(), but `binary` rides as a raw trailing byte range instead of JSON/base64 —
   * for file payloads, where that avoids a 33% size hit plus JSON string-escaping. */
  callBinary<T = any>(method: string, args: unknown[], binary: Uint8Array): Promise<{ result: T; binary: Uint8Array }> {
    return this.request(method, args, binary)
  }

  on(event: string, handler: (payload: any) => void): () => void {
    this.ensureStarted()
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler)
    return () => set!.delete(handler)
  }
}

export const bareClient = new BareClient()
