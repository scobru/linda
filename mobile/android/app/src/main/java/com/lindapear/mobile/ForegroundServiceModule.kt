package com.lindapear.mobile

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** JS-facing start/stop for P2pForegroundService — see that class for why it exists. */
class ForegroundServiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ForegroundService"

  /** Whether a `startForegroundService` has gone out that no stop has followed yet. */
  private var started = false

  @ReactMethod
  fun start() {
    // Not skipped when `started` is already set: a second start of a running service is only a
    // second `onStartCommand`, and the flag can outlive a service the system stopped on its own.
    try {
      reactApplicationContext.startForegroundService(Intent(reactApplicationContext, P2pForegroundService::class.java))
      started = true
    } catch (_: Throwable) {
      // Android 12+ refuses a foreground-service start once the app is already in the background
      // (ForegroundServiceStartNotAllowedException), and the AppState event that asks for this can
      // arrive after that point. Thrown here, on the native-modules thread, it would kill the app;
      // losing the background connection for this one trip to the background is the lesser cost.
    }
  }

  /**
   * Stops the service without ever racing its start.
   *
   * This used to be `stopService`. A service started with `startForegroundService` owes the system
   * a `startForeground` call, and stopping it before its `onStartCommand` has run means that call
   * never happens: Android then kills the app with `ForegroundServiceDidNotStartInTimeException`.
   * Backgrounding and returning within moments — a permission dialog, the call screen, the audio
   * routing changing under a call — is exactly that start-then-stop, and it is the crash the
   * v1.14.81 crash report caught during a call. A stop request delivered as an intent is queued
   * behind the start, so the service only stops after it has gone foreground.
   */
  @ReactMethod
  fun stop() {
    if (!started) return
    try {
      reactApplicationContext.startService(
        Intent(reactApplicationContext, P2pForegroundService::class.java).setAction(P2pForegroundService.ACTION_STOP)
      )
      started = false
    } catch (_: Throwable) {
      // Only possible if the app is already in the background again. Falling back to `stopService`
      // would reopen the very race this avoids, so the service stays up and `started` stays set:
      // the next return to the foreground stops it.
    }
  }
}
