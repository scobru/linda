import React, { useState, useCallback, useMemo } from 'react'
import {
  View, Text, FlatList, Pressable, StyleSheet,
  TextInput, Alert, Modal, SafeAreaView,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { useSession } from '../hooks/useSession'
import { decodeInvite } from '@core/ui/qr-core'
import RoomListItem from '../components/RoomListItem'
import Avatar from '../components/Avatar'
import { spacing, radii, typography, shadows, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

type Props = NativeStackScreenProps<RootStackParamList, 'Rooms'>

export default function RoomsScreen({ navigation }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { session, identity, nickname, avatar, bookmarks, contacts, refresh } = useSession()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [loading, setLoading] = useState(false)

  const incomingCount = contacts.filter((c) => c.status === 'incoming').length

  const handleCreateRoom = useCallback(async () => {
    if (!session || !roomName.trim()) return
    setLoading(true)
    try {
      const room = await session.createRoom(roomName.trim())
      refresh()
      setShowCreate(false)
      setRoomName('')
      navigation.navigate('RoomChat', { roomId: room.id, roomName: roomName.trim() })
    } catch (err) {
      Alert.alert('Error', (err as Error).message)
    }
    setLoading(false)
  }, [session, roomName, refresh, navigation])

  const handleJoinRoom = useCallback(async () => {
    if (!session || !inviteLink.trim()) return
    setLoading(true)
    try {
      // Try parsing as linda-pear:// invite URL first
      const invite = decodeInvite(inviteLink.trim())
      let room
      if (invite) {
        room = await session.joinRoomByKey(invite.name, invite.key)
      } else {
        // Raw bootstrapKey:inviteCode format
        room = await session.joinRoomByKey('Joined Room', inviteLink.trim())
      }
      refresh()
      setShowJoin(false)
      setInviteLink('')
      navigation.navigate('RoomChat', { roomId: room.id, roomName: invite?.name || 'Joined Room' })
    } catch (err) {
      Alert.alert('Error', (err as Error).message)
    }
    setLoading(false)
  }, [session, inviteLink, refresh, navigation])

  const openRoom = useCallback((id: string, name: string) => {
    navigation.navigate('RoomChat', { roomId: id, roomName: name })
  }, [navigation])

  const handleLeaveRoom = useCallback((id: string, name: string) => {
    if (!session) return
    Alert.alert('Leave room?', `You'll need a new invite to rejoin "${name}".`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive', onPress: () => {
          void session.deleteRoom(id).then(refresh)
        },
      },
    ])
  }, [session, refresh])

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header bar with profile + contacts */}
      <View style={styles.headerBar}>
        <Pressable onPress={() => navigation.navigate('Profile')} style={styles.profileBtn}>
          <Avatar id={identity?.id || ''} label={nickname} imageUrl={avatar} size="sm" />
        </Pressable>
        <Text style={styles.headerTitle}>Linda</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate('Discover')} style={styles.headerBtn}>
            <Ionicons name="compass-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Contacts')} style={styles.headerBtn}>
            <Ionicons name="people-outline" size={20} color={colors.textPrimary} />
            {incomingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{incomingCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Room list */}
      <FlatList
        data={bookmarks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RoomListItem
            id={item.id}
            name={item.name}
            avatar={item.avatar}
            lastMessage={item.lastMessageText ?? undefined}
            timestamp={item.lastMessageTime ?? undefined}
            unread={!!item.lastMessageTime && item.lastMessageTime > (item.lastReadAt ?? 0)}
            onPress={() => openRoom(item.id, item.name)}
            onLongPress={() => handleLeaveRoom(item.id, item.name)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubble-outline" size={48} color={colors.textTertiary} style={styles.emptyEmoji} />
            <Text style={styles.emptyTitle}>No rooms yet</Text>
            <Text style={styles.emptyText}>Create a room or join one with an invite link</Text>
          </View>
        }
        contentContainerStyle={bookmarks.length === 0 ? styles.emptyList : undefined}
      />

      {/* FAB */}
      <View style={styles.fabRow}>
        <Pressable
          onPress={() => setShowJoin(true)}
          style={({ pressed }) => [styles.fabSecondary, pressed && styles.fabPressed]}
        >
          <Ionicons name="link-outline" size={20} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => setShowCreate(true)}
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          <Text style={styles.fabIcon}>+</Text>
        </Pressable>
      </View>

      {/* Create Room Modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Room</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Room name"
              placeholderTextColor={colors.textTertiary}
              value={roomName}
              onChangeText={setRoomName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => { setShowCreate(false); setRoomName('') }} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateRoom}
                disabled={loading || !roomName.trim()}
                style={({ pressed }) => [styles.modalConfirm, pressed && styles.buttonPressed]}
              >
                <Text style={styles.modalConfirmText}>{loading ? 'Creating...' : 'Create'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Join Room Modal */}
      <Modal visible={showJoin} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Join Room</Text>
            <TextInput
              style={[styles.modalInput, styles.inviteInput]}
              placeholder="Paste invite link or key"
              placeholderTextColor={colors.textTertiary}
              value={inviteLink}
              onChangeText={setInviteLink}
              autoFocus
              multiline
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => { setShowJoin(false); setInviteLink('') }} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleJoinRoom}
                disabled={loading || !inviteLink.trim()}
                style={({ pressed }) => [styles.modalConfirm, pressed && styles.buttonPressed]}
              >
                <Text style={styles.modalConfirmText}>{loading ? 'Joining...' : 'Join'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  headerBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.bgSecondary, borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  profileBtn: { marginRight: spacing.md },
  headerTitle: {
    flex: 1, fontSize: typography.xl, fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  headerBtn: { padding: spacing.sm, position: 'relative' },
  headerBtnText: { fontSize: 20 },
  badge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: colors.badgeBg, borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: typography.bold },
  empty: { alignItems: 'center', gap: spacing.sm },
  emptyList: { flex: 1, justifyContent: 'center' },
  emptyEmoji: { fontSize: 48, opacity: 0.5 },
  emptyTitle: { fontSize: typography.lg, fontWeight: typography.semibold, color: colors.textSecondary },
  emptyText: { fontSize: typography.sm, color: colors.textTertiary, textAlign: 'center' },
  fabRow: {
    position: 'absolute', bottom: spacing.xxl, right: spacing.xl,
    flexDirection: 'row', gap: spacing.md, alignItems: 'center',
  },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.accent, alignItems: 'center',
    justifyContent: 'center', ...shadows.glow,
  },
  fabSecondary: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bgElevated, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  fabPressed: { transform: [{ scale: 0.93 }] },
  fabIcon: { color: '#fff', fontSize: 28, fontWeight: typography.bold, marginTop: -2 },
  fabText: { fontSize: 20 },
  modalOverlay: {
    flex: 1, backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    padding: spacing.xxl, gap: spacing.lg,
  },
  modalTitle: {
    fontSize: typography.xl, fontWeight: typography.bold,
    color: colors.textPrimary, textAlign: 'center',
  },
  modalInput: {
    backgroundColor: colors.inputBg, borderRadius: radii.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2,
    color: colors.textPrimary, fontSize: typography.md,
    borderWidth: 1, borderColor: colors.border,
  },
  inviteInput: { height: 80, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: typography.sm },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalCancel: {
    flex: 1, paddingVertical: spacing.md,
    alignItems: 'center', borderRadius: radii.md,
    backgroundColor: colors.bgTertiary,
  },
  modalCancelText: { color: colors.textSecondary, fontSize: typography.md },
  modalConfirm: {
    flex: 1, paddingVertical: spacing.md,
    alignItems: 'center', borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  buttonPressed: { transform: [{ scale: 0.98 }] },
  modalConfirmText: { color: '#fff', fontSize: typography.md, fontWeight: typography.semibold },
})
