import test from 'node:test'
import assert from 'node:assert/strict'
import { MediaPipeline } from '../src/call/media-pipeline.js'

// ---------------------------------------------------------------------------
// Opening the microphone takes several awaits, and the call can end inside any of them.
//
// `startAudioCapture` creates an `AudioContext`, awaits `resume()`, awaits `audioWorklet
// .addModule()`, and only then attaches its nodes. Meanwhile `stop()` closes that context and
// sets the field to null, and `useAudioCodec` replaces it with one at a different sample rate —
// both of which happen exactly when a call is being accepted.
//
// The guard it had asked whether there was *a* context, not whether it was still *its* context.
// A replacement satisfied that, and a null did not, so a call that ended while the microphone was
// opening walked into `this.audioContext.createScriptProcessor(...)` on null. That exception came
// out of `start()`, so the accept failed with:
//
//   Could not accept call: Cannot read properties of null (reading 'createScriptProcessor')
//
// and the desktop never joined the call at all.
// ---------------------------------------------------------------------------

interface Harness {
  restore(): void
  /** Resolves/rejects the pending `addModule`, which is where the call is made to end. */
  settleAddModule(err?: Error): void
  addModuleCalled(): Promise<void>
  contexts: FakeAudioContext[]
  workletNodesBuilt: number
  scriptProcessorsBuilt: number
}

class FakeAudioNode {
  connect(): void {}
  disconnect(): void {}
}

class FakeAudioContext {
  state = 'running'
  onstatechange: (() => void) | null = null
  closed = false
  /** Playback opens a context of its own; only the ones fed by the microphone are capture. */
  usedForCapture = false
  readonly destination = new FakeAudioNode()
  readonly sampleRate: number
  readonly audioWorklet: { addModule(url: string): Promise<void> }

  constructor(options: { sampleRate: number }, harness: { onAddModule(): Promise<void>; count(kind: 'worklet' | 'script'): void }) {
    this.sampleRate = options.sampleRate
    this.audioWorklet = { addModule: () => harness.onAddModule() }
    this.harness = harness
  }
  private harness: { onAddModule(): Promise<void>; count(kind: 'worklet' | 'script'): void }

  createMediaStreamSource(): FakeAudioNode {
    this.usedForCapture = true
    return new FakeAudioNode()
  }
  createGain(): FakeAudioNode & { gain: { value: number } } {
    return Object.assign(new FakeAudioNode(), { gain: { value: 1 } })
  }
  createScriptProcessor(): FakeAudioNode & { onaudioprocess: unknown } {
    // The line the bug died on. Reaching it on a closed context is itself a fault, even when the
    // reference happens to be non-null.
    assert.equal(this.closed, false, 'a ScriptProcessor must not be built on a closed context')
    this.harness.count('script')
    return Object.assign(new FakeAudioNode(), { onaudioprocess: null })
  }
  resume(): Promise<void> { this.state = 'running'; return Promise.resolve() }
  close(): Promise<void> { this.closed = true; this.state = 'closed'; return Promise.resolve() }
}

