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
  private remoteCanvas: HTMLCanvasElement | null = null
  private remoteCtx: CanvasRenderingContext2D | null = null

  // Attached DOM elements
  private localVideoElement: HTMLVideoElement | null = null

  private active = false

  /** Starts media capture and transmission according to config. */
  async start(config: MediaPipelineConfig): Promise<void> {
    if (typeof window === 'undefined' || !navigator?.mediaDevices) {
      console.warn('[media-pipeline] Browser mediaDevices API not available')
      return
    }

    this.callId = config.callId
    this.onSendFrame = config.onSendFrame
    this.active = true

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

      if (this.localVideoElement) {
        this.localVideoElement.srcObject = this.localStream
        this.localVideoElement.play().catch(() => {})
      }

      if (config.audio) {
        this.startAudioCapture()
        this.initAudioPlayback()
      }

      if (config.video) {
        await this.startVideoCapture()
        this.initVideoDecoding()
      }
    } catch (err) {
      console.error('[media-pipeline] Error starting media capture:', err)
      throw err
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

    if (this.audioProcessor) {
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

  private startAudioCapture(): void {
    if (!this.localStream) return
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.audioContext = new AudioCtx({ sampleRate: 16000 })

    this.audioSource = this.audioContext.createMediaStreamSource(this.localStream)

    // ScriptProcessor (512 samples @ 16kHz = 32ms per packet)
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
          error: (err: Error) => console.error('[media-pipeline] VideoEncoder error:', err)
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

        if (this.videoEncoder && this.videoEncoder.state === 'configured') {
          const VideoFrameClass = (window as unknown as { VideoFrame: any }).VideoFrame
          const frame = new VideoFrameClass(this.captureCanvas, { timestamp: performance.now() * 1000 })
          // Keyframe every 40 frames (~2 seconds)
          const keyframe = this.frameCount % 40 === 1
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
    if (hasWebCodecs && this.videoEncoder) {
      try {
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
          error: (err: Error) => console.error('[media-pipeline] VideoDecoder error:', err)
        })

        this.videoDecoder.configure({
          codec: 'vp8'
        })
      } catch (err) {
        console.warn('[media-pipeline] VideoDecoder init failed:', err)
        this.videoDecoder = null
      }
    }
  }

  private renderVideoFrame(frame: MediaFrameMessage): void {
    if (this.videoDecoder && this.videoDecoder.state === 'configured') {
      try {
        const EncodedVideoChunkClass = (window as unknown as { EncodedVideoChunk: any }).EncodedVideoChunk
        const chunk = new EncodedVideoChunkClass({
          type: frame.keyframe ? 'key' : 'delta',
          timestamp: frame.timestamp,
          data: frame.payload
        })
        this.videoDecoder.decode(chunk)
        return
      } catch (err) {
        console.warn('[media-pipeline] WebCodecs decode failed, trying fallback:', err)
      }
    }

    // Fallback: decode as ImageBitmap (works for JPEG/PNG/WebP blobs)
    if (typeof createImageBitmap !== 'undefined' && this.remoteCanvas && this.remoteCtx) {
      const blob = new Blob([frame.payload as any], { type: 'image/jpeg' })
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
}
