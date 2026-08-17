import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { bareClient } from '../bare/client'
import { SessionProxy, type RoomSummary } from '../bare/session-proxy'
import type { Identity } from '../bare/identity-client'
import type { ContactEntry } from '@core/app/session'
import { registerPushToken } from '../bare/zen-push'

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
  initSession: (identity: Identity, storageDir: string) => Promise<void>
  refresh: () => void
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

  const initSession = useCallback(async (id: Identity, storageDir: string) => {
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

    // Refreshes the room-list preview/unread-dot for any room, active or backgrounded.
    bareClient.on('incomingMessage', () => { void s.listRoomSummaries().then(setBookmarks) })

    setSession(s)
    setIdentity(id)
    setNickname(info.nickname)
    setAvatar(info.avatar)
    setBookmarks(await s.listRoomSummaries())
    setContacts(info.contacts)
    setAvatars(new Map(info.peerAvatars))

    // Best-effort: push notifications need an EAS project + granted permission.
    // Silently skipped (see zen-push.ts) if either is missing — chat works regardless.
    registerPushToken().then((zenPub) => { if (zenPub) void s.setZenPub(zenPub) }).catch(() => {})
  }, [])

  return (
    <SessionContext.Provider
      value={{
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
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}
