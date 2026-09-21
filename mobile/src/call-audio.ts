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
 * Either answer is worth a build. Calls have no audio on this one; that is the cost of the answer.
 */
export const NATIVE_CALL_AUDIO_ENABLED = false

const callAudioEmitter = (NATIVE_CALL_AUDIO_ENABLED && Platform.OS === 'android' && CallAudio)
  ? new NativeEventEmitter(CallAudio)
  : null

/**
 * Mobile call audio bridge for real-time 16kHz mono PCM16 streaming during P2P calls.
 * Wraps Android's AudioRecord (with hardware AEC via VOICE_COMMUNICATION) and AudioTrack streaming playback.
 */
class CallAudioManager {
  private isAvailable(): boolean {
    return NATIVE_CALL_AUDIO_ENABLED && Platform.OS === 'android' && !!CallAudio
  }

  /** Whether this build talks to the native audio module at all — see the switch above. */
  isEnabled(): boolean {
    return this.isAvailable()
  }

  startCapture(): void {
    if (this.isAvailable()) {
      try {
        CallAudio.startCapture()
      } catch (err) {
        console.warn('[call-audio] startCapture error:', err)
      }
    }
  }

  stopCapture(): void {
    if (this.isAvailable()) {
      try {
        CallAudio.stopCapture()
      } catch (err) {
        console.warn('[call-audio] stopCapture error:', err)
      }
    }
  }

  startPlayback(): void {
    if (this.isAvailable()) {
      try {
        CallAudio.startPlayback()
      } catch (err) {
        console.warn('[call-audio] startPlayback error:', err)
      }
    }
  }

  playChunk(base64Payload: string): void {
    if (this.isAvailable() && base64Payload) {
      try {
        CallAudio.playChunk(base64Payload)
      } catch (err) {
        console.warn('[call-audio] playChunk error:', err)
      }
    }
  }

  stopPlayback(): void {
    if (this.isAvailable()) {
      try {
        CallAudio.stopPlayback()
      } catch (err) {
        console.warn('[call-audio] stopPlayback error:', err)
      }
    }
  }

  setMuted(muted: boolean): void {
    if (this.isAvailable()) {
      try {
        CallAudio.setMuted(muted)
      } catch (err) {
        console.warn('[call-audio] setMuted error:', err)
      }
    }
  }

  setSpeakerphoneOn(on: boolean): void {
    if (this.isAvailable()) {
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
    if (!this.isAvailable() || !callAudioEmitter) return () => {}
    const subscription = callAudioEmitter.addListener('onAudioCaptureChunk', listener)
    return () => subscription.remove()
  }
}

export const callAudio = new CallAudioManager()

