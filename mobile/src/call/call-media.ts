import { MediaBackpressure } from '@core/call/media-backpressure'
import { AUDIO_FRAME, VIDEO_FRAME, frameDataUri, type WireMediaFrame } from '../bare/media-frame'

// ---------------------------------------------------------------------------
// A call's media on the phone: what is captured, what is played, and when each starts and stops.
//
// This lived in five effects of `ActiveCallModal`, each switched on and off by its own set of
// dependencies, with nothing anywhere saying what the media of this call should be doing now. The
// ordering between them — a permission prompt still open when the call ended, a capture that
// outlived its call, a mute that never reached the native side — was React's to get right, and it
// was where the bugs were. Here it is one decision, `update`, from one state.
//
// The desktop counterpart is `MediaPipeline` behind `CallOverlay`. The difference is the seams:
// the microphone and speaker are the native `CallAudio` module, frames cross to the worklet as
// base64, and the camera belongs to a view, so each is an adapter the caller hands in.
// ---------------------------------------------------------------------------

/** What the call wants from its media right now. */
export interface CallMediaState {
  /**
   * The call is connected — including while `reconnecting`: the call is held, not over, and
   * tearing the media down for a gap the core is covering would make every blip audible.
   */
  connected: boolean
  muted: boolean
  /** A video call. Remote video is shown only for one. */
  video: boolean
  /** This side's camera is on and allowed: not switched off, and permission granted. */
  cameraOn: boolean
}

/** The native microphone and speaker. */
export interface CallAudioPort {
  startPlayback(): void
  stopPlayback(): void
  /** One base64 PCM16 packet to the speaker. */
  play(chunk: string): void
  startCapture(): void
  stopCapture(): void
  setMuted(muted: boolean): void
  /** Captured base64 PCM16 packets, until the returned function is called. */
  onCapture(listener: (chunk: string) => void): () => void
}

/** The call's frames, to and from the worklet. */
export interface CallFramePort {
  send(frame: { kind: number; payload: string; keyframe: boolean }): void
  onFrame(listener: (frame: WireMediaFrame) => void): () => void
  /** Whether the wire wants more — see `MediaBackpressure`. */
  onPressure(listener: (wantsMore: boolean) => void): () => void
}

export interface CallMediaPorts {
  audio: CallAudioPort
  frames: CallFramePort
  /** Asks for the microphone; resolves whether it was granted. */
  requestMicrophone(): Promise<boolean>
}

/** A camera that is open and ready to take a picture. */
export interface CameraPort {
  /** A base64 JPEG, or null when there was none to take. Rejects when the hardware refuses. */
  capture(): Promise<string | null>
}

export interface CallMediaEvents {
  /** The latest remote video frame as a `data:` URI, or null when there is none to show. */
  onRemoteVideo(uri: string | null): void
}

/** How often the camera is asked for a frame. */
export const VIDEO_CAPTURE_INTERVAL_MS = 500
/** The fewest milliseconds between two remote frames handed to the screen (~12 fps). */
export const REMOTE_VIDEO_MIN_INTERVAL_MS = 80
/** Consecutive capture failures after which the camera is left alone for a while. */
const CAPTURE_FAILURES_BEFORE_BACKOFF = 3
/** How long it is left alone: Camera2 busy or transitioning needs a moment to recover. */
const CAPTURE_BACKOFF_MS = 1500

const IDLE: CallMediaState = { connected: false, muted: false, video: false, cameraOn: false }

export class CallMedia {
  private state: CallMediaState = IDLE
  private camera: CameraPort | null = null
  private readonly backpressure = new MediaBackpressure()
  private readonly stopPressure: () => void

  /** Undoes everything the audio side started; null while it is not running. */
  private audioTeardown: (() => void) | null = null
  private videoTimer: ReturnType<typeof setInterval> | null = null
  private lastRemoteVideoAt = 0
  private disposed = false

  constructor(private readonly ports: CallMediaPorts, private readonly events: CallMediaEvents) {
    this.stopPressure = ports.frames.onPressure((wantsMore) => this.backpressure.update(wantsMore, Date.now()))
  }

