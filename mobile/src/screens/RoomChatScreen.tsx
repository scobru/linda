import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  View, Text, FlatList, Pressable, StyleSheet,
  TextInput, Alert, ActionSheetIOS, Platform, Modal,
  SafeAreaView,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import * as Clipboard from 'expo-clipboard'
import { createAudioPlayer, type AudioPlayer } from 'expo-audio'
import { Ionicons } from '@expo/vector-icons'
import type { RootStackParamList } from '../navigation'
import { useSession } from '../hooks/useSession'
import { useRoom } from '../hooks/useRoom'
import { downloadFile } from '../bare/room-proxy'
import type { ChatMessage, RoomFile } from '@core/rooms/room'
import { formatBytes } from '@core/util/bytes'
import { SvgXml } from 'react-native-svg'
import { wallpaperPatternSvg, wallpaperInk, DEFAULT_WALLPAPER } from '@core/ui/wallpapers'
import ChatBubble, { isAudioFile, isVideoFile } from '../components/ChatBubble'
import VideoPlayerModal from '../components/VideoPlayerModal'
import MessageComposer from '../components/MessageComposer'
import Avatar from '../components/Avatar'
import { extractHashtags, hasHashtag } from '@core/util/hashtag'
import { spacing, radii, typography, shadows, type ThemeColors } from '../theme'
import { useTheme } from '../theme-context'


