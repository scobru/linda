package com.lindapear.mobile

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.util.Base64
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Native Android real-time audio pipeline for Linda 1:1 P2P calls.
 * Captures 16 kHz mono PCM16 from the microphone (with hardware AEC & noise suppression)
 * and streams received PCM16 chunks directly to the speaker / earpiece via AudioTrack.
 */
class CallAudioModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CallAudio"

  private val audioManager: AudioManager by lazy {
    reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  }

  // Capture
  private var audioRecord: AudioRecord? = null
  private var echoCanceler: AcousticEchoCanceler? = null
  private var noiseSuppressor: NoiseSuppressor? = null
  private var captureThread: Thread? = null
  private val isCapturing = AtomicBoolean(false)
  private val isMuted = AtomicBoolean(false)

  // Playback
  private var audioTrack: AudioTrack? = null
  private val isPlaying = AtomicBoolean(false)

  companion object {
    const val SAMPLE_RATE = 16000
    const val FRAME_SAMPLES = 512 // ~32ms packet size, matching desktop media pipeline
    const val BYTES_PER_SAMPLE = 2
    const val PACKET_BYTES = FRAME_SAMPLES * BYTES_PER_SAMPLE // 1024 bytes
  }

  @ReactMethod
  fun startCapture() {
    if (isCapturing.get()) return

    try {
      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION

      val minBufSize = AudioRecord.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      )
      val bufSize = maxOf(minBufSize, PACKET_BYTES * 4)

      val record = AudioRecord(
        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufSize
      )

      if (record.state != AudioRecord.STATE_INITIALIZED) {
        record.release()
        return
      }

      val sessionId = record.audioSessionId
      if (AcousticEchoCanceler.isAvailable()) {
        try {
          echoCanceler = AcousticEchoCanceler.create(sessionId)?.apply { enabled = true }
        } catch (_: Exception) {}
      }
      if (NoiseSuppressor.isAvailable()) {
        try {
          noiseSuppressor = NoiseSuppressor.create(sessionId)?.apply { enabled = true }
        } catch (_: Exception) {}
      }

      audioRecord = record
      record.startRecording()
      isCapturing.set(true)

      captureThread = Thread({
        val buffer = ByteArray(PACKET_BYTES)
        while (isCapturing.get()) {
          val read = record.read(buffer, 0, buffer.size)
          if (read > 0 && !isMuted.get()) {
            val base64 = Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP)
            emitEvent("onAudioCaptureChunk", base64)
          }
        }
      }, "LindaCallAudioCapture").apply { start() }
    } catch (_: Exception) {
      stopCapture()
    }
  }

  @ReactMethod
  fun stopCapture() {
    isCapturing.set(false)
    captureThread?.let {
      try { it.join(500) } catch (_: Exception) {}
      captureThread = null
    }

    try { echoCanceler?.release() } catch (_: Exception) {}
    echoCanceler = null

    try { noiseSuppressor?.release() } catch (_: Exception) {}
    noiseSuppressor = null

    try {
      audioRecord?.stop()
      audioRecord?.release()
    } catch (_: Exception) {}
    audioRecord = null

    if (!isPlaying.get()) {
      audioManager.mode = AudioManager.MODE_NORMAL
    }
  }

  @ReactMethod
  fun startPlayback() {
    if (isPlaying.get()) return

    try {
      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION

      val minBufSize = AudioTrack.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_OUT_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      )
      val bufSize = maxOf(minBufSize, PACKET_BYTES * 6)

      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()

      val format = AudioFormat.Builder()
        .setSampleRate(SAMPLE_RATE)
        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .build()

      val track = AudioTrack(
        attributes,
        format,
        bufSize,
        AudioTrack.MODE_STREAM,
        AudioManager.AUDIO_SESSION_ID_GENERATE
      )

      if (track.state != AudioTrack.STATE_INITIALIZED) {
        track.release()
        return
      }

      audioTrack = track
      track.play()
      isPlaying.set(true)
    } catch (_: Exception) {
      stopPlayback()
    }
  }

  @ReactMethod
  fun playChunk(base64Payload: String) {
    val track = audioTrack ?: return
    if (!isPlaying.get() || track.playState != AudioTrack.PLAYSTATE_PLAYING) return

    try {
      val data = Base64.decode(base64Payload, Base64.DEFAULT)
      if (data.isNotEmpty()) {
        track.write(data, 0, data.size)
      }
    } catch (_: Exception) {}
  }

  @ReactMethod
  fun stopPlayback() {
    isPlaying.set(false)
    try {
      audioTrack?.stop()
      audioTrack?.flush()
      audioTrack?.release()
    } catch (_: Exception) {}
    audioTrack = null

    if (!isCapturing.get()) {
      audioManager.mode = AudioManager.MODE_NORMAL
    }
  }

  @ReactMethod
  fun setMuted(muted: Boolean) {
    isMuted.set(muted)
  }

  @ReactMethod
  fun setSpeakerphoneOn(on: Boolean) {
    try {
      audioManager.isSpeakerphoneOn = on
    } catch (_: Exception) {}
  }

  override fun onCatalystInstanceDestroy() {
    super.onCatalystInstanceDestroy()
    stopCapture()
    stopPlayback()
  }

  private fun emitEvent(eventName: String, data: String) {
    if (reactApplicationContext.hasActiveReactInstance()) {
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, data)
    }
  }
}
