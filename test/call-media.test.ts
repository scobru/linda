import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  CallMedia, VIDEO_CAPTURE_INTERVAL_MS, REMOTE_VIDEO_MIN_INTERVAL_MS,
  type CallMediaState, type CameraPort
} from '../mobile/src/call/call-media.js'
import { AUDIO_FRAME, VIDEO_FRAME, type WireMediaFrame } from '../mobile/src/bare/media-frame.js'

// ---------------------------------------------------------------------------
// The media of a call on the phone, through its one input: the state the call is in. These are the
// orderings that used to be five React effects agreeing with each other.
// ---------------------------------------------------------------------------

const JPEG = '/9j/4AAQSkZJRg=='

function rig() {
  const log: string[] = []
  const sent: Array<{ kind: number; payload: string }> = []
  const remote: Array<string | null> = []
  let captureListener: ((chunk: string) => void) | null = null
  let frameListener: ((frame: WireMediaFrame) => void) | null = null
  let pressureListener: ((wantsMore: boolean) => void) | null = null
  let grant: (granted: boolean) => void = () => {}

  const media = new CallMedia({
    audio: {
      startPlayback: () => log.push('startPlayback'),
      stopPlayback: () => log.push('stopPlayback'),
      play: (chunk) => log.push(`play:${chunk}`),
      startCapture: () => log.push('startCapture'),
      stopCapture: () => log.push('stopCapture'),
      setMuted: (muted) => log.push(`muted:${muted}`),
      onCapture: (listener) => {
        captureListener = listener
        return () => { captureListener = null }
      }
    },
    frames: {
      send: (frame) => sent.push(frame),
      onFrame: (listener) => {
        frameListener = listener
        return () => { frameListener = null }
      },
      onPressure: (listener) => {
        pressureListener = listener
        return () => { pressureListener = null }
      }
    },
    requestMicrophone: () => new Promise<boolean>((resolve) => { grant = resolve })
  }, {
    onRemoteVideo: (uri) => remote.push(uri)
  })

  return {
    media, log, sent, remote,
    grant: (granted = true) => grant(granted),
    captured: (chunk: string) => captureListener?.(chunk),
    receive: (kind: number, payload: string) =>
      frameListener?.({ callId: 'c', seq: 1, timestamp: 1, kind, keyframe: true, payload }),
    pressure: (wantsMore: boolean) => pressureListener?.(wantsMore),
    get listening() { return { capture: captureListener !== null, frames: frameListener !== null } }
  }
}

const state = (over: Partial<CallMediaState> = {}): CallMediaState =>
  ({ connected: true, muted: false, video: false, cameraOn: false, ...over })

