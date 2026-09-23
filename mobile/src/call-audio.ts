import { NativeModules, NativeEventEmitter, Platform } from 'react-native'
import type { CallAudioPort } from './call/call-media'

const { CallAudio } = NativeModules

/**
 * Whether this device has the native call audio module (`CallAudioModule.kt`): Android only.
 *
 * Its capture and playback halves used to sit behind two diagnostic switches, off from v1.14.71
 * to v1.14.81 while a crash was blamed on them. The crash was the background-connection service
 * (see `ForegroundServiceModule.stop`), and the crash report on the next launch is what now says
 * where a call died, so the switches are gone.
 */
export const callAudioAvailable = Platform.OS === 'android' && !!CallAudio

const emitter = callAudioAvailable ? new NativeEventEmitter(CallAudio) : null

/** Calls the native module, where there is one, without letting a bridge error end the call. */
function native(method: string, ...args: unknown[]): void {
  if (!callAudioAvailable) return
  try {
    CallAudio[method](...args)
  } catch (err) {
    console.warn(`[call-audio] ${method} error:`, err)
  }
}

/**
 * The phone's microphone and speaker, as `CallMedia` uses them: 16 kHz mono PCM16 in base64, over
 * Android's `AudioRecord` (VOICE_COMMUNICATION, for the hardware echo canceller) and `AudioTrack`.
 */
export const nativeCallAudio: CallAudioPort = {
  startPlayback: () => native('startPlayback'),
  stopPlayback: () => native('stopPlayback'),
  play: (chunk) => { if (chunk) native('playChunk', chunk) },
  startCapture: () => native('startCapture'),
  stopCapture: () => native('stopCapture'),
  setMuted: (muted) => native('setMuted', muted),
  onCapture: (listener) => {
    if (!emitter) return () => {}
    const subscription = emitter.addListener('onAudioCaptureChunk', listener)
    return () => subscription.remove()
  }
}
