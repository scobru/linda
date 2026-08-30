package com.lindapear.mobile

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** JS-facing start/stop for P2pForegroundService — see that class for why it exists. */
class ForegroundServiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ForegroundService"

  @ReactMethod
  fun start() {
    reactApplicationContext.startForegroundService(Intent(reactApplicationContext, P2pForegroundService::class.java))
  }

  @ReactMethod
  fun stop() {
    reactApplicationContext.stopService(Intent(reactApplicationContext, P2pForegroundService::class.java))
  }
}