function getFileIcon(name: string, mimeType?: string): keyof typeof Ionicons.glyphMap {
  if (mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return 'image-outline'
  if (mimeType?.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(name)) return 'musical-notes-outline'
  if (mimeType?.startsWith('video/') || /\.(mp4|webm|mkv|mov)$/i.test(name)) return 'videocam-outline'
  if (/\.(zip|tar|gz|7z|rar)$/i.test(name)) return 'archive-outline'
  if (/\.pdf$/i.test(name) || mimeType === 'application/pdf') return 'document-text-outline'
  return 'document-outline'
}

type Props = NativeStackScreenProps<RootStackParamList, 'RoomChat'>

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🔥', '👀', '🎉', '💯', '🙏']

export default function RoomChatScreen({ route, navigation }: Props) {
  const { colors, isDark } = useTheme()
  const styles = useMemo(() => createStyles(colors), [colors])
  const { roomName, pendingJoin } = route.params
  const [roomId, setRoomId] = useState(route.params.roomId)
  const { session, identity, nicknames, avatars, bookmarks, refresh: refreshSession, setActiveRoomId } = useSession()
  const room = roomId ? session?.getRoom(roomId) : undefined
  const identityId = identity?.id || ''
  const clearedAt = bookmarks.find((b) => b.id === roomId)?.clearedAt ?? 0

  // Screen navigates in before the join finishes (see RoomsScreen.handleJoinRoom) — run it here
  // instead, in the background. `room` stays undefined until this resolves, so useRoom below
  // just shows its normal loading state in the meantime.
  useEffect(() => {
    if (!pendingJoin || !session) return
    let cancelled = false
    session.joinRoomByKey(pendingJoin.name, pendingJoin.key).then((joined) => {
      if (cancelled) return
      setRoomId(joined.id)
      refreshSession()
    }).catch((err) => {
      if (cancelled) return
      Alert.alert('Could not join room', (err as Error).message, [{ text: 'OK', onPress: () => navigation.goBack() }])
    })
    return () => { cancelled = true }
  }, [pendingJoin, session])
  const { messages, loading, sendMessage, sendFile, editMessage, deleteMessage, toggleReaction, refreshMessages, hasMore, loadOlder, typingUsers, notifyTyping, readBy } = useRoom(room, identityId, clearedAt)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const lastTailIdRef = useRef<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null)
  const [playingVideo, setPlayingVideo] = useState<{ uri: string; name: string } | null>(null)
  const audioPlayerRef = useRef<AudioPlayer | null>(null)

  // Mirrors desktop's openRoom: stamp read on open, and again for each message that
  // arrives while this screen is focused (mute the badge, not just a one-time clear).
  useEffect(() => {
    if (!session || !roomId) return
    session.markRoomRead(roomId).then(refreshSession)
  }, [session, roomId])
  useEffect(() => {
    if (!room || !session) return
    return room.onMessage(() => { void session.markRoomRead(room.id).then(refreshSession) })
  }, [room, session, roomId])
  // Suppresses this room's own local notifications while it's the screen actually on top —
  // native-stack keeps it mounted underneath other pushed screens, so mount/unmount alone
  // isn't a reliable signal of visibility.
  useFocusEffect(useCallback(() => {
    setActiveRoomId(roomId ?? null)
    return () => setActiveRoomId(null)
  }, [roomId, setActiveRoomId]))

  const [writable, setWritable] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  // False when muted or in a broadcast room without admin rights — the two cases where the worklet
  // would accept the message and every peer would then drop it while linearizing the log.
  const [canPost, setCanPost] = useState(false)
  const [broadcast, setBroadcast] = useState(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'files'>('chat')
  const [roomFiles, setRoomFiles] = useState<RoomFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [downloadingFilePath, setDownloadingFilePath] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    void session.getWallpaper()
      .then((id) => setWallpaperSvg(wallpaperPatternSvg(id || DEFAULT_WALLPAPER, wallpaperInk(isDark))))
      .catch(() => {})
  }, [session, isDark])

  const refreshFiles = useCallback(async () => {
    if (!room) return
    setFilesLoading(true)
    try {
      const list = await room.listFiles()
      setRoomFiles(list)
    } catch {
      // ignore
    } finally {
      setFilesLoading(false)
    }
  }, [room])

  useEffect(() => {
    if (!room) return
    const apply = (s: { writable: boolean; hasKey: boolean; canPost: boolean; broadcast?: boolean }) => {
      setWritable(s.writable)
      setHasKey(s.hasKey)
      setCanPost(s.canPost)
      setBroadcast(s.broadcast ?? false)
    }
    apply(room)
    void room.refreshState().then(apply)
    const unsubState = room.onStateChange(apply)
    const unsubFiles = room.onFilesChange(() => {
      void refreshFiles()
    })
    return () => {
      unsubState()
      unsubFiles()
    }
  }, [room, refreshFiles])

  useEffect(() => {
    if (activeTab === 'files') {
      void refreshFiles()
    }
  }, [activeTab, refreshFiles])

  const handleDownloadFile = useCallback(async (file: RoomFile) => {
    if (!room || !file.driveKey) return
    setDownloadingFilePath(file.path)
    try {
      const base64 = await room.downloadRoomFile(file.path, file.driveKey)
      if (!base64) {
        Alert.alert('Download failed', 'File not available on connected peers')
        return
      }
      const localUri = `${FileSystem.cacheDirectory}${file.name}`
      await FileSystem.writeAsStringAsync(localUri, base64, { encoding: FileSystem.EncodingType.Base64 })
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri)
      } else {
        Alert.alert('Downloaded', `Saved to ${file.name}`)
      }
    } catch (err) {
      Alert.alert('Download error', (err as Error).message)
    } finally {
      setDownloadingFilePath(null)
    }
  }, [room])

  const handleDeleteFile = useCallback((file: RoomFile) => {
    if (!room) return
    Alert.alert(`Delete "${file.name}"?`, 'This also removes the chat message that shared it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await room.deleteMessage(file.messageId)
            await refreshFiles()
          } catch (err) {
            Alert.alert('Delete failed', (err as Error).message)
          }
        }
      }
    ])
  }, [room, refreshFiles])

  const filteredRoomFiles = useMemo(() => {
    const q = fileSearchQuery.trim().toLowerCase()
    if (!q) return roomFiles
    return roomFiles.filter((f) => f.name.toLowerCase().includes(q))
  }, [roomFiles, fileSearchQuery])

  const [replyTo, setReplyTo] = useState<{ id: string; body: string; authorName: string } | null>(null)
  const [editingMessage, setEditingMessage] = useState<{ id: string; body: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const flatListRef = useRef<FlatList>(null)
  const [wallpaperSvg, setWallpaperSvg] = useState<string | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const handleListScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height
    setShowScrollToBottom(distanceFromBottom > 300)
  }, [])

  // Lands on the latest messages when a room first opens. Fires once messages first become
  // non-empty rather than once on `loading` alone — a room whose peer hasn't synced recently (far
  // more common for a quiet 1:1 than an active group) can flip `loading` false with nothing
  // loaded yet, with the real content trickling in afterward via onMessage; keying only off
  // `loading` would then never schedule a scroll at all. The ref makes it fire once per mount,
  // not on every later message. The same short delay handleSend/handleAttach use below: scrolling
  // before the list has actually laid out its rows doesn't reliably reach the true bottom, which
  // onContentSizeChange's own scroll can miss on the very first layout pass.
  const scrolledToTailRef = useRef(false)
  useEffect(() => {
    if (scrolledToTailRef.current || loading || messages.length === 0) return
    scrolledToTailRef.current = true
    const timer = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100)
    return () => clearTimeout(timer)
  }, [loading, messages.length])

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
  const [isOwner, setIsOwner] = useState(false)
  useEffect(() => {
    if (!room) return
    void room.listMembers().then((res) => {
      if (res?.members) setMemberCount(res.members.length)
      setIsOwner(!!res?.ownerId && res.ownerId === identityId)
    })
  }, [room, identityId])

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
          <Pressable onPress={() => setShowSearch(!showSearch)} style={styles.headerBtn}>
            <Ionicons name="search-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => roomId && navigation.navigate('Members', { roomId, roomName })}
            style={styles.headerBtn}
          >
            <Ionicons name="people-outline" size={20} color={colors.textPrimary} />
          </Pressable>
          {/* Owner-only: the owner is the only member who runs `redeemInvite`, so a link shared by
              anyone else gets the joiner into the room read-only and stuck there. */}
          {isOwner && (
            <Pressable
              onPress={() => roomId && navigation.navigate('Invite', { roomId, roomName })}
              style={styles.headerBtn}
            >
              <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
            </Pressable>
          )}
        </View>
      ),
    })
  }, [navigation, roomId, roomName, showSearch, memberCount, isOwner, colors, selectionMode, selectedIds, exitSelectionMode, handleBatchDelete])

  const getAuthorName = useCallback((authorId: string) => {
    if (authorId === identityId) return 'You'
    return nicknames.get(authorId) || authorId.slice(0, 8)
  }, [identityId, nicknames])

  // Hashtag notes: every tag used in the room, most-used first, so "buy milk #todo" stays
  // findable later by tapping #todo. Selecting a tag narrows the list; tapping it again clears.
  const hashtagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of messages) {
      if (m.deleted) continue
      for (const tag of extractHashtags(m.body)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [messages])

  // A tag whose last message was deleted must not stay selected, or the list sits empty.
  useEffect(() => {
    if (activeHashtag && !hashtagCounts.some(([tag]) => tag === activeHashtag)) setActiveHashtag(null)
  }, [hashtagCounts, activeHashtag])

  const filteredMessages = useMemo(() => {
    let list = searchQuery
      ? messages.filter((m) => m.body.toLowerCase().includes(searchQuery.toLowerCase()))
      : messages
    if (activeHashtag) list = list.filter((m) => !m.deleted && hasHashtag(m.body, activeHashtag))
    return list
  }, [messages, searchQuery, activeHashtag])

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
      // Streamed from the worklet's media server rather than pulled whole through the IPC
      // bridge: playback starts on the first blocks, and a long recording no longer has to
      // exist as one base64 string in memory before it can be heard.
      const url = await session!.mediaUrl(message.file.driveKey, message.file.path)
      const player = createAudioPlayer(url)
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
  }, [playingAudioId, loadingAudioId, session])

  useEffect(() => () => { audioPlayerRef.current?.remove() }, [])

  const saveFileToDevice = useCallback(async (message: ChatMessage) => {
    if (!message.file || downloadingId) return
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

  const handleFilePress = useCallback(async (message: ChatMessage) => {
    if (!message.file || downloadingId) return
    if (isAudioFile(message.file)) return handlePlayAudio(message)
    if (isVideoFile(message.file)) {
      const file = message.file
      return void session!.mediaUrl(file.driveKey, file.path)
        .then((uri) => setPlayingVideo({ uri, name: file.name }))
        .catch(() => Alert.alert('Playback failed', 'Could not open this video.'))
    }
    return saveFileToDevice(message)
  }, [downloadingId, session, handlePlayAudio, saveFileToDevice])

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

      {(
        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tabButton, activeTab === 'chat' && styles.tabButtonActive]}
            onPress={() => setActiveTab('chat')}
          >
            <Ionicons name="chatbubble-outline" size={15} color={activeTab === 'chat' ? colors.accent : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>Chat</Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, activeTab === 'files' && styles.tabButtonActive]}
            onPress={() => setActiveTab('files')}
          >
            <Ionicons name="folder-outline" size={15} color={activeTab === 'files' ? colors.accent : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'files' && styles.tabTextActive]}>Files ({roomFiles.length})</Text>
          </Pressable>
        </View>
      )}

      {activeTab === 'files' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.filesToolbar}>
            <TextInput
              style={styles.filesSearchInput}
              placeholder="Search files..."
              placeholderTextColor={colors.textTertiary}
              value={fileSearchQuery}
              onChangeText={setFileSearchQuery}
            />
          </View>

          <FlatList
            data={filteredRoomFiles}
            keyExtractor={(item) => item.messageId}
            contentContainerStyle={styles.filesList}
            renderItem={({ item }) => {
              const isMine = item.authorId === identityId
              const isDownloading = downloadingFilePath === item.path
              return (
                <View style={styles.fileCard}>
                  <View style={styles.fileCardIcon}>
                    <Ionicons name={getFileIcon(item.name, item.mimeType)} size={24} color={colors.textSecondary} />
                  </View>
                  <View style={styles.fileCardInfo}>
                    <Text style={styles.fileCardName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.fileCardMeta}>
                      {formatBytes(item.size)} • {getAuthorName(item.authorId)} • {new Date(item.timestamp).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.fileCardActions}>
                    <Pressable
                      style={styles.fileActionBtn}
                      disabled={isDownloading}
                      onPress={() => handleDownloadFile(item)}
                    >
                      <Ionicons
                        name={isDownloading ? 'hourglass-outline' : 'download-outline'}
                        size={18}
                        color={colors.accent}
                      />
                    </Pressable>
                    {isMine && (
                      <Pressable
                        style={styles.fileActionBtn}
                        onPress={() => handleDeleteFile(item)}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.error} />
                      </Pressable>
                    )}
                  </View>
                </View>
              )
            }}
            ListEmptyComponent={
              <View style={styles.emptyCenter}>
                <Ionicons name="folder-open-outline" size={44} color={colors.textSecondary} style={styles.emptyIcon} />
                <Text style={styles.emptyText}>
                  {filesLoading ? 'Loading files…' : fileSearchQuery ? 'No matching files found' : 'No files shared yet'}
                </Text>
              </View>
            }
          />
        </View>
      ) : (
        <>
          {/* Hashtag notes — one pill per tag used in this room, filtering the list below. */}
          {hashtagCounts.length > 0 && (
            <View style={styles.hashtagBar}>
              <Ionicons name="pricetags-outline" size={14} color={colors.textTertiary} />
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={hashtagCounts}
                keyExtractor={([tag]) => tag}
                contentContainerStyle={styles.hashtagBarContent}
                renderItem={({ item: [tag, count] }) => {
                  const active = activeHashtag === tag
                  return (
                    <Pressable
                      onPress={() => setActiveHashtag(active ? null : tag)}
                      style={[styles.hashtagPill, active && styles.hashtagPillActive]}
                    >
                      <Text style={[styles.hashtagPillText, active && styles.hashtagPillTextActive]}>
                        #{tag}
                      </Text>
                      <Text style={[styles.hashtagCount, active && styles.hashtagPillTextActive]}>{count}</Text>
                    </Pressable>
                  )
                }}
              />
              {activeHashtag && (
                <Pressable onPress={() => setActiveHashtag(null)} style={styles.hashtagClear}>
                  <Ionicons name="close" size={14} color={colors.textTertiary} />
                </Pressable>
              )}
            </View>
          )}

          {/* Messages. The wallpaper is drawn with react-native-svg behind the list: RN's own
              Image component cannot render SVG, so an ImageBackground showed nothing. */}
          <View style={{ flex: 1 }}>
          {wallpaperSvg && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <SvgXml xml={wallpaperSvg} width="100%" height="100%" />
            </View>
          )}
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
                onFileSave={() => void saveFileToDevice(item)}
                onHashtagPress={(tag) => setActiveHashtag((cur) => (cur === tag ? null : tag))}
                fileDownloading={downloadingId === item.id}
                isAudioPlaying={playingAudioId === item.id}
                isAudioLoading={loadingAudioId === item.id}
              />
            )}
            contentContainerStyle={styles.messageList}
            windowSize={7}
            maxToRenderPerBatch={16}
            initialNumToRender={16}
            removeClippedSubviews
            onScroll={handleListScroll}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
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
                  <Ionicons name="chatbubble-outline" size={48} color={colors.textTertiary} style={styles.emptyIcon} />
                  <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
                </View>
              )
            }
          />
          </View>

          {showScrollToBottom && (
            <Pressable
              style={styles.scrollToBottomBtn}
              onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
            >
              <Ionicons name="chevron-down" size={22} color={colors.textPrimary} />
            </Pressable>
          )}

          {/* Typing / seen-by status */}
          {typingUsers.size > 0 ? (
            <Text style={styles.statusBar}>{[...typingUsers].map(getAuthorName).join(', ')} typing…</Text>
          ) : readBy.size > 0 ? (
            <Text style={styles.statusBar}>Seen by {[...readBy].map(getAuthorName).join(', ')}</Text>
          ) : null}

          {/* Composer, or why there isn't one */}
          {writable && hasKey && canPost ? (
            <MessageComposer
              onSend={handleSend}
              onAttach={handleAttach}
              onChangeText={notifyTyping}
              replyTo={replyTo}
              editingMessage={editingMessage}
              onCancelReply={() => setReplyTo(null)}
              onCancelEdit={() => setEditingMessage(null)}
              onSubmitEdit={handleEdit}
            />
          ) : (
            <View style={styles.composerBlocked}>
              <Ionicons
                name={!writable || !hasKey ? 'time-outline' : broadcast ? 'megaphone-outline' : 'volume-mute-outline'}
                size={15}
                color={colors.textTertiary}
              />
              <Text style={styles.composerBlockedText}>
                {!writable || !hasKey
                  ? 'You do not have write access to this room yet'
                  : broadcast
                    ? 'Only admins can send messages in this broadcast room'
                    : 'You are muted in this room'}
              </Text>
            </View>
          )}
        </>
      )}

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

      {playingVideo && (
        <VideoPlayerModal uri={playingVideo.uri} name={playingVideo.name} onClose={() => setPlayingVideo(null)} />
      )}
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  headerRight: { flexDirection: 'row', gap: spacing.sm },
  headerBtn: { padding: spacing.xs },
  headerBtnText: { fontSize: 18 },
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
  scrollToBottomBtn: {
    position: 'absolute', right: spacing.lg, bottom: 90,
    width: 42, height: 42, borderRadius: radii.full,
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    ...shadows.md,
  },
  emptyIcon: { opacity: 0.5, marginBottom: spacing.sm },
  emptyText: { color: colors.textTertiary, fontSize: typography.md },
  statusBar: {
    color: colors.textTertiary, fontSize: typography.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.bgSecondary,
  },
  composerBlocked: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  composerBlockedText: {
    color: colors.textTertiary, fontSize: typography.sm, textAlign: 'center',
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
  hashtagBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hashtagBarContent: { gap: spacing.xs, alignItems: 'center' },
  hashtagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hashtagPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  hashtagPillText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: typography.semibold,
  },
  hashtagPillTextActive: { color: '#fff' },
  hashtagCount: { color: colors.textTertiary, fontSize: 10 },
  hashtagClear: { padding: 2 },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    padding: spacing.xs,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
  },
  tabButtonActive: {
    backgroundColor: colors.accent,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#000000',
  },
  filesToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filesSearchInput: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.sm,
  },
  filesList: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  fileCardIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.bgTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileCardName: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  fileCardMeta: {
    color: colors.textTertiary,
    fontSize: typography.xs,
    marginTop: 2,
  },
  fileCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  fileActionBtn: {
    padding: spacing.xs,
  },
})
