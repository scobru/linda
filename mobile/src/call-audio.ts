import { NativeModules, DeviceEventEmitter, Platform } from 'react-native'

const { CallAudio } = NativeModules

/**
 * Mobile call audio bridge for real-time 16kHz mono PCM16 streaming during P2P calls.
 * Wraps Android's AudioRecord (with hardware AEC) and AudioTrack streaming playback.
 */
class CallAudioManager {
  private isAvailable(): boolean {
    return Platform.OS === 'android' && !!CallAudio
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
    if (!this.isAvailable()) return () => {}
    const subscription = DeviceEventEmitter.addListener('onAudioCaptureChunk', listener)
    return () => subscription.remove()
  }
}

export const callAudio = new CallAudioManager()
