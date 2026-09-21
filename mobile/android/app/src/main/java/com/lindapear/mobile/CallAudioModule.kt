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

  // Capture. There is deliberately no `audioRecord` field: the record belongs to the capture
  // thread, which is the only code that reads, stops or releases it — see `startCapture`.
  private var captureThread: Thread? = null
  /**
   * The live capture's own run flag, or null when none is running.
   *
   * One flag per thread rather than one shared one, because a stop and an immediate restart can
   * overlap: `stopCapture` only signals, so the outgoing thread may still be finishing when the
   * next `startCapture` has already begun. Sharing a flag would let the old thread's cleanup switch
   * off the new thread's loop. Each generation therefore stops only itself, and only the generation
   * this field still points at is allowed to touch the state below.
   *
   * Volatile, not lock-guarded: the capture thread reads it on its way out, and taking
   * `captureLock` there would deadlock against a `startCapture` waiting on `join`.
   */
  @Volatile private var currentCaptureRun: AtomicBoolean? = null
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

      // A previous capture may still be winding down — `stopCapture` signals and returns without
      // waiting for the thread to notice. Starting a second `AudioRecord` while the first still
      // holds the microphone gets one of them a HAL error, so wait the old one out first.
      captureThread?.let {
        try { it.join(500) } catch (_: Throwable) {}
      }
      captureThread = null

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

        val running = AtomicBoolean(true)
        isCapturing.set(true)
        currentCaptureRun = running

        // The record is captured by the thread and by nothing else. It used to live in a field that
        // `stopCapture` released after a `join(1000)` — a join whose result was never checked, over
        // a comment asserting the thread had finished. When that join timed out, `release()` freed
        // the native object while the thread was still inside `read()`, and a use-after-free in the
        // audio HAL is a SIGSEGV that no `catch (Throwable)` on either side can see.
        //
        // So the thread owns it for its whole life and is the only code that stops or releases it.
        // `stopCapture` now only sets the flag; the loop notices within one packet (~64ms at
        // 16 kHz) and cleans up after itself. The worst case that remains is a thread that never
        // exits, which leaks a microphone rather than killing the process.
        val thread = Thread({
          val buffer = ByteArray(PACKET_BYTES)
          try {
            while (running.get() && !Thread.currentThread().isInterrupted) {
              try {
                val read = record.read(buffer, 0, buffer.size)
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
          } finally {
            // The one place this object is torn down, on the one thread that was ever reading it.
            try {
              if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) record.stop()
            } catch (_: Throwable) {}
            try { record.release() } catch (_: Throwable) {}
            // Shared state only if this is still the capture the module thinks is running. A
            // thread that a restart has already replaced must retire quietly, or its cleanup
            // switches off the capture that took its place.
            if (currentCaptureRun === running) {
              currentCaptureRun = null
              isCapturing.set(false)
              if (!isPlaying.get()) {
                try { audioManager.mode = AudioManager.MODE_NORMAL } catch (_: Throwable) {}
              }
            }
          }
        }, "LindaCallAudioCapture")
        captureThread = thread
        thread.start()
      } catch (_: Throwable) {
        // `thread.start()` itself failing is the only way here once the flags are set, and then no
        // `finally` will ever run to undo them.
        currentCaptureRun = null
        isCapturing.set(false)
      }
    }
  }

  @ReactMethod
  fun stopCapture() {
    synchronized(captureLock) {
      // Signal only. Everything the capture thread owns, the capture thread releases — see the
      // comment in `startCapture`. `interrupt` is for the sleeps in the error paths; the read
      // itself returns within one packet, so the loop notices its flag on its own.
      currentCaptureRun?.set(false)
      currentCaptureRun = null
      isCapturing.set(false)
      captureThread?.interrupt()
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

  /**
   * Writes one received packet to the speaker.
   *
   * Decoding happens outside the lock and the write inside it. The lock is the fix: this read
   * `audioTrack` into a local, checked its state, and then wrote to it, with nothing stopping
   * `stopPlayback` from calling `release()` in between. `AudioTrack.release()` frees the native
   * track *before* it sets the Java state back to uninitialised, so the state check can pass on an
   * object that is already gone — and a write into freed audio memory is a SIGSEGV, not a Java
   * exception, so the `catch` here never saw it.
   *
   * `WRITE_NON_BLOCKING` is what makes holding the lock free: the call returns as soon as it has
   * copied what fits, so it cannot hold up a hang-up.
   */
  @ReactMethod
  fun playChunk(base64Payload: String) {
    if (!isPlaying.get()) return
    val data = try {
      Base64.decode(base64Payload, Base64.DEFAULT)
    } catch (_: Throwable) {
      return
    }
    if (data.isEmpty()) return

    synchronized(playbackLock) {
      if (!isPlaying.get()) return
      val track = audioTrack ?: return
      try {
        if (track.state != AudioTrack.STATE_INITIALIZED || track.playState != AudioTrack.PLAYSTATE_PLAYING) return
        track.write(data, 0, data.size, AudioTrack.WRITE_NON_BLOCKING)
      } catch (_: Throwable) {}
    }
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

