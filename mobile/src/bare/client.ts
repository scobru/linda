// RN-side bridge to the Bare worklet (see mobile/worklet/entry.ts). Uses bare-rpc
// (github.com/holepunchto/bare-rpc — the same library Keet uses over bare-kit's IPC) for
// binary-safe, length-framed request/reply. Replaces a hand-rolled newline-delimited JSON
// protocol whose read buffer was rebuilt with string concat+slice on every chunk (O(n^2) on
// bursts of small frames) and could not carry raw bytes without base64 bloat.
// Frame layout (both directions): <4-byte LE header length><JSON header bytes><binary tail>.
import { Worklet } from 'react-native-bare-kit'
import RPC from 'bare-rpc'
// bare-pack output has no type declarations; module.exports is a plain string
import workletBundle from '../../worklet/dist/worklet.bundle.cjs'
import { packFrame, unpackFrame } from './frame.js'

/** Names this app's worklet in bare-kit's process-wide registry. Starting a worklet under a name
 * terminates whichever one held that name before it (see BareKitModule's `worklets` map), which is
 * the only thing that cleans up after an RN instance that was torn down while the process itself
 * survived — Android keeps the process alive whenever the background connection service is running.
 * Without a name, that orphaned runtime lived on holding the corestore's lock, and the fresh one
 * this JS context started could never open the session: login failed until the OS killed the app. */
const WORKLET_ID = 'linda-pear'

/** Deadlines for the calls a screen blocks on with nothing else to offer the user. Everything else
 * stays unbounded on purpose — a join waits on the DHT, a download waits on a peer, and cutting
 * those off would invent failures. These four are the login path: if the worklet is gone or wedged,
 * the alternative to a deadline is "Unlocking..." forever, with no error and no way back. Generous
 * enough that a slow phone deriving the passphrase key still fits inside them. */
const TIMEOUT_MS: Record<string, number> = {
  'identity.unlock': 60_000,
  'identity.create': 60_000,
  'identity.recover': 60_000,
  'session.create': 120_000
}
function withTimeout<T>(work: Promise<T>, method: string): Promise<T> {
  const ms = TIMEOUT_MS[method]
  if (!ms) return work
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`the background runtime did not answer ${method} in time`)),
      ms
    )
    work.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}

class BareClient {
  private worklet = new Worklet(WORKLET_ID)
  private started = false
  private rpc: RPC | null = null
  private listeners = new Map<string, Set<(payload: any) => void>>()

  private ensureStarted(): void {
    if (this.started) return
    this.started = true
    this.worklet.start('/app.bundle', workletBundle)
    this.rpc = new RPC(this.worklet.IPC as any, (req: any) => {
      if (req.reply) return // stray incoming request; the worklet never calls us
      try {
        const { header } = unpackFrame(req.data)
        for (const handler of this.listeners.get(header.event) ?? []) {
          try {
            handler(header.payload)
          } catch (err) {
            console.warn(`[bare-client] listener error for ${header.event}:`, err)
          }
        }
      } catch (err) {
        console.warn('[bare-client] unpackFrame error:', err)
      }
    })
  }

  private async request(method: string, args: unknown[], binary?: Uint8Array): Promise<{ result: any; binary: Uint8Array }> {
    this.ensureStarted()
    // `terminated` is a real getter on bare-kit's Worklet, just missing from its .d.ts. Worth the
    // cast: a request to a dead runtime otherwise sits there until its deadline, or forever.
    if ((this.worklet as unknown as { terminated?: boolean }).terminated === true) {
      throw new Error('the background runtime has stopped — restart the app')
    }
    const req = this.rpc!.request(0)
    req.send(packFrame({ method, args }, binary) as any)
    const replyBuf = await withTimeout<Uint8Array>(req.reply() as unknown as Promise<Uint8Array>, method)
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
