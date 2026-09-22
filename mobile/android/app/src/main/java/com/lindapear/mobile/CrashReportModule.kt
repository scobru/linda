package com.lindapear.mobile

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.InputStream
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Tells the app, on its next launch, why it died last time.
 *
 * Nine releases went at the call crash without once seeing it: every fix was read off the code,
 * because the only place the cause was written down was a logcat on a phone nobody had a cable to.
 * Android keeps the answer itself — `ApplicationExitInfo` (API 30+) records how every process of
 * this app ended, and for a native crash (API 31+) the tombstone with the backtrace — so the app
 * can read it back and hand it over. A Java or JS fatal is caught on its way out by the default
 * uncaught-exception handler installed in `MainApplication.onCreate`, which writes the stack to a
 * file first; `ApplicationExitInfo` only says that one crashed, not where.
 */
class CrashReportModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "CrashReport"

  /** The report for the last abnormal exit not yet shown, or null. */
  @ReactMethod
  fun getLastCrash(promise: Promise) {
    val report = try {
      CrashReport.lastUnseen(reactApplicationContext)
    } catch (_: Throwable) {
      null
    }
    promise.resolve(report)
  }

  /** Everything up to now has been shown: the same crash is not reported twice. */
  @ReactMethod
  fun markSeen() {
    CrashReport.markSeen(reactApplicationContext)
  }
}

object CrashReport {
  private const val JAVA_CRASH_FILE = "last-crash.txt"
  private const val PREFS = "linda-crash-report"
  private const val SEEN_AT = "seenAt"
  private const val MAX_TRACE_BYTES = 1 shl 20

  /** Records any uncaught Java/JS exception to a file before the process dies with it. */
  fun install(context: Context) {
    val app = context.applicationContext
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        val stack = StringWriter()
        error.printStackTrace(PrintWriter(stack))
        File(app.filesDir, JAVA_CRASH_FILE)
          .writeText("${System.currentTimeMillis()}\nthread: ${thread.name}\n${stack.toString().take(16_000)}")
      } catch (_: Throwable) {}
      previous?.uncaughtException(thread, error)
    }
  }

  fun markSeen(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putLong(SEEN_AT, System.currentTimeMillis()).apply()
  }

  fun lastUnseen(context: Context): String? {
    val seenAt = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(SEEN_AT, 0L)
    val parts = mutableListOf<String>()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      // Only the latest exit: an older crash followed by a clean one is not what went wrong last.
      val info = am.getHistoricalProcessExitReasons(context.packageName, 0, 1).firstOrNull()
      if (info != null && info.timestamp > seenAt && isAbnormal(info.reason)) {
        parts += describe(info)
      }
    }

    val javaCrash = File(context.filesDir, JAVA_CRASH_FILE)
    if (javaCrash.exists()) {
      val text = javaCrash.readText()
      val at = text.substringBefore('\n').toLongOrNull() ?: 0L
      if (at > seenAt) parts += "Uncaught exception (${stamp(at)}):\n${text.substringAfter('\n')}"
    }

    if (parts.isEmpty()) return null
    return "Device: ${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})\n\n" +
      parts.joinToString("\n\n")
  }

  private fun isAbnormal(reason: Int): Boolean = when (reason) {
    ApplicationExitInfo.REASON_CRASH,
    ApplicationExitInfo.REASON_CRASH_NATIVE,
    ApplicationExitInfo.REASON_ANR,
    ApplicationExitInfo.REASON_LOW_MEMORY,
    ApplicationExitInfo.REASON_SIGNALED,
    ApplicationExitInfo.REASON_INITIALIZATION_FAILURE,
    ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> true
    else -> false
  }

  private fun reasonName(reason: Int): String = when (reason) {
    ApplicationExitInfo.REASON_CRASH -> "CRASH (Java/JS exception)"
    ApplicationExitInfo.REASON_CRASH_NATIVE -> "CRASH_NATIVE"
    ApplicationExitInfo.REASON_ANR -> "ANR (app not responding)"
    ApplicationExitInfo.REASON_LOW_MEMORY -> "LOW_MEMORY"
    ApplicationExitInfo.REASON_SIGNALED -> "SIGNALED"
    ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "INITIALIZATION_FAILURE"
    ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "EXCESSIVE_RESOURCE_USAGE"
    else -> "reason $reason"
  }

  @RequiresApi(Build.VERSION_CODES.R)
  private fun describe(info: ApplicationExitInfo): String {
    val out = StringBuilder()
    out.append("Exit: ${reasonName(info.reason)}, status ${info.status}\n")
    out.append("At: ${stamp(info.timestamp)}\n")
    out.append("Process: ${info.processName}, importance ${info.importance}\n")
    out.append("Memory: pss ${info.pss} kB, rss ${info.rss} kB\n")
    info.description?.let { out.append("Description: $it\n") }

    // A native crash's trace is its tombstone (API 31+), in protobuf; an ANR's is plain text.
    val wantsTrace = info.reason == ApplicationExitInfo.REASON_ANR ||
      (info.reason == ApplicationExitInfo.REASON_CRASH_NATIVE && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
    if (wantsTrace) {
      try {
        info.traceInputStream?.use { stream ->
          val bytes = readCapped(stream)
          out.append("\nTrace:\n")
          out.append(
            if (info.reason == ApplicationExitInfo.REASON_ANR) String(bytes).take(8_000)
            else printableStrings(bytes)
          )
        }
      } catch (_: Throwable) {}
    }
    return out.toString()
  }

  private fun readCapped(stream: InputStream): ByteArray {
    val buffer = java.io.ByteArrayOutputStream()
    val chunk = ByteArray(8192)
    while (buffer.size() < MAX_TRACE_BYTES) {
      val read = stream.read(chunk)
      if (read <= 0) break
      buffer.write(chunk, 0, read)
    }
    return buffer.toByteArray()
  }

  /**
   * The readable text out of a protobuf tombstone: the signal, the abort message, and each frame's
   * library and function name are all stored as plain strings, which is all a report needs. A
   * proper decoder would be a protobuf dependency for the sake of one screen.
   */
  private fun printableStrings(bytes: ByteArray): String {
    val runs = LinkedHashSet<String>()
    val current = StringBuilder()
    fun flush() {
      if (current.length >= 5) runs += current.toString()
      current.setLength(0)
    }
    for (b in bytes) {
      val c = b.toInt() and 0xff
      if (c in 0x20..0x7e) current.append(c.toChar()) else flush()
    }
    flush()
    // Generous on purpose: every thread's backtrace comes before the memory map, and the crashing
    // thread is not necessarily the first.
    return runs.take(400).joinToString("\n").take(24_000)
  }

  private fun stamp(millis: Long): String =
    SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date(millis))
}
