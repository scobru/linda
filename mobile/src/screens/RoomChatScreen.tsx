import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  View, Text, FlatList, Pressable, StyleSheet,
  TextInput, Alert, ActionSheetIOS, Platform, Modal,
  SafeAreaView,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import * as Clipboard from 'expo-clipboard'
import { createAudioPlayer, type AudioPlayer } from 'expo-audio'
import { RTCView } from 'react-native-webrtc'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { useSession } from '../hooks/useSession'
import { useRoom } from '../hooks/useRoom'
import { useCall } from '../hooks/useCall'
import { downloadFile } from '../bare/room-proxy'
import { listConnectedPeerIds } from '../bare/call-proxy'
import type { ChatMessage } from '@core/rooms/room'
import ChatBubble, { isAudioFile } from '../components/ChatBubble'
import MessageComposer from '../components/MessageComposer'
import Avatar from '../components/Avatar'
import { spacing, radii, typography, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'

type Props = NativeStackScreenProps<RootStackParamList, 'RoomChat'>

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '👀', '🎉', '💯', '🙏']

export default function RoomChatScreen({ route, navigation }: Props) {
  const { colors } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { roomId, roomName } = route.params
  const { session, identity, nicknames, avatars, refresh: refreshSession } = useSession()
  const room = session?.getRoom(roomId)
  const identityId = identity?.id || ''
  const { messages, loading, sendMessage, sendFile, editMessage, deleteMessage, toggleReaction, refreshMessages, hasMore, loadOlder, typingUsers, notifyTyping, readBy } = useRoom(room, identityId)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const lastTailIdRef = useRef<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null)
  const audioPlayerRef = useRef<AudioPlayer | null>(null)
  const { remoteStreams, startCall } = useCall(room, identityId)

  // Mirrors desktop's openRoom: stamp read on open, and again for each message that
  // arrives while this screen is focused (mute the badge, not just a one-time clear).
  useEffect(() => {
    if (!session) return
    session.markRoomRead(roomId).then(refreshSession)
  }, [session, roomId])
  useEffect(() => {
    if (!room || !session) return
    return room.onMessage(() => { void session.markRoomRead(roomId).then(refreshSession) })
  }, [room, session, roomId])

  const [writable, setWritable] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  // False when muted or in a broadcast room without admin rights — the two cases where the worklet
  // would accept the message and every peer would then drop it while linearizing the log.
  const [canPost, setCanPost] = useState(false)
  useEffect(() => {
    if (!room) return
    const apply = (s: { writable: boolean; hasKey: boolean; canPost: boolean }) => {
      setWritable(s.writable)
      setHasKey(s.hasKey)
      setCanPost(s.canPost)
    }
    apply(room)
    void room.refreshState().then(apply)
    return room.onStateChange(apply)
  }, [room])

  const [replyTo, setReplyTo] = useState<{ id: string; body: string; authorName: string } | null>(null)
  const [editingMessage, setEditingMessage] = useState<{ id: string; body: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const flatListRef = useRef<FlatList>(null)

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return
    Alert.alert(
      `Delete ${selectedIds.size} message${selectedIds.size > 1 ? 's' : ''}?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const id of selectedIds) await deleteMessage(id)
            exitSelectionMode()
          },
        },
      ]
    )
  }, [selectedIds, deleteMessage, exitSelectionMode])

  const [memberCount, setMemberCount] = useState(1)
  useEffect(() => {
    if (!room) return
    void room.listMembers().then((res) => {
      if (res?.members) setMemberCount(res.members.length)
    })
  }, [room])

  // Custom header
  useEffect(() => {
    if (selectionMode) {
      navigation.setOptions({
        headerTitle: () => (
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }}>
            {selectedIds.size} selected
          </Text>
        ),
        headerLeft: () => (
          <Pressable onPress={exitSelectionMode} style={styles.headerBtn}>
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
        ),
        headerRight: () => (
          <Pressable onPress={handleBatchDelete} style={styles.headerBtn} disabled={selectedIds.size === 0}>
            <Ionicons name="trash-outline" size={20} color={selectedIds.size === 0 ? colors.textTertiary : colors.error} />
          </Pressable>
        ),
      })
      return
    }
    navigation.setOptions({
      headerLeft: undefined,
      headerTitle: () => (
        <View style={{ alignItems: 'flex-start', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
              {roomName}
            </Text>
            <Ionicons name="checkmark-circle" size={14} color="#38bdf8" />
          </View>
          <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
            {`${memberCount} member(s)`}
          </Text>
        </View>
      ),
      headerRight: () => (
        <View style={styles.headerRight}>
          <Pressable onPress={() => startCall().catch((err) => Alert.alert('Call failed', (err as Error).message))} style={styles.headerBtn}>
            <Ionicons name="call-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable onPress={() => setShowSearch(!showSearch)} style={styles.headerBtn}>
            <Ionicons name="search-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Members', { roomId, roomName })}
            style={styles.headerBtn}
          >
            <Ionicons name="people-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Invite', { roomId, roomName })}
            style={styles.headerBtn}
          >
            <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>
      ),
    })
  }, [navigation, roomId, roomName, showSearch, startCall, memberCount, colors, selectionMode, selectedIds, exitSelectionMode, handleBatchDelete])

  const getAuthorName = useCallback((authorId: string) => {
    if (authorId === identityId) return 'You'
    return nicknames.get(authorId) || authorId.slice(0, 8)
  }, [identityId, nicknames])

  const filteredMessages = searchQuery
    ? messages.filter((m) => m.body.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages

  const handleSend = useCallback(async (text: string) => {
    await sendMessage(text, replyTo?.id)
    setReplyTo(null)
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }, [sendMessage, replyTo])

  const handleAttach = useCallback(async (name: string, mimeType: string, base64: string, thumbnail?: string) => {
    await sendFile(name, mimeType, base64, thumbnail)
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }, [sendFile])

  const handlePlayAudio = useCallback(async (message: ChatMessage) => {
    if (!message.file || loadingAudioId) return
    if (playingAudioId === message.id) {
      audioPlayerRef.current?.pause()
      setPlayingAudioId(null)
      return
    }
    audioPlayerRef.current?.remove()
    audioPlayerRef.current = null
    setPlayingAudioId(null)
    setLoadingAudioId(message.id)
    try {
      const base64 = await downloadFile(message.file.driveKey, message.file.path)
      if (!base64) return Alert.alert('File unavailable', 'The peer sharing this file is offline.')
      const dest = FileSystem.cacheDirectory + message.file.name
      await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 })
      const player = createAudioPlayer(dest)
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) setPlayingAudioId(null)
      })
      audioPlayerRef.current = player
      player.play()
      setPlayingAudioId(message.id)
    } catch {
      Alert.alert('Playback failed', 'Could not play this file.')
    } finally {
      setLoadingAudioId(null)
    }
  }, [playingAudioId, loadingAudioId])

  useEffect(() => () => { audioPlayerRef.current?.remove() }, [])

  const handleFilePress = useCallback(async (message: ChatMessage) => {
    if (!message.file || downloadingId) return
    if (isAudioFile(message.file)) return handlePlayAudio(message)
    setDownloadingId(message.id)
    try {
      const base64 = await downloadFile(message.file.driveKey, message.file.path)
      if (!base64) return Alert.alert('File unavailable', 'The peer sharing this file is offline.')
      const dest = FileSystem.cacheDirectory + message.file.name
      await FileSystem.writeAsStringAsync(dest, base64, { encoding: FileSystem.EncodingType.Base64 })
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(dest)
    } catch {
      Alert.alert('Download failed', 'Could not fetch this file.')
    } finally {
      setDownloadingId(null)
    }
  }, [downloadingId])

  const handleEdit = useCallback(async (id: string, body: string) => {
    await editMessage(id, body)
    setEditingMessage(null)
  }, [editMessage])

  const handleLongPress = useCallback((message: ChatMessage) => {
    setSelectedMessage(message)
  }, [])

  const handleAction = useCallback((action: string) => {
    if (!selectedMessage) return

    switch (action) {
      case 'copy':
        void Clipboard.setStringAsync(selectedMessage.body)
        break
      case 'reply':
        setReplyTo({
          id: selectedMessage.id,
          body: selectedMessage.body,
          authorName: getAuthorName(selectedMessage.authorId),
        })
        break
      case 'edit':
        if (selectedMessage.authorId === identityId) {
          setEditingMessage({ id: selectedMessage.id, body: selectedMessage.body })
        }
        break
      case 'delete':
        if (selectedMessage.authorId === identityId) {
          Alert.alert('Delete message?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteMessage(selectedMessage.id) },
          ])
        }
        break
    }
    setSelectedMessage(null)
  }, [selectedMessage, identityId, getAuthorName, deleteMessage])

  const getReplyPreview = useCallback((replyToId?: string) => {
    if (!replyToId) return undefined
    const msg = messages.find((m) => m.id === replyToId)
    return msg ? msg.body.slice(0, 100) : undefined
  }, [messages])

  return (
    <SafeAreaView style={styles.safe}>
      {/* Call area */}
      {remoteStreams.size > 0 && (
        <View style={styles.callArea}>
          {[...remoteStreams.entries()].map(([peerId, stream]) => (
            // react-native-webrtc's MediaStream (assigned to the global by registerGlobals) has .toURL(); the DOM MediaStream type call.ts is written against doesn't.
            <RTCView key={peerId} streamURL={(stream as unknown as { toURL(): string }).toURL()} style={styles.callTile} objectFit="cover" />
          ))}
        </View>
      )}

      {/* Search bar */}
      {showSearch && (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search messages..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          <Pressable onPress={() => { setShowSearch(false); setSearchQuery('') }}>
            <Ionicons name="close" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={filteredMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatBubble
            message={item}
            isSelf={item.authorId === identityId}
            authorName={getAuthorName(item.authorId)}
            replyPreview={getReplyPreview(item.replyTo)}
            onLongPress={() => selectionMode ? (item.authorId === identityId && toggleSelected(item.id)) : handleLongPress(item)}
            onPress={selectionMode && item.authorId === identityId ? () => toggleSelected(item.id) : undefined}
            selected={selectedIds.has(item.id)}
            selectable={selectionMode && item.authorId === identityId}
            onReactionPress={(emoji) => toggleReaction(item.id, emoji)}
            onFilePress={() => handleFilePress(item)}
            fileDownloading={downloadingId === item.id}
            isAudioPlaying={playingAudioId === item.id}
            isAudioLoading={loadingAudioId === item.id}
          />
        )}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => {
          // Only snap to bottom when a message actually landed at the tail — loadOlder()
          // prepends to the top and must not yank the view back down.
          const tail = filteredMessages[filteredMessages.length - 1]
          if (tail && tail.id !== lastTailIdRef.current) {
            lastTailIdRef.current = tail.id
            flatListRef.current?.scrollToEnd({ animated: false })
          }
        }}
        ListHeaderComponent={hasMore ? (
          <Pressable
            style={styles.loadEarlier}
            disabled={loadingOlder}
            onPress={async () => {
              setLoadingOlder(true)
              try { await loadOlder() } finally { setLoadingOlder(false) }
            }}
          >
            <Text style={styles.loadEarlierText}>{loadingOlder ? 'Loading…' : 'Load earlier messages'}</Text>
          </Pressable>
        ) : undefined}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyCenter}>
              <Text style={styles.emptyText}>Loading messages...</Text>
            </View>
          ) : (
            <View style={styles.emptyCenter}>
              <Ionicons name="chatbubble-outline" size={48} color={colors.textTertiary} style={styles.emptyEmoji} />
              <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
            </View>
          )
        }
      />

      {/* Typing / seen-by status */}
      {typingUsers.size > 0 ? (
        <Text style={styles.statusBar}>{[...typingUsers].map(getAuthorName).join(', ')} typing…</Text>
      ) : readBy.size > 0 ? (
        <Text style={styles.statusBar}>Seen by {[...readBy].map(getAuthorName).join(', ')}</Text>
      ) : null}

      {writable && hasKey && !canPost && (
        <Text style={styles.statusBar}>Only admins can send messages in this broadcast room</Text>
      )}

      {/* Composer */}
      <MessageComposer
        onSend={handleSend}
        onAttach={handleAttach}
        onChangeText={notifyTyping}
        replyTo={replyTo}
        editingMessage={editingMessage}
        onCancelReply={() => setReplyTo(null)}
        onCancelEdit={() => setEditingMessage(null)}
        onSubmitEdit={handleEdit}
        disabled={!writable || !hasKey || !canPost}
      />

      {/* Action sheet modal (cross-platform) */}
      <Modal visible={!!selectedMessage} transparent animationType="fade">
        <Pressable style={styles.actionOverlay} onPress={() => setSelectedMessage(null)}>
          <View style={styles.actionSheet}>
            {!!selectedMessage?.body && (
              <Pressable style={[styles.actionItem, styles.actionRow]} onPress={() => handleAction('copy')}>
                <Ionicons name="copy-outline" size={16} color={colors.textPrimary} />
                <Text style={styles.actionText}>Copy</Text>
              </Pressable>
            )}

            <Pressable style={[styles.actionItem, styles.actionRow]} onPress={() => handleAction('reply')}>
              <Ionicons name="arrow-undo-outline" size={16} color={colors.textPrimary} />
              <Text style={styles.actionText}>Reply</Text>
            </Pressable>

            {selectedMessage?.authorId === identityId && (
              <>
                <Pressable style={[styles.actionItem, styles.actionRow]} onPress={() => handleAction('edit')}>
                  <Ionicons name="pencil-outline" size={16} color={colors.textPrimary} />
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                <Pressable style={[styles.actionItem, styles.actionRow]} onPress={() => handleAction('delete')}>
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                  <Text style={[styles.actionText, styles.actionDestructive]}>Delete</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionItem, styles.actionRow]}
                  onPress={() => {
                    if (selectedMessage) {
                      setSelectionMode(true)
                      setSelectedIds(new Set([selectedMessage.id]))
                    }
                    setSelectedMessage(null)
                  }}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.textPrimary} />
                  <Text style={styles.actionText}>Select multiple</Text>
                </Pressable>
              </>
            )}

            <View style={styles.reactionRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => {
                    if (selectedMessage) toggleReaction(selectedMessage.id, emoji)
                    setSelectedMessage(null)
                  }}
                  style={styles.reactionBtn}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={[styles.actionItem, styles.actionCancel]} onPress={() => setSelectedMessage(null)}>
              <Text style={styles.actionCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  headerRight: { flexDirection: 'row', gap: spacing.sm },
  headerBtn: { padding: spacing.xs },
  headerBtnText: { fontSize: 18 },
  callArea: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    padding: spacing.sm, backgroundColor: colors.bgSecondary,
  },
  callTile: { width: 160, height: 120, borderRadius: radii.md, backgroundColor: '#000' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgSecondary, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, gap: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1, backgroundColor: colors.inputBg,
    borderRadius: radii.md, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, color: colors.textPrimary,
    fontSize: typography.md,
  },
  searchClose: { color: colors.textTertiary, fontSize: 18, padding: spacing.xs },
  messageList: { paddingVertical: spacing.sm, flexGrow: 1 },
  loadEarlier: { alignItems: 'center', paddingVertical: spacing.sm },
  loadEarlierText: { color: colors.textTertiary, fontSize: typography.sm },
  emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyEmoji: { fontSize: 48, opacity: 0.5 },
  emptyText: { color: colors.textTertiary, fontSize: typography.md },
  statusBar: {
    color: colors.textTertiary, fontSize: typography.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.bgSecondary,
  },
  actionOverlay: {
    flex: 1, backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    paddingVertical: spacing.md,
  },
  actionItem: {
    paddingVertical: spacing.md, paddingHorizontal: spacing.xxl,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionText: { color: colors.textPrimary, fontSize: typography.md },
  actionDestructive: { color: colors.error },
  reactionRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  reactionBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bgTertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  reactionEmoji: { fontSize: 20 },
  actionCancel: {
    borderTopWidth: 1, borderTopColor: colors.border,
    marginTop: spacing.sm, paddingTop: spacing.lg,
  },
  actionCancelText: { color: colors.textTertiary, fontSize: typography.md, textAlign: 'center' },
})
