import React, { useEffect, useState } from 'react'
import { StatusBar, View } from 'react-native'
import { registerGlobals } from 'react-native-webrtc'
import * as Notifications from 'expo-notifications'
import { SessionProvider } from './src/hooks/useSession'
import { ThemeProvider, useTheme } from './src/theme-context'
import Navigation from './src/navigation'
import { identityExists } from './src/bare/identity-client'
import { storageDir } from './src/bare/storage-dir'

// Shims global RTCPeerConnection/MediaStream/navigator.mediaDevices so
// @core/calls/call.ts (written against browser WebRTC globals, shared with desktop) runs unmodified.
registerGlobals()

// Without this, a push arriving while the app is foregrounded is silently swallowed —
// Expo requires an explicit handler to opt into showing it as a banner/alert.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

function AppShell() {
  const { colors, isDark } = useTheme()
  const [initialRoute, setInitialRoute] = useState<'Create' | 'Unlock' | null>(null)

  useEffect(() => {
    void identityExists(storageDir()).then((exists) => setInitialRoute(exists ? 'Unlock' : 'Create'))
  }, [])

  if (!initialRoute) return <View style={{ flex: 1, backgroundColor: colors.bgPrimary }} />

  return (
    <SessionProvider>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.bgPrimary} />
      <Navigation initialRoute={initialRoute} />
    </SessionProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  )
}