function install(): Harness {
  const g = globalThis as unknown as Record<string, unknown>
  // Node defines `navigator` as a getter-only global, so these go on and come off by descriptor
  // rather than by assignment.
  const names = ['window', 'navigator', 'AudioWorkletNode', 'Blob', 'URL'] as const
  const saved = new Map<string, PropertyDescriptor | undefined>(
    names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)])
  )
  const define = (name: string, value: unknown): void => {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  }

  const contexts: FakeAudioContext[] = []
  const counts = { worklet: 0, script: 0 }

  // A queue, not a single slot: two invocations can have a module in flight at once, which is the
  // whole situation under test. Settling takes them in the order they were made.
  const pending: Array<(err?: Error) => void> = []
  let announceCalled: (() => void) | null = null
  const addModuleCalled = new Promise<void>((resolve) => { announceCalled = resolve })

  const shared = {
    onAddModule: () => new Promise<void>((resolve, reject) => {
      pending.push((err?: Error) => (err ? reject(err) : resolve()))
      announceCalled?.()
    }),
    count: (kind: 'worklet' | 'script') => { counts[kind]++ }
  }

  class Ctx extends FakeAudioContext {
    constructor(options: { sampleRate: number }) {
      super(options, shared)
      contexts.push(this)
    }
  }

  class FakeWorkletNode extends FakeAudioNode {
    readonly port = { onmessage: null as unknown }
    constructor() { super(); counts.worklet++ }
  }

  const track = { stop: () => {}, enabled: true }
  const stream = {
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
    getTracks: () => [track]
  }

  define('window', { AudioContext: Ctx })
  define('navigator', { mediaDevices: { getUserMedia: async () => stream } })
  define('AudioWorkletNode', FakeWorkletNode)
  define('Blob', class { constructor(_parts: unknown[], _opts: unknown) {} })
  define('URL', { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} })

  return {
    restore() {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete g[name]
      }
    },
    settleAddModule: (err?: Error) => {
      const next = pending.shift()
      assert.ok(next, 'settleAddModule called with nothing in flight')
      next(err)
    },
    addModuleCalled: () => addModuleCalled,
    contexts,
    get workletNodesBuilt() { return counts.worklet },
    get scriptProcessorsBuilt() { return counts.script }
  }
}

function startPipeline(pipeline: MediaPipeline): Promise<void> {
  return pipeline.start({
    callId: 'call-1',
    audio: true,
    video: false,
    audioCodec: 'pcm16',
    onSendFrame: () => {}
  })
}

test('a call that ends while the microphone is opening does not refuse the call', async (t) => {
  const h = install()
  t.after(() => h.restore())

  const pipeline = new MediaPipeline()
  const started = startPipeline(pipeline)

  // The worklet module is loading. This is where the peer went away.
  await h.addModuleCalled()
  pipeline.stop()

  // The context this invocation owns is now closed and no longer the pipeline's. Whatever
  // `addModule` does next — a closed context typically rejects — must not reach the fallback.
  h.settleAddModule(new Error('AudioContext was closed'))

  await assert.doesNotReject(started, 'start() must not throw; this is what aborted the accept')
  assert.equal(h.scriptProcessorsBuilt, 0, 'nothing may be built for a call that already ended')
  assert.equal(h.workletNodesBuilt, 0)
  assert.equal(h.contexts[0]!.closed, true, 'and the context it opened was closed')
})

test('a codec switch mid-start leaves only the new capture running', async (t) => {
  const h = install()
  t.after(() => h.restore())

  const pipeline = new MediaPipeline()
  const started = startPipeline(pipeline)
  await h.addModuleCalled()

  // The answer named Opus while the floor codec's capture was still opening. This tears the first
  // one down and builds a second at 48kHz — the case a null check cannot see, because the field is
  // not null, it is simply somebody else's.
  const switched = pipeline.useAudioCodec('opus')

  h.settleAddModule(new Error('AudioContext was closed'))
  await assert.doesNotReject(started)

  // The second invocation is now waiting on its own addModule; let it finish.
  h.settleAddModule()
  await switched

  const capture = h.contexts.filter((c) => c.usedForCapture)
  assert.equal(capture.length, 2, 'one capture context per invocation')
  assert.equal(capture[0]!.sampleRate, 16000, 'the floor came up first, during the ring')
  assert.equal(capture[1]!.sampleRate, 48000, 'and Opus replaced it')
  assert.equal(capture[0]!.closed, true, 'the superseded context is closed, not left running')
  assert.equal(capture[1]!.closed, false)
  assert.equal(
    h.workletNodesBuilt, 1,
    'exactly one capture chain — the superseded invocation must not attach to the live context'
  )
  // The damage the null check could not see: the superseded invocation's `addModule` rejects, and
  // falling through built a second, ScriptProcessor-based chain on the *new* context. Two chains
  // then captured the same microphone into one encoder at two packet sizes.
  assert.equal(h.scriptProcessorsBuilt, 0, 'and it must not fall back onto it either')

  pipeline.stop()
})
