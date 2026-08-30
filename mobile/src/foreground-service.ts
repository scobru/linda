import { NativeModules, Platform } from 'react-native'

/**
 * Android-only: keeps the process out of the background app-standby bucket while Linda is
 * backgrounded but not closed, so its P2P socket survives long enough for a message to trigger a
 * local notification. See P2pForegroundService.kt for why this exists — there is no push relay.
 * No iOS equivalent; the native module simply isn't there on that platform.
 */
export function startBackgroundConnection(): void {
  if (Platform.OS === 'android') NativeModules.ForegroundService?.start()
}

export function stopBackgroundConnection(): void {
  if (Platform.OS === 'android') NativeModules.ForegroundService?.stop()
}
