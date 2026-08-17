// RN-side bridge to the Bare worklet (see mobile/worklet/entry.ts). Same protocol:
// newline-delimited JSON — {id, method, args} requests, {id, ok, result|error} replies,
// {event, payload} pushes (session/room events).
import { Worklet } from 'react-native-bare-kit'
import b4a from 'b4a'
// bare-pack output has no type declarations; module.exports is a plain string
import workletBundle from '../../worklet/dist/worklet.bundle.cjs'

interface Pending {
  resolve(value: any): void
  reject(error: Error): void
}

class BareClient {
  private worklet = new Worklet()
  private started = false
  private nextId = 1
  private pending = new Map<number, Pending>()
  private listeners = new Map<string, Set<(payload: any) => void>>()
  private buffer = ''

  private ensureStarted(): void {
    if (this.started) return
    this.started = true
    this.worklet.start('/app.bundle', workletBundle)
    this.worklet.IPC.on('data', (chunk: unknown) => this.onData(chunk as Uint8Array))
  }

  private onData(chunk: Uint8Array): void {
    this.buffer += b4a.toString(chunk, 'utf8')
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      const frame = JSON.parse(line)
      if (frame.event) {
        for (const handler of this.listeners.get(frame.event) ?? []) handler(frame.payload)
        continue
      }
      const pending = this.pending.get(frame.id)
      if (!pending) continue
      this.pending.delete(frame.id)
      if (frame.ok) pending.resolve(frame.result)
      else pending.reject(new Error(frame.error))
    }
  }

  call<T = any>(method: string, ...args: unknown[]): Promise<T> {
    this.ensureStarted()
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worklet.IPC.write(b4a.from(JSON.stringify({ id, method, args }) + '\n', 'utf8'))
    })
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
