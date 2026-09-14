import type { MediaFrameMessage } from './call-encoding.js'

// ---------------------------------------------------------------------------
// Media Pipeline: Capture & Playback for 1:1 Audio and Audio+Video
//
// Designed to run in the renderer process (Electron / Pear desktop GUI).
// Uses browser-native APIs:
// - getUserMedia for microphone & webcam capture
// - Web Audio API (16kHz PCM) for ultra-low-latency, resilient audio transmission
// - WebCodecs (VP8) with canvas JPEG fallback for video transmission
// - Direct canvas rendering for received video frames
// ---------------------------------------------------------------------------

export interface MediaPipelineConfig {
  callId: string
  audio: boolean
  video: boolean
  onSendFrame: (frame: MediaFrameMessage) => void
}

export class MediaPipeline {
  private callId: string | null = null
  private onSendFrame: ((frame: MediaFrameMessage) => void) | null = null

  // Local media state
  private localStream: MediaStream | null = null
  private isAudioMuted = false
  private isVideoMuted = false

  // Audio capture (Web Audio API)
  private audioContext: AudioContext | null = null
  private audioSource: MediaStreamAudioSourceNode | null = null
  private audioWorkletNode: any = null
  private audioProcessor: ScriptProcessorNode | null = null
  private audioSeq = 0

  // Audio playback (Web Audio API)
  private playbackContext: AudioContext | null = null
  private nextPlayTime = 0

  // Video capture & encoding
  private videoInterval: ReturnType<typeof setInterval> | null = null
  private captureCanvas: HTMLCanvasElement | null = null
  private captureCtx: CanvasRenderingContext2D | null = null
  private videoElementForCapture: HTMLVideoElement | null = null
  private videoEncoder: any = null
  private videoSeq = 0
  private frameCount = 0

  // Video playback & decoding
  private videoDecoder: any = null
  private hasReceivedKeyframe = false
  private peerUsesJpeg = false
  private remoteCanvas: HTMLCanvasElement | null = null
  private remoteCtx: CanvasRenderingContext2D | null = null

  // Attached DOM elements
  private localVideoElement: HTMLVideoElement | null = null

  private active = false

