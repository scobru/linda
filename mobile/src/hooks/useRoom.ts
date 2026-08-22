import { useState, useEffect, useCallback, useRef } from 'react'
import type { RoomProxy as Room } from '../bare/room-proxy'
import type { ChatMessage } from '@core/rooms/room'

// Only the tail is loaded on open; older messages come in on-demand via loadOlder() instead
// of decrypting and shipping a room's entire history across the RN<->worklet bridge every time.
const PAGE_SIZE = 50

/** A message shown before the send round-trip through the bare-rpc bridge finishes. */
export type LocalChatMessage = ChatMessage & { pending?: boolean; failed?: boolean }

// Keyed by room id, kept for the life of the app (not persisted to disk) — otherwise
// leaving a room screen and coming back re-fetches everything through the bare-rpc bridge
// even though nothing changed. Capped so someone in many rooms doesn't hold every room's
// history in RAM forever — oldest-touched room is dropped first (Map preserves insertion
// order; re-inserting on every write moves a room to the recently-used end).
const MAX_CACHED_ROOMS = 10
const roomCache = new Map<string, { messages: LocalChatMessage[]; oldestLoaded: number; hasMore: boolean }>()

function cacheRoom(id: string, entry: { messages: LocalChatMessage[]; oldestLoaded: number; hasMore: boolean }): void {
  roomCache.delete(id)
  roomCache.set(id, entry)
  if (roomCache.size > MAX_CACHED_ROOMS) {
    const lru = roomCache.keys().next().value
    if (lru !== undefined) roomCache.delete(lru)
  }
}

export interface UseRoomResult {
  messages: LocalChatMessage[]
  loading: boolean
  sendMessage: (body: string, replyTo?: string) => Promise<void>
  sendFile: (name: string, mimeType: string, base64: string, thumbnail?: string) => Promise<void>
  editMessage: (id: string, body: string) => Promise<void>
  deleteMessage: (id: string) => Promise<void>
  toggleReaction: (messageId: string, emoji: string) => Promise<void>
  refreshMessages: () => Promise<void>
  hasMore: boolean
  loadOlder: () => Promise<void>
  typingUsers: Set<string>
  notifyTyping: () => void
  readBy: Set<string>
}

