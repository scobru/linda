import { Alert, NativeModules, Platform, Share } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { APP_VERSION } from '@core/version'

const { CrashReport } = NativeModules

/**
 * If the app died abnormally last time, says so and offers the report — see `CrashReportModule.kt`.
 *
 * The report is what Android recorded (the exit reason and, for a native crash, the tombstone's
 * backtrace) plus the stack of any uncaught Java/JS exception. It is shown once, then marked seen,
 * whether or not it is copied: a notice that comes back every launch gets dismissed unread.
 */
export async function reportLastCrash(): Promise<void> {
  if (Platform.OS !== 'android' || !CrashReport) return
  let report: string | null = null
  try {
    report = await CrashReport.getLastCrash()
  } catch {
    return
  }
  if (!report) return
  CrashReport.markSeen()

  const full = `Linda ${APP_VERSION}\n${report}`
  const preview = full.length > 900 ? `${full.slice(0, 900)}…` : full
  Alert.alert('Linda closed unexpectedly last time', preview, [
    { text: 'Close', style: 'cancel' },
    { text: 'Copy', onPress: () => { void Clipboard.setStringAsync(full) } },
    { text: 'Share', onPress: () => { void Share.share({ message: full }).catch(() => {}) } }
  ])
}