  /** Returns the active local media stream if any. */
  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  /** Formats browser media errors into clear user-friendly error messages. */
  static formatMediaError(err: any): Error {
    const name = err?.name || ''
    const msg = err?.message || String(err)
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return new Error('Microphone or camera permission was denied. Please allow camera and microphone access for Linda in your operating system settings (Settings > Privacy).')
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return new Error('No microphone or camera device was found. Please check that your hardware is properly connected.')
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return new Error('Microphone or camera is currently busy or locked by another application (e.g. Teams, Zoom, browser).')
    }
    if (name === 'OverconstrainedError') {
      return new Error('Your camera or microphone does not support the requested resolution or framerate.')
    }
    return new Error(`Media device error: ${msg}`)
  }

  /** Proactively test or activate microphone and camera permissions. */
  static async testAndRequestPermissions(options: { audio?: boolean; video?: boolean }): Promise<{ audio: boolean; video: boolean; error?: string }> {
    if (typeof window === 'undefined' || !navigator?.mediaDevices) {
      return { audio: false, video: false, error: 'MediaDevices API not supported in this environment' }
    }

    const win = window as unknown as {
      lindaMediaPermissions?: {
        requestPermission: (type: 'microphone' | 'camera') => Promise<boolean>
        getPermissionStatus: (type: 'microphone' | 'camera') => Promise<string>
      }
    }
    if (win?.lindaMediaPermissions) {
      try {
        if (options.audio) await win.lindaMediaPermissions.requestPermission('microphone')
        if (options.video) await win.lindaMediaPermissions.requestPermission('camera')
      } catch (e) {
        console.warn('[media-pipeline] Electron bridge permission error:', e)
      }
    }

    let audioOk = false
    let videoOk = false
    let errorMsg: string | undefined

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: options.audio ?? true,
        video: options.video ?? true
      })
      audioOk = stream.getAudioTracks().length > 0
      videoOk = stream.getVideoTracks().length > 0
      for (const track of stream.getTracks()) track.stop()
    } catch {
      if (options.audio) {
        try {
          const aStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          audioOk = aStream.getAudioTracks().length > 0
          for (const t of aStream.getTracks()) t.stop()
        } catch (aErr) {
          errorMsg = MediaPipeline.formatMediaError(aErr).message
        }
      }
      if (options.video) {
        try {
          const vStream = await navigator.mediaDevices.getUserMedia({ video: true })
          videoOk = vStream.getVideoTracks().length > 0
          for (const t of vStream.getTracks()) t.stop()
        } catch (vErr) {
          if (!errorMsg) errorMsg = MediaPipeline.formatMediaError(vErr).message
        }
      }
    }

    return { audio: audioOk, video: videoOk, error: (!audioOk && !videoOk) ? errorMsg : undefined }
  }

  /** Starts media capture and transmission according to config. */
  async start(config: MediaPipelineConfig): Promise<void> {
    if (typeof window === 'undefined' || !navigator?.mediaDevices) {
      console.warn('[media-pipeline] Browser mediaDevices API not available')
      return
    }

    this.callId = config.callId
    this.onSendFrame = config.onSendFrame
    this.active = true

    // Request permissions via desktop bridge if available
    const win = window as unknown as {
      lindaMediaPermissions?: {
        requestPermission: (type: 'microphone' | 'camera') => Promise<boolean>
      }
    }
    if (win?.lindaMediaPermissions) {
      try {
        if (config.audio) await win.lindaMediaPermissions.requestPermission('microphone')
        if (config.video) await win.lindaMediaPermissions.requestPermission('camera')
      } catch (e) {
        console.warn('[media-pipeline] Pre-requesting permissions via Electron bridge error:', e)
      }
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: config.audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : false,
        video: config.video ? {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 20, max: 30 }
        } : false
      }

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err: any) {
      // Graceful fallback: If video fails (e.g. no camera attached or camera denied) but audio was requested,
      // fallback to audio-only capture so the call still connects
      if (config.video && config.audio) {
        console.warn('[media-pipeline] Video capture failed, attempting audio-only fallback:', err)
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          })
          config.video = false
          this.isVideoMuted = true
        } catch (audioErr) {
          console.error('[media-pipeline] Audio-only fallback also failed:', audioErr)
          throw MediaPipeline.formatMediaError(audioErr)
        }
      } else {
        throw MediaPipeline.formatMediaError(err)
      }
    }

    try {
      if (this.localVideoElement && this.localStream) {
        this.localVideoElement.srcObject = this.localStream
        this.localVideoElement.play().catch(() => {})
      }

      if (config.audio) {
        await this.startAudioCapture()
        this.initAudioPlayback()
      }

      if (config.video) {
        await this.startVideoCapture()
      }

      // Always initialize video decoding so remote video can be received
      // even if local video capture is disabled or audio-only
      this.initVideoDecoding()
    } catch (setupErr) {
      console.error('[media-pipeline] Error setting up capture pipelines:', setupErr)
      this.stop()
      throw setupErr
    }
  }

  /** Binds the local camera preview to a video element. */
  attachLocalVideo(element: HTMLVideoElement | null): void {
    this.localVideoElement = element
    if (element && this.localStream) {
      element.srcObject = this.localStream
      element.play().catch(() => {})
    }
  }

  /** Binds the remote video stream to a canvas element for rendering. */
  attachRemoteCanvas(canvas: HTMLCanvasElement | null): void {
    this.remoteCanvas = canvas
    this.remoteCtx = canvas ? canvas.getContext('2d') : null
  }

  /** Mute or unmute the local microphone. */
  setAudioMuted(muted: boolean): void {
    this.isAudioMuted = muted
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted
      }
    }
  }

  /** Turn local camera on or off. */
  setVideoMuted(muted: boolean): void {
    this.isVideoMuted = muted
    if (this.localStream) {
      for (const track of this.localStream.getVideoTracks()) {
        track.enabled = !muted
      }
    }
  }

  /** Handles an incoming media frame from the remote peer. */
  handleIncomingFrame(frame: MediaFrameMessage): void {
    if (!this.active || frame.callId !== this.callId) return

    if (frame.kind === 0) {
      // Audio frame (PCM 16-bit 16kHz)
      this.playAudioFrame(frame.payload)
    } else if (frame.kind === 1) {
      // Video frame
      this.renderVideoFrame(frame)
    }
  }

  /** Stops all capture and playback and frees hardware resources. */
  stop(): void {
    this.active = false

    if (this.videoInterval) {
      clearInterval(this.videoInterval)
      this.videoInterval = null
    }

    if (this.audioWorkletNode) {
      try {
        this.audioWorkletNode.port.onmessage = null
        this.audioWorkletNode.disconnect()
      } catch {}
      this.audioWorkletNode = null
    }

    if (this.audioProcessor) {
      this.audioProcessor.onaudioprocess = null
      this.audioProcessor.disconnect()
      this.audioProcessor = null
    }
    if (this.audioSource) {
      this.audioSource.disconnect()
      this.audioSource = null
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
    if (this.playbackContext && this.playbackContext.state !== 'closed') {
      this.playbackContext.close().catch(() => {})
      this.playbackContext = null
    }

    if (this.videoEncoder) {
      try { this.videoEncoder.close() } catch {}
      this.videoEncoder = null
    }
    if (this.videoDecoder) {
      try { this.videoDecoder.close() } catch {}
      this.videoDecoder = null
    }
    this.hasReceivedKeyframe = false
    this.peerUsesJpeg = false

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop()
      }
      this.localStream = null
    }

    if (this.videoElementForCapture) {
      this.videoElementForCapture.srcObject = null
      this.videoElementForCapture = null
    }

    if (this.localVideoElement) {
      this.localVideoElement.srcObject = null
    }

    this.callId = null
    this.onSendFrame = null
  }

  // ── Audio Capture & Playback (PCM over Web Audio API) ──────────────────────

  private async startAudioCapture(): Promise<void> {
    if (!this.localStream) return
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.audioContext = new AudioCtx({ sampleRate: 16000 })

    this.audioSource = this.audioContext.createMediaStreamSource(this.localStream)

    // Prefer AudioWorkletNode to avoid ScriptProcessorNode deprecation and main-thread processing
    if (typeof AudioWorkletNode !== 'undefined' && this.audioContext.audioWorklet) {
      try {
        const workletCode = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.bufferSize = 512
    this.buffer = new Int16Array(this.bufferSize)
    this.offset = 0
  }
  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const channel = input[0]
    for (let i = 0; i < channel.length; i++) {
      const val = channel[i] || 0
      const s = Math.max(-1, Math.min(1, val))
      this.buffer[this.offset++] = s < 0 ? s * 0x8000 : s * 0x7FFF
      if (this.offset >= this.bufferSize) {
        const copy = new Uint8Array(this.buffer.slice().buffer)
        this.port.postMessage(copy, [copy.buffer])
        this.offset = 0
      }
    }
    return true
  }
}
registerProcessor('audio-capture-processor', AudioCaptureProcessor)
`
        const blob = new Blob([workletCode], { type: 'application/javascript' })
        const url = URL.createObjectURL(blob)
        try {
          await this.audioContext.audioWorklet.addModule(url)
        } finally {
          URL.revokeObjectURL(url)
        }

        if (!this.active || !this.audioContext) return

        this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor')
        this.audioWorkletNode.port.onmessage = (e: MessageEvent<Uint8Array>) => {
          if (!this.active || this.isAudioMuted || !this.onSendFrame || !this.callId) return
          this.onSendFrame({
            callId: this.callId,
            seq: this.audioSeq++,
            timestamp: Date.now(),
            kind: 0,
            keyframe: true,
            payload: e.data
          })
        }

        this.audioSource.connect(this.audioWorkletNode)
        const silentGain = this.audioContext.createGain()
        silentGain.gain.value = 0
        this.audioWorkletNode.connect(silentGain)
        silentGain.connect(this.audioContext.destination)
        return
      } catch (workletErr) {
        console.warn('[media-pipeline] AudioWorklet setup failed, falling back to ScriptProcessor:', workletErr)
      }
    }

    // Fallback: ScriptProcessor (512 samples @ 16kHz = 32ms per packet)
    this.audioProcessor = this.audioContext.createScriptProcessor(512, 1, 1)

    this.audioProcessor.onaudioprocess = (e) => {
      if (!this.active || this.isAudioMuted || !this.onSendFrame || !this.callId) return

      const input = e.inputBuffer.getChannelData(0)
      // Convert Float32 (-1.0..1.0) to Int16 PCM
      const pcm16 = new Int16Array(input.length)
      for (let i = 0; i < input.length; i++) {
        const val = input[i] ?? 0
        const s = Math.max(-1, Math.min(1, val))
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }

      const payload = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength)

      this.onSendFrame({
        callId: this.callId,
        seq: this.audioSeq++,
        timestamp: Date.now(),
        kind: 0,
        keyframe: true,
        payload
      })
    }

    this.audioSource.connect(this.audioProcessor)
    // Connect to a mute destination to keep the processor ticking without audio feedback
    const silentGain = this.audioContext.createGain()
    silentGain.gain.value = 0
    this.audioProcessor.connect(silentGain)
    silentGain.connect(this.audioContext.destination)
  }

  private initAudioPlayback(): void {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.playbackContext = new AudioCtx({ sampleRate: 16000 })
    this.nextPlayTime = this.playbackContext.currentTime
  }

  private playAudioFrame(payload: Uint8Array): void {
    if (!this.playbackContext || this.playbackContext.state === 'closed') return

    if (this.playbackContext.state === 'suspended') {
      this.playbackContext.resume().catch(() => {})
    }

    // Convert Int16 PCM back to Float32
    const pcm16 = new Int16Array(payload.buffer, payload.byteOffset, payload.byteLength / 2)
    const float32 = new Float32Array(pcm16.length)
    for (let i = 0; i < pcm16.length; i++) {
      const val = pcm16[i] ?? 0
      float32[i] = val / (val < 0 ? 0x8000 : 0x7FFF)
    }

    const audioBuffer = this.playbackContext.createBuffer(1, float32.length, 16000)
    audioBuffer.copyToChannel(float32, 0)

    const source = this.playbackContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.playbackContext.destination)

    const now = this.playbackContext.currentTime
    // Schedule seamlessly with jitter buffer headroom of 25ms
    if (this.nextPlayTime < now) {
      this.nextPlayTime = now + 0.025
    }

    source.start(this.nextPlayTime)
    this.nextPlayTime += audioBuffer.duration
  }

  // ── Video Capture & Playback (WebCodecs VP8 with JPEG fallback) ───────────

  private async startVideoCapture(): Promise<void> {
    if (!this.localStream) return

    this.videoElementForCapture = document.createElement('video')
    this.videoElementForCapture.autoplay = true
    this.videoElementForCapture.muted = true
    this.videoElementForCapture.playsInline = true
    this.videoElementForCapture.srcObject = this.localStream
    await this.videoElementForCapture.play().catch(() => {})

    this.captureCanvas = document.createElement('canvas')
    this.captureCanvas.width = 480
    this.captureCanvas.height = 360
    this.captureCtx = this.captureCanvas.getContext('2d')

    const hasWebCodecs = typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined'

    if (hasWebCodecs) {
      try {
        const VideoEncoderClass = (window as unknown as { VideoEncoder: any }).VideoEncoder
        this.videoEncoder = new VideoEncoderClass({
          output: (chunk: any) => {
            if (!this.active || !this.onSendFrame || !this.callId) return
            const buffer = new Uint8Array(chunk.byteLength)
            chunk.copyTo(buffer)
            this.onSendFrame({
              callId: this.callId,
              seq: this.videoSeq++,
              timestamp: chunk.timestamp,
              kind: 1,
              keyframe: chunk.type === 'key',
              payload: buffer
            })
          },
          error: (err: Error) => {
            console.error('[media-pipeline] VideoEncoder error:', err)
            this.videoEncoder = null
          }
        })

        this.videoEncoder.configure({
          codec: 'vp8',
          width: 480,
          height: 360,
          bitrate: 400_000,
          framerate: 20
        })
      } catch (e) {
        console.warn('[media-pipeline] WebCodecs VideoEncoder configure failed, using JPEG fallback:', e)
        this.videoEncoder = null
      }
    }

    // Capture loop at ~20 fps (50ms interval)
    this.videoInterval = setInterval(() => {
      if (!this.active || this.isVideoMuted || !this.videoElementForCapture || !this.captureCtx || !this.captureCanvas) return

      try {
        this.captureCtx.drawImage(this.videoElementForCapture, 0, 0, this.captureCanvas.width, this.captureCanvas.height)
        this.frameCount++

        if (!this.peerUsesJpeg && this.videoEncoder && this.videoEncoder.state === 'configured') {
          const VideoFrameClass = (window as unknown as { VideoFrame: any }).VideoFrame
          const timestamp = Math.round(performance.now() * 1000)
          const frame = new VideoFrameClass(this.captureCanvas, { timestamp })
          // Keyframe on first frame and every 40 frames (~2 seconds)
          const keyframe = this.frameCount === 1 || this.frameCount % 40 === 1
          this.videoEncoder.encode(frame, { keyFrame: keyframe })
          frame.close()
        } else {
          // JPEG fallback
          this.captureCanvas.toBlob((blob) => {
            if (!blob || !this.active || !this.onSendFrame || !this.callId) return
            blob.arrayBuffer().then((buf) => {
              this.onSendFrame?.({
                callId: this.callId!,
                seq: this.videoSeq++,
                timestamp: Date.now(),
                kind: 1,
                keyframe: true,
                payload: new Uint8Array(buf)
              })
            }).catch(() => {})
          }, 'image/jpeg', 0.5)
        }
      } catch (err) {
        console.warn('[media-pipeline] Error capturing video frame:', err)
      }
    }, 50)
  }

  private initVideoDecoding(): void {
    const hasWebCodecs = typeof (window as unknown as { VideoDecoder?: unknown }).VideoDecoder !== 'undefined'
    if (!hasWebCodecs) return

    try {
      if (this.videoDecoder && this.videoDecoder.state !== 'closed') {
        try { this.videoDecoder.close() } catch {}
      }
      this.hasReceivedKeyframe = false

      const VideoDecoderClass = (window as unknown as { VideoDecoder: any }).VideoDecoder
      this.videoDecoder = new VideoDecoderClass({
        output: (frame: any) => {
          if (this.remoteCanvas && this.remoteCtx) {
            if (this.remoteCanvas.width !== frame.displayWidth || this.remoteCanvas.height !== frame.displayHeight) {
              this.remoteCanvas.width = frame.displayWidth
              this.remoteCanvas.height = frame.displayHeight
            }
            this.remoteCtx.drawImage(frame, 0, 0)
          }
          frame.close()
        },
        error: (err: Error) => {
          console.error('[media-pipeline] VideoDecoder error:', err)
          this.hasReceivedKeyframe = false
        }
      })

      this.videoDecoder.configure({
        codec: 'vp8'
      })
    } catch (err) {
      console.warn('[media-pipeline] VideoDecoder init failed:', err)
      this.videoDecoder = null
      this.hasReceivedKeyframe = false
    }
  }

  private renderVideoFrame(frame: MediaFrameMessage): void {
    const payload = frame.payload
    if (!payload || payload.length === 0) return

    // 1. If payload is an image format (JPEG/PNG/WebP), route directly to ImageBitmap rendering.
    // NEVER pass image payloads into WebCodecs VideoDecoder!
    if (MediaPipeline.isImagePayload(payload)) {
      this.peerUsesJpeg = true
      this.renderImageFrame(payload)
      return
    }

    // 2. Otherwise, treat as WebCodecs encoded video stream (VP8)
    if (!this.videoDecoder || this.videoDecoder.state === 'closed') {
      this.initVideoDecoding()
    }

    if (this.videoDecoder && this.videoDecoder.state === 'configured') {
      const isKey = MediaPipeline.isVp8Keyframe(payload)

      // WebCodecs requires a keyframe after configure() or flush().
      // If we haven't received a keyframe yet and this frame is a delta frame, drop it.
      if (!this.hasReceivedKeyframe) {
        if (!isKey) {
          return
        }
        this.hasReceivedKeyframe = true
      }

      try {
        const EncodedVideoChunkClass = (window as unknown as { EncodedVideoChunk: any }).EncodedVideoChunk
        const chunk = new EncodedVideoChunkClass({
          type: isKey ? 'key' : 'delta',
          timestamp: frame.timestamp,
          data: payload
        })
        this.videoDecoder.decode(chunk)
        return
      } catch (err) {
        console.warn('[media-pipeline] WebCodecs decode failed, falling back to image decoder:', err)
        this.hasReceivedKeyframe = false
      }
    }

    // Fallback: decode as ImageBitmap (works for any image blobs)
    this.renderImageFrame(payload)
  }

  static isImagePayload(payload: Uint8Array): boolean {
    if (payload.length < 2) return false
    // JPEG (FF D8)
    if (payload[0] === 0xff && payload[1] === 0xd8) return true
    // PNG (89 50 4E 47)
    if (payload.length >= 4 && payload[0] === 0x89 && payload[1] === 0x50 && payload[2] === 0x4e && payload[3] === 0x47) return true
    // WebP (RIFF....WEBP)
    if (payload.length >= 12 &&
        payload[0] === 0x52 && payload[1] === 0x49 && payload[2] === 0x46 && payload[3] === 0x46 &&
        payload[8] === 0x57 && payload[9] === 0x45 && payload[10] === 0x42 && payload[11] === 0x50) return true
    return false
  }

  static isVp8Keyframe(payload: Uint8Array): boolean {
    // VP8 Keyframe bitstream specification (RFC 6386 section 9.1):
    // Byte 0, bit 0: 0 = key frame, 1 = interframe
    // Bytes 3..5: start code 0x9D, 0x01, 0x2A
    return (
      payload.length >= 10 &&
      (payload[0]! & 0x01) === 0 &&
      payload[3] === 0x9d &&
      payload[4] === 0x01 &&
      payload[5] === 0x2a
    )
  }

  private renderImageFrame(payload: Uint8Array): void {
    if (typeof createImageBitmap === 'undefined' || !this.remoteCanvas || !this.remoteCtx) return

    let type = 'image/jpeg'
    if (payload.length >= 4 && payload[0] === 0x89 && payload[1] === 0x50 && payload[2] === 0x4e && payload[3] === 0x47) {
      type = 'image/png'
    } else if (payload.length >= 12 && payload[0] === 0x52 && payload[1] === 0x49 && payload[2] === 0x46 && payload[3] === 0x46) {
      type = 'image/webp'
    }

    const blob = new Blob([payload as any], { type })
    createImageBitmap(blob).then((bitmap) => {
      if (!this.remoteCanvas || !this.remoteCtx) {
        bitmap.close()
        return
      }
      if (this.remoteCanvas.width !== bitmap.width || this.remoteCanvas.height !== bitmap.height) {
        this.remoteCanvas.width = bitmap.width
        this.remoteCanvas.height = bitmap.height
      }
      this.remoteCtx.drawImage(bitmap, 0, 0)
      bitmap.close()
    }).catch(() => {})
  }
}