export function useRoom(room: Room | null | undefined, identityId: string): UseRoomResult {
  const cached = room ? roomCache.get(room.id) : undefined
  const [messages, setMessages] = useState<LocalChatMessage[]>(cached?.messages ?? [])
  const [loading, setLoading] = useState(!cached)
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? false)
  const oldestLoadedRef = useRef(cached?.oldestLoaded ?? 0)
  const mountedRef = useRef(true)

  const loadMessages = useCallback(async () => {
    if (!room) return
    // A cached tail is shown instantly (see the initial useState above) while this re-verifies
    // it in the background — onMessage only keeps the cache current while this hook is mounted,
    // so anything that happened while the user was elsewhere (a new message, but just as easily a
    // reaction/edit/delete on a message already in the cached page, which doesn't change the
    // message count at all) needs re-checking. Always re-fetching just the tail page — the same
    // cost the very first load ever paid — keeps this correct without re-decrypting whatever
    // older history loadOlder() had paged in, which is the part actually worth caching.
    const cachedEntry = roomCache.get(room.id)
    const liveCount = await room.messageCount()
    if (!mountedRef.current) return
    const tailStart = Math.max(0, liveCount - PAGE_SIZE)
    const tail: ChatMessage[] = []
    for await (const msg of room.messages(tailStart, liveCount)) {
      if (!mountedRef.current) return
      tail.push(msg)
    }
    if (!mountedRef.current) return

    if (cachedEntry && cachedEntry.oldestLoaded <= tailStart) {
      const olderCount = tailStart - cachedEntry.oldestLoaded
      oldestLoadedRef.current = cachedEntry.oldestLoaded
      setHasMore(cachedEntry.hasMore || tailStart > 0)
      setMessages([...cachedEntry.messages.slice(0, olderCount), ...tail])
    } else {
      // No cache, or it starts later than the tail page we just fetched (e.g. a view truncation
      // shrank the room) — the tail fetch alone is the full trustworthy picture.
      oldestLoadedRef.current = tailStart
      setHasMore(tailStart > 0)
      setMessages(tail)
    }
    setLoading(false)
  }, [room])

  const refreshMessages = useCallback(async () => {
    if (room) roomCache.delete(room.id)
    await loadMessages()
  }, [room, loadMessages])

  const loadOlder = useCallback(async () => {
    if (!room) return
    const end = oldestLoadedRef.current
    if (end <= 0) return
    const start = Math.max(0, end - PAGE_SIZE)
    const older: ChatMessage[] = []
    for await (const msg of room.messages(start, end)) older.push(msg)
    if (!mountedRef.current) return
    oldestLoadedRef.current = start
    setHasMore(start > 0)
    setMessages((prev) => [...older, ...prev])
  }, [room])

  useEffect(() => {
    mountedRef.current = true
    void loadMessages()
    return () => { mountedRef.current = false }
  }, [loadMessages])

  // Keeps the cache in sync with every change (new/edited/deleted messages, pagination, sends)
  // without threading a write-through call into each individual setMessages call site.
  useEffect(() => {
    if (!room) return
    cacheRoom(room.id, { messages, oldestLoaded: oldestLoadedRef.current, hasMore })
  }, [room, messages, hasMore])

  // Listen for new messages and mutations
  useEffect(() => {
    if (!room) return
    const handler = async (index: number) => {
      if (!mountedRef.current) return
      // A mutation on a message from before the currently loaded page — leave it be, it'll
      // show up correctly once the user scrolls back and loadOlder() brings that page in.
      if (index < oldestLoadedRef.current) return
      try {
        const msg = await room.getMessage(index)
        setMessages((prev) => {
          const existing = prev.findIndex((m) => m.id === msg.id)
          if (existing >= 0) {
            const next = [...prev]
            next[existing] = msg
            return next
          }
          return [...prev, msg]
        })
      } catch {
        // Message unavailable, skip
      }
    }
    return room.onMessage(handler)
  }, [room])

  // Shows the message immediately instead of waiting on the bridge round-trip; reconciled with
  // the real record (same id, since 'roomMessage' targets it by index) once send() resolves.
  const sendMessage = useCallback(async (body: string, replyTo?: string) => {
    if (!room) return
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setMessages((prev) => [...prev, { id: tempId, roomId: room.id, authorId: identityId, body, timestamp: Date.now(), replyTo, pending: true }])
    try {
      const sent = await room.send(identityId, body, replyTo)
      setMessages((prev) => {
        const seen = new Set<string>()
        return prev
          .map((m) => (m.id === tempId ? sent : m))
          .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
      })
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)))
    }
  }, [room, identityId])

  const sendFile = useCallback(async (name: string, mimeType: string, base64: string, thumbnail?: string) => {
    if (!room) return
    await room.sendFile(identityId, name, mimeType, base64, thumbnail)
  }, [room, identityId])

  const editMessage = useCallback(async (id: string, body: string) => {
    if (!room) return
    await room.editMessage(id, body)
  }, [room])

  const deleteMessage = useCallback(async (id: string) => {
    if (!room) return
    await room.deleteMessage(id)
  }, [room])

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!room) return
    await room.toggleReaction(identityId, messageId, emoji)
  }, [room, identityId])

  // --- typing indicator: mirrors desktop's notifyTyping/onTyping (app-shell.ts) ---
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setTypingUsers(new Set())
    if (!room) return
    return room.onTyping((userId, typing) => {
      setTypingUsers((prev) => {
        const next = new Set(prev)
        if (typing) next.add(userId)
        else next.delete(userId)
        return next
      })
    })
  }, [room])

  const notifyTyping = useCallback(() => {
    if (!room) return
    void room.sendTyping(identityId, true)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => { void room.sendTyping(identityId, false) }, 3000)
  }, [room, identityId])

  // --- read receipts: mirrors desktop's notifyRead/onReadReceipt (app-shell.ts) ---
  const [readBy, setReadBy] = useState<Set<string>>(new Set())
  const lastReadSentRef = useRef<string | null>(null)

  useEffect(() => {
    setReadBy(new Set())
    lastReadSentRef.current = null
    if (!room) return
    return room.onReadReceipt((userId) => {
      setReadBy((prev) => new Set(prev).add(userId))
    })
  }, [room])

  useEffect(() => {
    if (!room) return
    const last = messages[messages.length - 1]
    if (!last || lastReadSentRef.current === last.id) return
    lastReadSentRef.current = last.id
    void room.sendReadReceipt(identityId, last.id)
  }, [room, identityId, messages])

  return {
    messages,
    loading,
    sendMessage,
    sendFile,
    editMessage,
    deleteMessage,
    toggleReaction,
    refreshMessages,
    hasMore,
    loadOlder,
    typingUsers,
    notifyTyping,
    readBy,
  }
}
