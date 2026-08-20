import React from 'react'
import {
  View, Text, FlatList, StyleSheet, SafeAreaView,
  SectionList, Alert,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { useContacts } from '../hooks/useContacts'
import { useSession } from '../hooks/useSession'
import ContactListItem from '../components/ContactListItem'
import { spacing, typography, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

type Props = NativeStackScreenProps<RootStackParamList, 'Contacts'>

export default function ContactsScreen({ navigation }: Props) {
  const { colors } = useTheme()
  const styles = React.useMemo(() => createStyles(colors), [colors])
  const { incoming, outgoing, accepted, respond, remove } = useContacts()

  // Without this the rejected promise vanished into an unhandled rejection and the button
  // looked dead — no room created, no response sent, no explanation.
  const answer = (userId: string, accept: boolean) => {
    respond(userId, accept).catch((err: Error) => {
      Alert.alert(accept ? 'Could not accept request' : 'Could not decline request', err.message)
    })
  }

  const confirmRemove = (userId: string, nickname: string) => {
    Alert.alert('Remove contact?', `${nickname || userId.slice(0, 8)} will be removed from your contacts.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove(userId) },
    ])
  }
  const { onlineUsers, avatars } = useSession()

  const sections = [
    ...(incoming.length > 0 ? [{ title: 'Requests', data: incoming }] : []),
    ...(outgoing.length > 0 ? [{ title: 'Pending', data: outgoing }] : []),
    ...(accepted.length > 0 ? [{ title: 'Contacts', data: accepted }] : []),
  ]

  return (
    <SafeAreaView style={styles.safe}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.userId}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <ContactListItem
            userId={item.userId}
            nickname={item.nickname}
            status={item.status}
            avatar={item.avatar || avatars.get(item.userId)}
            online={onlineUsers.has(item.userId)}
            onAccept={() => answer(item.userId, true)}
            onDecline={() => answer(item.userId, false)}
            onRemove={() => confirmRemove(item.userId, item.nickname)}
            onPress={item.roomId ? () => {
              navigation.navigate('RoomChat', {
                roomId: item.roomId!,
                roomName: item.nickname,
              })
            } : undefined}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color={colors.textTertiary} style={styles.emptyEmoji} />
            <Text style={styles.emptyTitle}>No contacts yet</Text>
            <Text style={styles.emptyText}>
              Contacts appear when people in the same room send you a request
            </Text>
          </View>
        }
        contentContainerStyle={sections.length === 0 ? styles.emptyList : undefined}
      />
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: colors.bgSecondary, gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textSecondary, fontSize: typography.xs,
    fontWeight: typography.semibold, textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionCount: {
    color: colors.textTertiary, fontSize: typography.xs,
  },
  empty: { alignItems: 'center', gap: spacing.sm },
  emptyList: { flex: 1, justifyContent: 'center' },
  emptyEmoji: { fontSize: 48, opacity: 0.5 },
  emptyTitle: { fontSize: typography.lg, fontWeight: typography.semibold, color: colors.textSecondary },
  emptyText: { fontSize: typography.sm, color: colors.textTertiary, textAlign: 'center', maxWidth: 280 },
})
