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
  }

  override fun onBind(intent: Intent?): IBinder? = null

  // minSdkVersion is 29 (see mobile/android/gradle.properties), well past the API levels that
  // would make notification channels or FOREGROUND_SERVICE_TYPE_DATA_SYNC optional.
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    return START_STICKY
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
