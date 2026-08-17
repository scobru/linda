import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, SafeAreaView, Alert } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { useSession } from '../hooks/useSession'
import Avatar from '../components/Avatar'
import { spacing, radii, typography, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'
import type { RoomAnnounceMessage } from '@core/network/encoding'

type Props = NativeStackScreenProps<RootStackParamList, 'Discover'>

export default function DiscoverScreen({ navigation }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { session, refresh } = useSession()
  const [rooms, setRooms] = useState<RoomAnnounceMessage[]>([])
  const [joiningId, setJoiningId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session) return
    setRooms(await session.listDirectory())
  }, [session])

  useEffect(() => { void load() }, [load])

  const handleJoin = useCallback(async (room: RoomAnnounceMessage) => {
    if (!session) return
    setJoiningId(room.roomId)
    try {
      const joined = await session.joinRoomByKey(room.name, `${room.bootstrapKey}:${room.inviteCode}`)
      refresh()
      navigation.navigate('RoomChat', { roomId: joined.id, roomName: room.name })
    } catch (err) {
      Alert.alert('Error', (err as Error).message)
    }
    setJoiningId(null)
  }, [session, refresh, navigation])

  const handleHide = useCallback(async (roomId: string) => {
    if (!session) return
    await session.removeFromDirectory(roomId)
    setRooms((prev) => prev.filter((r) => r.roomId !== roomId))
  }, [session])

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={rooms}
        keyExtractor={(r) => r.roomId}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar id={item.roomId} label={item.name} imageUrl={item.avatar} />
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.desc} numberOfLines={1}>{item.description || 'Public P2P space'}</Text>
            </View>
            <Pressable onPress={() => handleJoin(item)} disabled={joiningId === item.roomId} style={styles.joinBtn}>
              <Text style={styles.joinText}>{joiningId === item.roomId ? 'Joining…' : 'Join'}</Text>
            </Pressable>
            <Pressable onPress={() => handleHide(item.roomId)} style={styles.hideBtn}>
              <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="compass-outline" size={48} color={colors.textTertiary} style={styles.emptyEmoji} />
            <Text style={styles.emptyTitle}>No public rooms found</Text>
            <Text style={styles.emptyText}>Public rooms appear here as they're discovered on the local swarm</Text>
          </View>
        }
        contentContainerStyle={rooms.length === 0 ? styles.emptyList : undefined}
      />
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  info: { flex: 1, gap: 2 },
  name: { color: colors.textPrimary, fontSize: typography.md, fontWeight: typography.medium },
  desc: { color: colors.textTertiary, fontSize: typography.sm },
  joinBtn: {
    backgroundColor: colors.accent, borderRadius: radii.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  joinText: { color: '#fff', fontSize: typography.sm, fontWeight: typography.semibold },
  hideBtn: { padding: spacing.xs },
  empty: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xxl },
  emptyList: { flex: 1, justifyContent: 'center' },
  emptyEmoji: { fontSize: 48, opacity: 0.5 },
  emptyTitle: { fontSize: typography.lg, fontWeight: typography.semibold, color: colors.textSecondary },
  emptyText: { fontSize: typography.sm, color: colors.textTertiary, textAlign: 'center' },
})
