import React from 'react'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { typography, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

import CreateScreen from '../screens/CreateScreen'
import UnlockScreen from '../screens/UnlockScreen'
import RecoverScreen from '../screens/RecoverScreen'
import PairScreen from '../screens/PairScreen'
import PairDeviceScreen from '../screens/PairDeviceScreen'
import RoomsScreen from '../screens/RoomsScreen'
import RoomChatScreen from '../screens/RoomChatScreen'
import ContactsScreen from '../screens/ContactsScreen'
import ProfileScreen from '../screens/ProfileScreen'
import InviteScreen from '../screens/InviteScreen'
import MembersScreen from '../screens/MembersScreen'
import DiscoverScreen from '../screens/DiscoverScreen'
import NetworkStatusScreen from '../screens/NetworkStatusScreen'

export type RootStackParamList = {
  Create: undefined
  Unlock: undefined
  Recover: undefined
  Pair: undefined
  PairDevice: undefined
  Rooms: undefined
  RoomChat: { roomId?: string; roomName: string; pendingJoin?: { name: string; key: string } }
  Contacts: undefined
  Profile: undefined
  /** `contact: true` invites one person straight into a private chat, creating the room on the
   * way — no `roomId` to pass in, because it does not exist until the screen opens. */
  Invite: { roomId?: string; roomName?: string; contact?: boolean }
  Members: { roomId: string; roomName: string }
  Discover: undefined
  NetworkStatus: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

function navTheme(colors: ThemeColors, isDark: boolean) {
  return {
    ...DefaultTheme,
    dark: isDark,
    colors: {
      ...DefaultTheme.colors,
      primary: colors.accent,
      background: colors.bgPrimary,
      card: colors.bgSecondary,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.badgeBg,
    },
  }
}

function screenOptions(colors: ThemeColors) {
  return {
    headerStyle: { backgroundColor: colors.bgSecondary },
    headerTintColor: colors.textPrimary,
    headerTitleStyle: {
      fontWeight: typography.semibold,
      fontSize: typography.lg,
    },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: colors.bgPrimary },
    animation: 'slide_from_right' as const,
  }
}

interface Props {
  initialRoute: 'Create' | 'Unlock'
}

export default function Navigation({ initialRoute }: Props) {
  const { colors, isDark } = useTheme()
  return (
    <NavigationContainer theme={navTheme(colors, isDark)}>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={screenOptions(colors)}>
        {/* Auth screens — no header */}
        <Stack.Screen name="Create" component={CreateScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Unlock" component={UnlockScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Recover" component={RecoverScreen} options={{ title: 'Recover Identity' }} />
        <Stack.Screen name="Pair" component={PairScreen} options={{ title: 'Pair This Device' }} />

        {/* Main app screens */}
        <Stack.Screen name="Rooms" component={RoomsScreen} options={{ title: 'Linda', headerBackVisible: false }} />
        <Stack.Screen
          name="RoomChat"
          component={RoomChatScreen}
          options={({ route }) => ({ title: route.params.roomName })}
        />
        <Stack.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Contacts' }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
        <Stack.Screen name="PairDevice" component={PairDeviceScreen} options={{ title: 'Pair a Device' }} />
        <Stack.Screen
          name="Invite"
          component={InviteScreen}
          options={{ title: 'Invite', presentation: 'modal' }}
        />
        <Stack.Screen
          name="Members"
          component={MembersScreen}
          options={{ title: 'Members' }}
        />
        <Stack.Screen
          name="Discover"
          component={DiscoverScreen}
          options={{ title: 'Discover Public Rooms' }}
        />
        <Stack.Screen
          name="NetworkStatus"
          component={NetworkStatusScreen}
          options={{ title: 'Network Status' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
