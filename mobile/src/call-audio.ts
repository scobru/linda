import { NativeModules, NativeEventEmitter, Platform } from 'react-native'

const { CallAudio } = NativeModules

/**
 * DIAGNOSTIC BUILD SWITCH — set back to `true` once the question below is answered.
 *
 * Calls have crashed on connect since v1.14.64, which is the release that added this native audio
 * module. Five attempts have gone at it — the AEC/NoiseSuppressor effects, the event-emitter
 * contract, two use-after-free races on `AudioRecord`/`AudioTrack`, the camera's capture size —
 * and it still crashes. It crashes on voice-only calls too, so nothing about video is involved.
 *
 * Two things arrived together in v1.14.64 and nothing since has told them apart:
 *
 *   1. this module — `AudioRecord`, `AudioTrack`, and whatever the device's audio HAL does with them
 *   2. the worklet bridge, which from that release carries ~31 audio frames a second instead of
 *      the ~5 video ones it carried before (`PLAYABLE_FRAME_KINDS` gained the audio kind)
 *
 * Reading the code cannot separate them; one build can. With this `false`, every method below is a
 * no-op and the native module is never touched, while calls themselves are untouched — they
 * connect, the wire still carries frames, the UI still runs. So:
 *
 *   - calls stop crashing  → it is this module, and the hunt narrows to `CallAudioModule.kt`
 *   - calls still crash    → it is NOT this module, and everything looked at so far is off target
 *
 * ANSWERED: with both halves off, the app stops crashing. It is this module, not the bridge —
 * which carries the same ~31 frames a second either way, since the desktop keeps sending them and
 * the worklet keeps pushing them across; only the native calls below were skipped.
 *
 * So the flag is two flags now, one per half, and the next build narrows it again the same way:
 * turn on exactly one and see which brings the crash back. Capture is the richer suspect — it owns
 * a thread and an `AudioRecord` and talks to the HAL through `VOICE_COMMUNICATION` — but playback
 * has its own `AudioTrack`, and guessing between them is what the last five releases were.
 *
 * BOTH BACK ON in v1.14.79. The builds that crashed were also the builds in which every call lost
 * its connection the moment the app returned to the foreground — and the microphone permission
 * dialog closing is such a return, landing exactly as `startCapture` runs. v1.14.78 stopped that
 * self-inflicted drop, so the module has never yet run under a call that stays up. If the crash
 * comes back, the split above is still here: turn exactly one of these off and rebuild.
 *
 * IT CAME BACK in v1.14.79, and still with playback alone in v1.14.80 — and the crash report
 * v1.14.81 added finally showed what it was: `ForegroundServiceDidNotStartInTimeException`, from
 * the background-connection service being stopped before it could go foreground. Not this module
 * at all; see `ForegroundServiceModule.stop`. Both halves are back on in v1.14.82 with that fixed.
 * Should the app die during a call again, the report on the next launch says where.
 */
export const NATIVE_CALL_CAPTURE_ENABLED = true

/** The other half: `AudioTrack`, fed by `playChunk` from the JS thread. */
export const NATIVE_CALL_PLAYBACK_ENABLED = true

/** True when this build touches the native module at all — what the UI reads. */
export const NATIVE_CALL_AUDIO_ENABLED = NATIVE_CALL_CAPTURE_ENABLED || NATIVE_CALL_PLAYBACK_ENABLED

const callAudioEmitter = (NATIVE_CALL_CAPTURE_ENABLED && Platform.OS === 'android' && CallAudio)
  ? new NativeEventEmitter(CallAudio)
  : null

/**
 * Mobile call audio bridge for real-time 16kHz mono PCM16 streaming during P2P calls.
 * Wraps Android's AudioRecord (with hardware AEC via VOICE_COMMUNICATION) and AudioTrack streaming playback.
 */
class CallAudioManager {
  private hasModule(): boolean {
    return Platform.OS === 'android' && !!CallAudio
  }

  private captureAvailable(): boolean {
    return NATIVE_CALL_CAPTURE_ENABLED && this.hasModule()
  }

  private playbackAvailable(): boolean {
    return NATIVE_CALL_PLAYBACK_ENABLED && this.hasModule()
  }

  /** Whether this build talks to the native audio module at all — see the switches above. */
  isEnabled(): boolean {
    return NATIVE_CALL_AUDIO_ENABLED && this.hasModule()
  }

  startCapture(): void {
    if (this.captureAvailable()) {
      try {
        CallAudio.startCapture()
      } catch (err) {
        console.warn('[call-audio] startCapture error:', err)
      }
    }
  }

  stopCapture(): void {
    if (this.captureAvailable()) {
      try {
        CallAudio.stopCapture()
      } catch (err) {
        console.warn('[call-audio] stopCapture error:', err)
      }
    }
  }

  startPlayback(): void {
    if (this.playbackAvailable()) {
      try {
        CallAudio.startPlayback()
      } catch (err) {
        console.warn('[call-audio] startPlayback error:', err)
      }
    }
  }

  playChunk(base64Payload: string): void {
    if (this.playbackAvailable() && base64Payload) {
      try {
        CallAudio.playChunk(base64Payload)
      } catch (err) {
        console.warn('[call-audio] playChunk error:', err)
      }
    }
  }

  stopPlayback(): void {
    if (this.playbackAvailable()) {
      try {
        CallAudio.stopPlayback()
      } catch (err) {
        console.warn('[call-audio] stopPlayback error:', err)
      }
    }
  }

  setMuted(muted: boolean): void {
    if (this.captureAvailable()) {
      try {
        CallAudio.setMuted(muted)
      } catch (err) {
        console.warn('[call-audio] setMuted error:', err)
      }
    }
  }

  setSpeakerphoneOn(on: boolean): void {
    if (this.isEnabled()) {
      try {
        CallAudio.setSpeakerphoneOn(on)
      } catch (err) {
        console.warn('[call-audio] setSpeakerphoneOn error:', err)
      }
    }
  }

  stopAll(): void {
    this.stopCapture()
    this.stopPlayback()
  }

  onAudioCaptureChunk(listener: (base64Chunk: string) => void): () => void {
    if (!this.captureAvailable() || !callAudioEmitter) return () => {}
    const subscription = callAudioEmitter.addListener('onAudioCaptureChunk', listener)
    return () => subscription.remove()
  }
}

export const callAudio = new CallAudioManager()

