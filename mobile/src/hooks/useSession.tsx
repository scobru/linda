import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react'
import { AppState, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import NetInfo from '@react-native-community/netinfo'
import { NOTIFICATION_CHANNEL_ID } from '../notifications'
import { bareClient } from '../bare/client'
import { SessionProxy, type RoomSummary } from '../bare/session-proxy'
import type { Identity } from '../bare/identity-client'
import type { ContactEntry } from '@core/app/session'
import type { ChatMessage } from '@core/rooms/room'

interface SessionContextValue {
  session: SessionProxy | null
  identity: Identity | null
  nickname: string
  avatar: string
  bookmarks: RoomSummary[]
  contacts: ContactEntry[]
  onlineUsers: Set<string>
  nicknames: Map<string, string>
  avatars: Map<string, string>

  // Actions
  initSession: (identity: Identity, storageDir: string, opts?: { autoJoinInvite?: { name: string; key: string } }) => Promise<void>
  refresh: () => void
  /** Marks a room as the one currently on screen, so its own new-message notifications are
   * suppressed while the user is already looking at it (mirrors desktop's document-focus check). */
  setActiveRoomId: (roomId: string | null) => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be inside SessionProvider')
  return ctx
}

interface Props {
  children: ReactNode
}

export function SessionProvider({ children }: Props) {
  const [session, setSession] = useState<SessionProxy | null>(null)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [nickname, setNickname] = useState('')
  const [avatar, setAvatar] = useState('')
  const [bookmarks, setBookmarks] = useState<RoomSummary[]>([])
  const [contacts, setContacts] = useState<ContactEntry[]>([])
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map())
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map())
  const [, setTick] = useState(0)
  const nicknamesRef = useRef(nicknames)
  useEffect(() => { nicknamesRef.current = nicknames }, [nicknames])
  const activeRoomIdRef = useRef<string | null>(null)
  const setActiveRoomId = useCallback((roomId: string | null) => { activeRoomIdRef.current = roomId }, [])

  // App icon badge = count of unread rooms, same "latest message postdates lastReadAt" rule
  // RoomsScreen uses for its own unread dot/filter.
  useEffect(() => {
    const unreadCount = bookmarks.filter((b) => !!b.lastMessageTime && b.lastMessageTime > (b.lastReadAt ?? 0)).length
    void Notifications.setBadgeCountAsync(unreadCount)
  }, [bookmarks])

  const refresh = useCallback(() => {
    if (!session) return
    void (async () => {
      setBookmarks(await session.listRoomSummaries())
      setContacts(await session.listContacts())
      setNickname(await session.getNickname())
      setAvatar(await session.getAvatar())
      setAvatars(await session.listPeerAvatars())
    })()
  }, [session])

  const initSession = useCallback(async (id: Identity, storageDir: string, opts?: { autoJoinInvite?: { name: string; key: string } }) => {
    bareClient.on('presence', (msg: { userId: string; online: boolean; nickname?: string; avatar?: string }) => {
      if (msg.online) {
        setOnlineUsers((prev) => new Set(prev).add(msg.userId))
      } else {
        setOnlineUsers((prev) => {
          const next = new Set(prev)
          next.delete(msg.userId)
          return next
        })
      }
      if (msg.nickname) setNicknames((prev) => new Map(prev).set(msg.userId, msg.nickname!))
      if (msg.avatar) setAvatars((prev) => new Map(prev).set(msg.userId, msg.avatar!))
    })
    bareClient.on('peerConnected', () => setTick((t) => t + 1))
    bareClient.on('peerDisconnected', (payload: { userId: string }) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev)
        next.delete(payload.userId)
        return next
      })
    })
    bareClient.on('contactsChange', () => setTimeout(() => setTick((t) => t + 1), 0))
    bareClient.on('directoryChange', () => setTick((t) => t + 1))

    const { session: s, info } = await SessionProxy.create(storageDir)
    await s.reopenBookmarkedRooms()
    // Fire-and-forget: joinRoomByKey can block ~30s waiting on the swarm (see RoomsScreen's
    // handleJoinRoom), and a brand-new identity with no peers yet may not even reach it in
    // time — fine either way, don't hold up onboarding for it. Refreshes bookmarks on success
    // since a join doesn't otherwise emit any change event mobile listens for.
    if (opts?.autoJoinInvite) {
      const invite = opts.autoJoinInvite
      void s.joinRoomByKey(invite.name, invite.key).then(() => s.listRoomSummaries()).then(setBookmarks).catch(() => {})
    }

    // The swarm's socket stays bound to whatever network was active when it was created — a
    // wifi <-> cellular switch otherwise leaves it trying to talk over an interface that no
    // longer routes anywhere, and peers silently stop connecting until the app is restarted.
    // Debounced: turning wifi off fires several type changes in quick succession (wifi -> none ->
    // cellular as the radio actually switches over) — waiting for it to settle avoids resyncing
    // against the momentary "none" state in between.
    let lastNetworkType: string | null = null
    let resyncTimer: ReturnType<typeof setTimeout> | null = null
    NetInfo.addEventListener((state) => {
      if (lastNetworkType === null) { lastNetworkType = state.type; return }
      if (state.type === lastNetworkType) return
      lastNetworkType = state.type
      if (resyncTimer) clearTimeout(resyncTimer)
      resyncTimer = setTimeout(() => { resyncTimer = null; void s.resumeNetwork() }, 800)
    })

    // Refreshes the room-list preview/unread-dot for any room, active or backgrounded, and
    // fires a local notification unless the user is already looking at that exact room.
    bareClient.on('incomingMessage', (payload: { roomId: string; message: ChatMessage }) => {
      void s.listRoomSummaries().then((summaries) => {
        setBookmarks(summaries)
        if (AppState.currentState === 'active' && activeRoomIdRef.current === payload.roomId) return
        const roomName = summaries.find((b) => b.id === payload.roomId)?.name ?? 'linda-pear'
        const author = nicknamesRef.current.get(payload.message.authorId) ?? 'Someone'
        void Notifications.scheduleNotificationAsync({
          content: {
            title: `${author} in ${roomName}`,
            body: payload.message.file ? 'Shared an image' : payload.message.body.slice(0, 200),
            // iOS takes the sound per-notification; Android ignores this and uses the channel's.
            sound: 'notification_ping.wav',
          },
          // Android needs the channel named to pick up its sound, and only a trigger can carry
          // one — a channel-only trigger still delivers immediately. Not a date trigger of "now":
          // native drops any date already in the past, which "now" is by the time it lands there.
          // iOS has no channels and delivers immediately.
          trigger: Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNEL_ID } : null,
        })
      })
    })
    // A room's name/avatar/description edited on another device replicates in, but the local
    // bookmark cache the room list renders from only updates itself in response to this event.
    bareClient.on('bookmarksChange', () => { void s.listRoomSummaries().then(setBookmarks) })

    setSession(s)
    setIdentity(id)
    setNickname(info.nickname)
    setAvatar(info.avatar)
    setBookmarks(await s.listRoomSummaries())
    setContacts(info.contacts)
    setAvatars(new Map(info.peerAvatars))

    // Deliberately last: the OS permission dialog this triggers (first run after this
    // feature shipped) pauses the Activity, and requesting it while the swarm was still
    // mid-bootstrap raced the DHT announce/lookup — fine on wifi's slack, not on cellular's
    // tighter margins. Firing it only once the session/swarm is already up sidesteps that.
    void Notifications.requestPermissionsAsync()
  }, [])

  // Without this, every consumer of useSession() — every screen, since every screen reads it —
  // re-renders on every presence/peer event, whether or not the fields it actually reads changed.
  // Native-stack keeps prior screens mounted underneath the active one, so on a chatty P2P
  // connection this was competing with the navigation transition itself for JS thread time.
  const value = useMemo<SessionContextValue>(() => ({
    session,
    identity,
    nickname,
    avatar,
    bookmarks,
    contacts,
    onlineUsers,
    nicknames,
    avatars,
    initSession,
    refresh,
    setActiveRoomId,
  }), [session, identity, nickname, avatar, bookmarks, contacts, onlineUsers, nicknames, avatars, initSession, refresh, setActiveRoomId])

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  )
}
