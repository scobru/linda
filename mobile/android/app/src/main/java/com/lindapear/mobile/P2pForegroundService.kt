package com.lindapear.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder

/**
 * Exists only to keep this process out of Android's background app-standby/Doze bucket while the
 * user has backgrounded Linda without closing it — without a foreground service, the OS suspends
 * the process a few seconds after backgrounding, which kills the Bare worklet's Hyperswarm socket
 * and with it any chance of a P2P message triggering a local notification (there is no push
 * relay: see the "Zero Relay Dependency" section in README.md). Does nothing itself beyond
 * holding a low-priority ongoing notification; the JS side (foreground-service.ts) starts and
 * stops it around AppState transitions.
 */
class P2pForegroundService : Service() {
  companion object {
    private const val CHANNEL_ID = "linda-background-connection"
    private const val NOTIFICATION_ID = 4200

    /**
     * Asks a running (or about-to-run) instance to stop itself — see `ForegroundServiceModule.stop`
     * for why this goes through `onStartCommand` rather than `stopService`.
     */
    const val ACTION_STOP = "com.lindapear.mobile.action.STOP_BACKGROUND_CONNECTION"
  }

  override fun onBind(intent: Intent?): IBinder? = null

  // minSdkVersion is 29 (see mobile/android/gradle.properties), well past the API levels that
  // would make notification channels or FOREGROUND_SERVICE_TYPE_DATA_SYNC optional.
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      // Intents reach this method in the order they were sent, so any start that preceded this
      // stop has already been through the `startForeground` below — the contract is kept.
      try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (_: Throwable) {}
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } catch (_: Throwable) {
      // Refused — a background-start restriction, or the daily dataSync allowance Android 15+
      // imposes having run out. Without the foreground status this service is only a liability
      // (the system would kill the app for not having it), so it leaves instead.
      stopSelf()
      return START_NOT_STICKY
    }
    // Not START_STICKY. This service holds no connection of its own — it only keeps the process
    // that runs the Bare worklet out of Doze (see the class comment), so restarting it after the
    // system has killed that process leaves a foreground notification claiming Linda is connected
    // over a process with no worklet in it. Worse, the empty process it recreates is the one the
    // next launch is placed into, and the JS instance that starts there is the second one to reach
    // the same storage directory: whichever worklet still holds the corestore's lock keeps it, and
    // the new session cannot open. That is the state where nothing but clearing the app's storage
    // appeared to get the user back in.
    return START_NOT_STICKY
  }

  // Swiping Linda out of the recent-apps list tears down its Activity but not, by default, a
  // started service — and this one holding the process up is precisely what kept a stale worklet
  // (and its lock on the store) alive across what the user experienced as closing and reopening the
  // app. Nothing worth keeping runs here once the UI is gone. `android:stopWithTask="true"` in the
  // manifest covers the same case; this is the callback for the devices that route it here instead.
  override fun onTaskRemoved(rootIntent: Intent?) {
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  private fun buildNotification(): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(CHANNEL_ID, "Background connection", NotificationManager.IMPORTANCE_LOW)
    channel.description = "Keeps Linda's P2P connection alive so messages can arrive while the app is backgrounded"
    manager.createNotificationChannel(channel)
    return Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("Linda is running")
      .setContentText("Staying connected so messages can reach you")
      .setSmallIcon(R.mipmap.ic_launcher)
      .setOngoing(true)
      .build()
  }
}
