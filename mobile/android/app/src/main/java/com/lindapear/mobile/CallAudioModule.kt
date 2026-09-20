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
import android.util.Base64
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Native Android real-time audio pipeline for Linda 1:1 P2P calls.
 * Captures 16 kHz mono PCM16 from the microphone (using VOICE_COMMUNICATION with MIC fallback)
 * and streams received PCM16 chunks directly to the speaker / earpiece via AudioTrack in non-blocking mode.
 */
class CallAudioModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CallAudio"

  private val audioManager: AudioManager by lazy {
    reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  }

  // Synchronization locks
  private val captureLock = Any()
  private val playbackLock = Any()

  // Capture
  private var audioRecord: AudioRecord? = null
  private var captureThread: Thread? = null
  private val isCapturing = AtomicBoolean(false)
  private val isMuted = AtomicBoolean(false)
  private var listenerCount = 0

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
  fun addListener(eventName: String) {
    listenerCount++
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    listenerCount = maxOf(0, listenerCount - count)
  }

  private fun createAudioRecord(bufSize: Int): AudioRecord? {
    val format = AudioFormat.Builder()
      .setSampleRate(SAMPLE_RATE)
      .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
      .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
      .build()

    // 1. Primary: VOICE_COMMUNICATION for hardware Acoustic Echo Cancellation (AEC)
    try {
      val record = AudioRecord.Builder()
        .setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
        .setAudioFormat(format)
        .setBufferSizeInBytes(bufSize)
        .build()
      if (record.state == AudioRecord.STATE_INITIALIZED) {
        return record
      }
      try { record.release() } catch (_: Throwable) {}
    } catch (_: Throwable) {}

    // 2. Fallback: MIC if vendor HAL fails or crashes on VOICE_COMMUNICATION
    try {
      val record = AudioRecord.Builder()
        .setAudioSource(MediaRecorder.AudioSource.MIC)
        .setAudioFormat(format)
        .setBufferSizeInBytes(bufSize)
        .build()
      if (record.state == AudioRecord.STATE_INITIALIZED) {
        return record
      }
      try { record.release() } catch (_: Throwable) {}
    } catch (_: Throwable) {}

    return null
  }

  private fun createAudioTrack(bufSize: Int): AudioTrack? {
    val format = AudioFormat.Builder()
      .setSampleRate(SAMPLE_RATE)
      .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
      .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
      .build()

    // 1. Primary: USAGE_VOICE_COMMUNICATION for voice calls
    try {
      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
      val track = AudioTrack.Builder()
        .setAudioAttributes(attributes)
        .setAudioFormat(format)
        .setBufferSizeInBytes(bufSize)
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()
      if (track.state == AudioTrack.STATE_INITIALIZED) {
        return track
      }
      try { track.release() } catch (_: Throwable) {}
    } catch (_: Throwable) {}

    // 2. Fallback: USAGE_MEDIA
    try {
      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
      val track = AudioTrack.Builder()
        .setAudioAttributes(attributes)
        .setAudioFormat(format)
        .setBufferSizeInBytes(bufSize)
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()
      if (track.state == AudioTrack.STATE_INITIALIZED) {
        return track
      }
      try { track.release() } catch (_: Throwable) {}
    } catch (_: Throwable) {}

    return null
  }

  @ReactMethod
  fun startCapture() {
    synchronized(captureLock) {
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

        val record = createAudioRecord(bufSize) ?: return

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

        val thread = Thread({
          val buffer = ByteArray(PACKET_BYTES)
          while (isCapturing.get() && !Thread.currentThread().isInterrupted) {
            try {
              val rec = audioRecord ?: break
              val read = rec.read(buffer, 0, buffer.size)
              if (read > 0) {
                if (!isMuted.get()) {
                  val base64 = Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP)
                  emitEvent("onAudioCaptureChunk", base64)
                }
              } else if (read < 0) {
                // AudioRecord error code (e.g. ERROR_INVALID_OPERATION, ERROR_DEAD_OBJECT)
                // Sleep to avoid busy-spinning and burning 100% CPU
                try {
                  Thread.sleep(30)
                } catch (_: InterruptedException) {
                  break
                }
              } else {
                // read == 0
                try {
                  Thread.sleep(10)
                } catch (_: InterruptedException) {
                  break
                }
              }
            } catch (_: InterruptedException) {
              break
            } catch (_: Throwable) {
              break
            }
          }
        }, "LindaCallAudioCapture")
        captureThread = thread
        thread.start()
      } catch (_: Throwable) {
        isCapturing.set(false)
        try { audioRecord?.release() } catch (_: Throwable) {}
        audioRecord = null
      }
    }
  }

  @ReactMethod
  fun stopCapture() {
    synchronized(captureLock) {
      if (!isCapturing.compareAndSet(true, false)) {
        val leakedRecord = audioRecord
        val leakedThread = captureThread
        captureThread = null
        audioRecord = null
        if (leakedThread != null || leakedRecord != null) {
          try { leakedRecord?.stop() } catch (_: Throwable) {}
          try { leakedThread?.interrupt(); leakedThread?.join(500) } catch (_: Throwable) {}
          try { leakedRecord?.release() } catch (_: Throwable) {}
        }
        return
      }

      val record = audioRecord
      val thread = captureThread

      // 1. Call stop() FIRST: this unblocks any blocking native rec.read() call in the capture thread
      try {
        record?.let {
          if (it.state == AudioRecord.STATE_INITIALIZED && it.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
            it.stop()
          }
        }
      } catch (_: Throwable) {}

      // 2. Interrupt and wait for captureThread to cleanly finish
      thread?.let {
        try {
          it.interrupt()
          it.join(1000)
        } catch (_: Throwable) {}
      }
      captureThread = null

      // 3. Thread is finished, so it is 100% safe to release native AudioRecord memory without SIGSEGV
      try {
        record?.let {
          if (it.state == AudioRecord.STATE_INITIALIZED) {
            it.release()
          }
        }
      } catch (_: Throwable) {}
      audioRecord = null

      if (!isPlaying.get()) {
        try {
          audioManager.mode = AudioManager.MODE_NORMAL
        } catch (_: Throwable) {}
      }
    }
  }

  @ReactMethod
  fun startPlayback() {
    synchronized(playbackLock) {
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

        val track = createAudioTrack(bufSize) ?: return

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
  }

  @ReactMethod
  fun playChunk(base64Payload: String) {
    if (!isPlaying.get()) return
    val track = audioTrack ?: return
    try {
      if (track.state != AudioTrack.STATE_INITIALIZED || track.playState != AudioTrack.PLAYSTATE_PLAYING) return
      val data = Base64.decode(base64Payload, Base64.DEFAULT)
      if (data.isNotEmpty()) {
        track.write(data, 0, data.size, AudioTrack.WRITE_NON_BLOCKING)
      }
    } catch (_: Throwable) {}
  }

  @ReactMethod
  fun stopPlayback() {
    synchronized(playbackLock) {
      if (!isPlaying.compareAndSet(true, false)) {
        return
      }
      val track = audioTrack
      audioTrack = null
      try {
        track?.let {
          if (it.state == AudioTrack.STATE_INITIALIZED) {
            try { it.stop() } catch (_: Throwable) {}
            try { it.flush() } catch (_: Throwable) {}
            try { it.release() } catch (_: Throwable) {}
          }
        }
      } catch (_: Throwable) {}

      if (!isCapturing.get()) {
        try {
          audioManager.mode = AudioManager.MODE_NORMAL
        } catch (_: Throwable) {}
      }
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
    if (listenerCount <= 0) return
    try {
      if (reactApplicationContext.hasActiveReactInstance()) {
        reactApplicationContext.emitDeviceEvent(eventName, data)
      }
    } catch (_: Throwable) {}
  }
}