/** Lets pending promise callbacks run. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

test('connecting starts playback, then capture once the microphone is granted', async () => {
  const r = rig()
  r.media.update(state())
  assert.deepEqual(r.log, ['startPlayback', 'muted:false'])
  r.grant()
  await settle()
  assert.deepEqual(r.log.slice(2), ['startCapture'])

  r.captured('pcm')
  assert.deepEqual(r.sent, [{ kind: AUDIO_FRAME, payload: 'pcm', keyframe: true }])
})

test('a call that ends while the microphone prompt is open never starts capture', async () => {
  const r = rig()
  r.media.update(state())
  r.media.update(state({ connected: false }))
  r.grant()
  await settle()
  assert.ok(!r.log.includes('startCapture'), r.log.join(','))
  assert.equal(r.listening.capture, false)
})

test('a refused microphone still plays the peer', async () => {
  const r = rig()
  r.media.update(state())
  r.grant(false)
  await settle()
  assert.ok(!r.log.includes('startCapture'))
  r.receive(AUDIO_FRAME, 'pcm')
  assert.ok(r.log.includes('play:pcm'))
})

test('ending the call stops capture, playback and incoming frames', async () => {
  const r = rig()
  r.media.update(state())
  r.grant()
  await settle()
  r.media.update(state({ connected: false }))
  assert.deepEqual(r.log.slice(-2), ['stopCapture', 'stopPlayback'])
  assert.deepEqual(r.listening, { capture: false, frames: false })
  r.receive(AUDIO_FRAME, 'late')
  assert.ok(!r.log.includes('play:late'))
})

test('staying connected across updates restarts nothing', async () => {
  const r = rig()
  r.media.update(state())
  r.grant()
  await settle()
  const before = r.log.length
  // What a reconnect looks like from here: the call is still connected.
  r.media.update(state())
  r.media.update(state({ muted: false }))
  assert.equal(r.log.length, before)
})

test('a mute made before the call connected reaches the native side when it does', () => {
  const r = rig()
  r.media.update(state({ connected: false, muted: true }))
  r.media.update(state({ muted: true }))
  assert.equal(r.log.at(-1), 'muted:true')
  r.media.update(state({ muted: false }))
  assert.equal(r.log.at(-1), 'muted:false')
})

test('remote video: shown only on a video call, only JPEG, at most every 80 ms, cleared at the end', () => {
  mock.timers.enable({ apis: ['Date'], now: 10_000 })
  try {
    const r = rig()
    r.media.update(state())
    r.receive(VIDEO_FRAME, JPEG)
    assert.deepEqual(r.remote, [], 'not a video call')

    r.media.update(state({ video: true }))
    r.receive(VIDEO_FRAME, JPEG)
    r.receive(VIDEO_FRAME, JPEG)
    assert.equal(r.remote.length, 1, 'the second frame came too soon')

    mock.timers.tick(REMOTE_VIDEO_MIN_INTERVAL_MS)
    r.receive(VIDEO_FRAME, 'not-a-jpeg')
    assert.equal(r.remote.length, 1)
    r.receive(VIDEO_FRAME, JPEG)
    assert.equal(r.remote.length, 2)

    r.media.update(state({ connected: false, video: true }))
    assert.equal(r.remote.at(-1), null)
  } finally {
    mock.timers.reset()
  }
})

function camera(result: () => Promise<string | null>) {
  let taken = 0
  const port: CameraPort = { capture: () => { taken++; return result() } }
  return { port, get taken() { return taken } }
}

test('video capture needs a connected video call, the camera on, and the camera ready', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'], now: 10_000 })
  try {
    const r = rig()
    const cam = camera(async () => JPEG)
    r.media.update(state({ video: true, cameraOn: true }))
    mock.timers.tick(VIDEO_CAPTURE_INTERVAL_MS)
    assert.equal(cam.taken, 0, 'no camera attached yet')

    r.media.attachCamera(cam.port)
    mock.timers.tick(VIDEO_CAPTURE_INTERVAL_MS)
    await settle()
    assert.equal(cam.taken, 1)
    assert.deepEqual(r.sent.at(-1), { kind: VIDEO_FRAME, payload: JPEG, keyframe: true })

    r.media.update(state({ video: true, cameraOn: false }))
    mock.timers.tick(VIDEO_CAPTURE_INTERVAL_MS * 3)
    assert.equal(cam.taken, 1, 'camera turned off')

    r.media.update(state({ video: true, cameraOn: true }))
    r.media.attachCamera(null)
    mock.timers.tick(VIDEO_CAPTURE_INTERVAL_MS * 3)
    assert.equal(cam.taken, 1, 'camera switching lenses')
  } finally {
    mock.timers.reset()
  }
})

test('a picture that finishes after capture stopped is not sent', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'], now: 10_000 })
  try {
    const r = rig()
    let finish: (jpeg: string) => void = () => {}
    const cam = camera(() => new Promise<string>((resolve) => { finish = resolve }))
    r.media.update(state({ video: true, cameraOn: true }))
    r.media.attachCamera(cam.port)
    mock.timers.tick(VIDEO_CAPTURE_INTERVAL_MS)
    r.media.update(state({ connected: false, video: true, cameraOn: true }))
    finish(JPEG)
    await settle()
    assert.ok(!r.sent.some((f) => f.kind === VIDEO_FRAME))
  } finally {
    mock.timers.reset()
  }
})

test('three failed pictures in a row leave the camera alone for a while', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'], now: 10_000 })
  try {
    const r = rig()
    const cam = camera(async () => { throw new Error('camera busy') })
    r.media.update(state({ video: true, cameraOn: true }))
    r.media.attachCamera(cam.port)
    for (let i = 0; i < 3; i++) {
      mock.timers.tick(VIDEO_CAPTURE_INTERVAL_MS)
      await settle()
    }
    assert.equal(cam.taken, 3)
    mock.timers.tick(VIDEO_CAPTURE_INTERVAL_MS)
    await settle()
    assert.equal(cam.taken, 3, 'backing off')
    mock.timers.tick(VIDEO_CAPTURE_INTERVAL_MS * 3)
    await settle()
    assert.ok(cam.taken > 3, 'resumed after the backoff')
  } finally {
    mock.timers.reset()
  }
})

test('a wire that wants no more holds video back but not audio', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'], now: 10_000 })
  try {
    const r = rig()
    const cam = camera(async () => JPEG)
    r.media.update(state({ video: true, cameraOn: true }))
    r.media.attachCamera(cam.port)
    r.grant()
    await settle()
    r.pressure(false)
    mock.timers.tick(VIDEO_CAPTURE_INTERVAL_MS)
    await settle()
    assert.equal(cam.taken, 0)
    r.captured('pcm')
    assert.deepEqual(r.sent.at(-1), { kind: AUDIO_FRAME, payload: 'pcm', keyframe: true })
  } finally {
    mock.timers.reset()
  }
})

test('dispose stops everything and ignores what comes after', async () => {
  const r = rig()
  r.media.update(state())
  r.grant()
  await settle()
  r.media.dispose()
  assert.deepEqual(r.log.slice(-2), ['stopCapture', 'stopPlayback'])
  r.media.update(state())
  assert.equal(r.log.filter((l) => l === 'startPlayback').length, 1)
})
