import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

/**
 * Android takes a notification's sound from its channel, not from the notification, and a
 * channel is immutable once created — changing the tone means publishing a new channel id
 * rather than editing this one.
 *
 * Lives in its own module rather than in App.tsx: the notification is raised from useSession,
 * which App.tsx imports, so keeping the id there would have made the two import each other.
 */
export const NOTIFICATION_CHANNEL_ID = 'messages-ping'

/** Bare name, no extension — that is how Android resolves res/raw resources. */
const CHANNEL_SOUND = 'notification_ping'

export function ensureNotificationChannel(): void {
  if (Platform.OS !== 'android') return
  void Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    sound: CHANNEL_SOUND,
    vibrationPattern: [0, 250, 250, 250],
  })
}
