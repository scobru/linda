import React, { useState, useCallback, useMemo, useEffect } from 'react'
import {
  View, Text, FlatList, Pressable, StyleSheet,
  TextInput, Alert, Modal, SafeAreaView, Switch, Linking,
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
  const { session, identity, nickname, avatar, bookmarks, contacts, avatars, refresh } = useSession()
  const [showCreate, setShowCreate] = useState(false)
  const [newRoomBroadcast, setNewRoomBroadcast] = useState(false)
  const [newRoomPublic, setNewRoomPublic] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [loading, setLoading] = useState(false)

  const incomingCount = contacts.filter((c) => c.status === 'incoming').length

  // Bookmark avatars are a snapshot from when the contact was accepted — they never update
  // again on their own, so a 1:1 room keeps showing a peer's old picture after they change it.
  // `avatars` is kept live via presence, so prefer it here when we can map the room back to them.
  const contactAvatarByRoom = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of contacts) {
      if (c.roomId && c.status === 'accepted') map.set(c.roomId, c.userId)
    }
    return map
  }, [contacts])

  const handleCreateRoom = useCallback(async () => {
    if (!session || !roomName.trim()) return
    setLoading(true)
    try {
      const room = await session.createRoom(roomName.trim(), newRoomPublic, '', '', newRoomBroadcast)
      refresh()
      setShowCreate(false)
      setRoomName('')
      setNewRoomBroadcast(false)
      setNewRoomPublic(false)
      navigation.navigate('RoomChat', { roomId: room.id, roomName: roomName.trim() })
    } catch (err) {
      Alert.alert('Error', (err as Error).message)
    }
    setLoading(false)
  }, [session, roomName, newRoomPublic, newRoomBroadcast, refresh, navigation])

  // Navigates immediately and lets RoomChatScreen run the actual join in the background —
  // joinRoomByKey can block for up to ~30s waiting on the swarm (see session.ts's
  // openRoomWithRetry), and there's no reason to freeze this modal for that.
  const joinFromInvite = useCallback((raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    // linda-pear:// invite URL, or raw bootstrapKey:inviteCode
    const invite = decodeInvite(trimmed)
    const key = invite?.key ?? trimmed
    const name = invite?.name || 'Joined Room'
    setShowJoin(false)
    setInviteLink('')
    // A contact link is a room invite plus the sender's identity. Joining it as a plain room
    // would leave the two of them sharing a room and still not knowing each other, which is the
    // entire point of the link.
    if (invite?.kind === 'contact' && invite.from && session) {
      const from = invite.from
      void session.acceptContactInvite({ from, name, key })
        .then((room) => navigation.navigate('RoomChat', { roomId: room.id, roomName: name }))
        .catch((err) => Alert.alert('Could not open the invite', (err as Error).message))
      return
    }
    navigation.navigate('RoomChat', { roomName: name, pendingJoin: { name, key } })
  }, [navigation, session])

  const handleJoinRoom = useCallback(() => joinFromInvite(inviteLink), [joinFromInvite, inviteLink])

  // An invite is a `linda-pear://` link, so it can arrive from anywhere the user was handed one —
  // another messenger, the browser, a QR scanner. Without this the app registered no scheme and
  // handled no deep link, so tapping an invite did nothing at all and the only way in was to copy
  // the text and paste it into the join field, which is not something anyone guesses.
  useEffect(() => {
    const onUrl = (url: string | null) => { if (url) joinFromInvite(url) }
    void Linking.getInitialURL().then(onUrl).catch(() => {})
    const sub = Linking.addEventListener('url', (e) => onUrl(e.url))
    return () => sub.remove()
  }, [joinFromInvite])

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

  // Local-only cutoff (see Session.clearRoomHistory) — hides this device's view of the room's
  // history, doesn't touch the replicated log, so other members/devices are unaffected.
  const handleClearHistory = useCallback((id: string, name: string) => {
    if (!session) return
    Alert.alert(
      'Clear chat history?',
      `This clears all messages in "${name}" from this device only — other members keep their copy.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive', onPress: () => {
            void session.clearRoomHistory(id).then(refresh)
          },
        },
      ]
    )
  }, [session, refresh])

  const handleRoomOptions = useCallback((id: string, name: string, isFavorite: boolean) => {
    Alert.alert(name, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: isFavorite ? 'Remove from Favorites' : 'Add to Favorites', onPress: () => { void session?.setRoomFavorite(id, !isFavorite).then(refresh) } },
      { text: 'Clear Chat History', style: 'destructive', onPress: () => handleClearHistory(id, name) },
      { text: 'Leave Room', style: 'destructive', onPress: () => handleLeaveRoom(id, name) },
    ])
  }, [handleClearHistory, handleLeaveRoom, session, refresh])

  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'favorites'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredBookmarks = useMemo(() => {
    let list = bookmarks
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((b) => b.name.toLowerCase().includes(q) || (b.lastMessageText && b.lastMessageText.toLowerCase().includes(q)))
    }
    if (activeFilter === 'unread') {
      list = list.filter((b) => !!b.lastMessageTime && b.lastMessageTime > (b.lastReadAt ?? 0))
    }
    if (activeFilter === 'favorites') {
      list = list.filter((b) => b.favorite)
    }
    return list
  }, [bookmarks, searchQuery, activeFilter])

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header bar with profile + Linda title + BETA badge + header actions */}
      <View style={styles.headerBar}>
        <Pressable onPress={() => navigation.navigate('Profile')} style={styles.profileBtn}>
          <Avatar id={identity?.id || ''} label={nickname} imageUrl={avatar} size="sm" />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.headerTitle}>Linda</Text>
          <View style={styles.betaBadge}>
            <Text style={styles.betaBadgeText}>BETA</Text>
          </View>
        </View>
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

      {/* Keet Filter Pills Row */}
      <View style={styles.filterPillsRow}>
        <Pressable
          onPress={() => setActiveFilter('all')}
          style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
        >
          <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>All</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveFilter('unread')}
          style={[styles.filterPill, activeFilter === 'unread' && styles.filterPillActive]}
        >
          <Text style={[styles.filterPillText, activeFilter === 'unread' && styles.filterPillTextActive]}>Unread</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveFilter('favorites')}
          style={[styles.filterPill, activeFilter === 'favorites' && styles.filterPillActive]}
        >
          <Text style={[styles.filterPillText, activeFilter === 'favorites' && styles.filterPillTextActive]}>Favorites</Text>
        </Pressable>
      </View>

      {/* Room list */}
      <FlatList
        data={filteredBookmarks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RoomListItem
            id={item.id}
            name={item.name}
            avatar={(() => {
              const peerId = contactAvatarByRoom.get(item.id)
              return (peerId && avatars.get(peerId)) || item.avatar
            })()}
            lastMessage={item.lastMessageText ?? undefined}
            timestamp={item.lastMessageTime ?? undefined}
            unread={!!item.lastMessageTime && item.lastMessageTime > (item.lastReadAt ?? 0)}
            onPress={() => openRoom(item.id, item.name)}
            onLongPress={() => handleRoomOptions(item.id, item.name, !!item.favorite)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.textTertiary} style={styles.emptyEmoji} />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyText}>Create a room or join one with an invite link</Text>
          </View>
        }
        contentContainerStyle={filteredBookmarks.length === 0 ? styles.emptyList : undefined}
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
          <Ionicons name="add" size={28} color="#061e27" />
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
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Broadcast (only admins can post)</Text>
              <Switch value={newRoomBroadcast} onValueChange={setNewRoomBroadcast} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Publish to Discovery Directory</Text>
              <Switch value={newRoomPublic} onValueChange={setNewRoomPublic} />
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => { setShowCreate(false); setRoomName(''); setNewRoomBroadcast(false); setNewRoomPublic(false) }} style={styles.modalCancel}>
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
                disabled={!inviteLink.trim()}
                style={({ pressed }) => [styles.modalConfirm, pressed && styles.buttonPressed]}
              >
                <Text style={styles.modalConfirmText}>Join</Text>
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
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.xl,
    fontWeight: typography.bold,
    color: colors.textPrimary,
  },
  betaBadge: {
    borderWidth: 1,
    borderColor: colors.betaBadge,
    backgroundColor: colors.betaBadgeBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  betaBadgeText: {
    color: colors.betaBadge,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  headerBtn: { padding: spacing.sm, position: 'relative' },
  badge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: colors.cyan, borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: '#061e27', fontSize: 10, fontWeight: typography.bold },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgPrimary,
  },
  filterPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: 'transparent',
  },
  filterPillActive: {
    backgroundColor: colors.accent,
  },
  filterPillText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: typography.semibold,
  },
  filterPillTextActive: {
    color: '#ffffff',
  },
  empty: { alignItems: 'center', gap: spacing.sm },
  emptyList: { flex: 1, justifyContent: 'center' },
  emptyEmoji: { opacity: 0.4 },
  emptyTitle: { fontSize: typography.lg, fontWeight: typography.semibold, color: colors.textSecondary },
  emptyText: { fontSize: typography.sm, color: colors.textTertiary, textAlign: 'center' },
  fabRow: {
    position: 'absolute', bottom: spacing.xxl, right: spacing.xl,
    flexDirection: 'row', gap: spacing.md, alignItems: 'center',
  },
  fab: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: colors.cyan, alignItems: 'center',
    justifyContent: 'center', elevation: 4,
  },
  fabSecondary: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bgElevated, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  fabPressed: { transform: [{ scale: 0.93 }] },
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
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  switchLabel: { color: colors.textSecondary, fontSize: typography.sm, flex: 1 },
  inviteInput: { height: 80, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: typography.sm },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalCancel: {
    flex: 1, paddingVertical: spacing.md,
    alignItems: 'center', borderRadius: radii.full,
    backgroundColor: colors.bgTertiary,
  },
  modalCancelText: { color: colors.textSecondary, fontSize: typography.md, fontWeight: typography.medium },
  modalConfirm: {
    flex: 1, paddingVertical: spacing.md,
    alignItems: 'center', borderRadius: radii.full,
    backgroundColor: colors.cyan,
  },
  buttonPressed: { transform: [{ scale: 0.98 }] },
  modalConfirmText: { color: '#061e27', fontSize: typography.md, fontWeight: typography.bold },
})