  /** Brings the media in line with `next`: starts what it needs, stops what it no longer does. */
  update(next: CallMediaState): void {
    if (this.disposed) return
    const prev = this.state
    this.state = next

    if (next.muted !== prev.muted) this.ports.audio.setMuted(next.muted)

    if (next.connected && !this.audioTeardown) this.startAudio()
    else if (!next.connected && this.audioTeardown) this.stopAudio()

    if (prev.connected && prev.video && !(next.connected && next.video)) this.events.onRemoteVideo(null)

    this.syncVideoCapture()
  }

  /**
   * The camera is open and ready, or (null) it is not: closed, switching lenses, or failed. No
   * frame is taken without one — a frame taken before the camera has settled its capture size is
   * a full-sensor one, which is what once ran a phone out of memory.
   */
  attachCamera(camera: CameraPort | null): void {
    if (this.disposed) return
    this.camera = camera
    this.syncVideoCapture()
  }

  /** Stops everything, for good. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stopAudio()
    this.stopVideoCapture()
    this.state = IDLE
    this.camera = null
    this.stopPressure()
  }

  private startAudio(): void {
    const { audio, frames } = this.ports
    audio.startPlayback()
    // The state at the start: a mute toggled before the call connected has to reach the native
    // side too, and `update` only forwards changes.
    audio.setMuted(this.state.muted)

    let live = true
    let stopCaptureListener: (() => void) | null = null

    // The prompt is async, and the call can end while it is open. Without `live`, the late answer
    // would start a microphone nothing was left to stop: the `AudioRecord` and its thread outlived
    // the call, and the next call's `startCapture` returned early against the stale one.
    void this.ports.requestMicrophone()
      .then((granted) => {
        if (!live || !granted) return
        stopCaptureListener = audio.onCapture((chunk) => {
          frames.send({ kind: AUDIO_FRAME, payload: chunk, keyframe: true })
        })
        audio.startCapture()
      })
      .catch(() => {})

    const stopFrames = frames.onFrame((frame) => this.receive(frame))

    this.audioTeardown = () => {
      live = false
      stopFrames()
      stopCaptureListener?.()
      audio.stopCapture()
      audio.stopPlayback()
    }
  }

  private stopAudio(): void {
    const teardown = this.audioTeardown
    this.audioTeardown = null
    teardown?.()
  }

  private receive(frame: WireMediaFrame): void {
    if (frame.kind === AUDIO_FRAME) {
      if (frame.payload) this.ports.audio.play(frame.payload)
      return
    }
    if (!this.state.video) return
    const now = Date.now()
    if (now - this.lastRemoteVideoAt < REMOTE_VIDEO_MIN_INTERVAL_MS) return
    const uri = frameDataUri(frame)
    if (!uri) return
    this.lastRemoteVideoAt = now
    this.events.onRemoteVideo(uri)
  }

  private syncVideoCapture(): void {
    const { connected, video, cameraOn } = this.state
    const wanted = connected && video && cameraOn && this.camera !== null
    if (wanted && !this.videoTimer) this.startVideoCapture()
    else if (!wanted && this.videoTimer) this.stopVideoCapture()
  }

  private startVideoCapture(): void {
    let capturing = false
    let failures = 0
    let backoffUntil = 0
    const timer = setInterval(() => {
      const camera = this.camera
      const now = Date.now()
      if (capturing || !camera || now < backoffUntil) return
      // Asked before the camera is, because taking the picture is the expensive half.
      if (!this.backpressure.allowsVideo(now)) return
      capturing = true
      camera.capture()
        .then((jpeg) => {
          failures = 0
          // Still the capture that asked: a stop while the picture was being taken means the call
          // no longer wants it.
          if (jpeg && this.videoTimer === timer) {
            this.ports.frames.send({ kind: VIDEO_FRAME, payload: jpeg, keyframe: true })
          }
        })
        .catch(() => {
          if (++failures >= CAPTURE_FAILURES_BEFORE_BACKOFF) {
            backoffUntil = Date.now() + CAPTURE_BACKOFF_MS
            failures = 0
          }
        })
        .finally(() => { capturing = false })
    }, VIDEO_CAPTURE_INTERVAL_MS)
    this.videoTimer = timer
  }

  private stopVideoCapture(): void {
    if (this.videoTimer) clearInterval(this.videoTimer)
    this.videoTimer = null
    this.backpressure.reset()
  }
}
