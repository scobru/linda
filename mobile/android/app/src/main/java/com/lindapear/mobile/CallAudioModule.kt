package com.lindapear.mobile

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
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
    // 1024 samples @ 16kHz is 64ms (~15 packets/sec) — keeps voice latency imperceptible (<70ms)
    // while halving bridge serialization pressure compared to 32ms packets.
    const val FRAME_SAMPLES = 1024
    const val BYTES_PER_SAMPLE = 2
    const val PACKET_BYTES = FRAME_SAMPLES * BYTES_PER_SAMPLE // 2048 bytes
  }

  @ReactMethod
  fun startCapture() {
    if (isCapturing.get()) return

    // Ensure RECORD_AUDIO runtime permission is granted before touching AudioRecord
    if (reactApplicationContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      return
    }

    try {
      try {
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      } catch (_: Throwable) {}

      val minBufSize = AudioRecord.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      )
      if (minBufSize <= 0) return
      val bufSize = maxOf(minBufSize, PACKET_BYTES * 4)

      val record = try {
        AudioRecord(
          MediaRecorder.AudioSource.VOICE_COMMUNICATION,
          SAMPLE_RATE,
          AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT,
          bufSize
        )
      } catch (_: Throwable) {
        null
      } ?: return

      if (record.state != AudioRecord.STATE_INITIALIZED) {
        try { record.release() } catch (_: Throwable) {}
        return
      }

      try {
        val sessionId = record.audioSessionId
        if (AcousticEchoCanceler.isAvailable()) {
          try {
            echoCanceler = AcousticEchoCanceler.create(sessionId)?.apply { enabled = true }
          } catch (_: Throwable) {}
        }
        if (NoiseSuppressor.isAvailable()) {
          try {
            noiseSuppressor = NoiseSuppressor.create(sessionId)?.apply { enabled = true }
          } catch (_: Throwable) {}
        }
      } catch (_: Throwable) {}

      try {
        record.startRecording()
      } catch (_: Throwable) {
        try { record.release() } catch (_: Throwable) {}
        return
      }

      if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        try {
          record.stop()
          record.release()
        } catch (_: Throwable) {}
        return
      }

      audioRecord = record
      isCapturing.set(true)

      captureThread = Thread({
        val buffer = ByteArray(PACKET_BYTES)
        while (isCapturing.get()) {
          try {
            val rec = audioRecord ?: break
            val read = rec.read(buffer, 0, buffer.size)
            if (read > 0 && !isMuted.get()) {
              val base64 = Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP)
              emitEvent("onAudioCaptureChunk", base64)
            }
          } catch (_: Throwable) {
            break
          }
        }
      }, "LindaCallAudioCapture").apply { start() }
    } catch (_: Throwable) {
      stopCapture()
    }
  }

  @ReactMethod
  fun stopCapture() {
    isCapturing.set(false)
    captureThread?.let {
      try { it.join(300) } catch (_: Throwable) {}
      captureThread = null
    }

    try { echoCanceler?.release() } catch (_: Throwable) {}
    echoCanceler = null

    try { noiseSuppressor?.release() } catch (_: Throwable) {}
    noiseSuppressor = null

    try {
      audioRecord?.stop()
      audioRecord?.release()
    } catch (_: Throwable) {}
    audioRecord = null

    if (!isPlaying.get()) {
      try {
        audioManager.mode = AudioManager.MODE_NORMAL
      } catch (_: Throwable) {}
    }
  }

  @ReactMethod
  fun startPlayback() {
    if (isPlaying.get()) return

    try {
      try {
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      } catch (_: Throwable) {}

      val minBufSize = AudioTrack.getMinBufferSize(
        SAMPLE_RATE,
        AudioFormat.CHANNEL_OUT_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      )
      if (minBufSize <= 0) return
      val bufSize = maxOf(minBufSize, PACKET_BYTES * 4)

      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()

      val format = AudioFormat.Builder()
        .setSampleRate(SAMPLE_RATE)
        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .build()

      val track = try {
        AudioTrack(
          attributes,
          format,
          bufSize,
          AudioTrack.MODE_STREAM,
          AudioManager.AUDIO_SESSION_ID_GENERATE
        )
      } catch (_: Throwable) {
        null
      } ?: return

      if (track.state != AudioTrack.STATE_INITIALIZED) {
        try { track.release() } catch (_: Throwable) {}
        return
      }

      try {
        track.play()
        audioTrack = track
        isPlaying.set(true)
      } catch (_: Throwable) {
        try { track.release() } catch (_: Throwable) {}
      }
    } catch (_: Throwable) {
      stopPlayback()
    }
  }

  @ReactMethod
  fun playChunk(base64Payload: String) {
    val track = audioTrack ?: return
    if (!isPlaying.get() || track.state != AudioTrack.STATE_INITIALIZED || track.playState != AudioTrack.PLAYSTATE_PLAYING) return

    try {
      val data = Base64.decode(base64Payload, Base64.DEFAULT)
      if (data.isNotEmpty()) {
        track.write(data, 0, data.size)
      }
    } catch (_: Throwable) {}
  }

  @ReactMethod
  fun stopPlayback() {
    isPlaying.set(false)
    try {
      audioTrack?.stop()
      audioTrack?.flush()
      audioTrack?.release()
    } catch (_: Throwable) {}
    audioTrack = null

    if (!isCapturing.get()) {
      try {
        audioManager.mode = AudioManager.MODE_NORMAL
      } catch (_: Throwable) {}
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
    } catch (_: Throwable) {}
  }

  override fun onCatalystInstanceDestroy() {
    super.onCatalystInstanceDestroy()
    stopCapture()
    stopPlayback()
  }

  private fun emitEvent(eventName: String, data: String) {
    if (reactApplicationContext.hasActiveReactInstance()) {
      reactApplicationContext.runOnJSQueueThread {
        try {
          reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, data)
        } catch (_: Throwable) {}
      }
    }
  }
}
