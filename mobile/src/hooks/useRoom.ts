import { useState, useEffect, useCallback, useRef } from 'react'
import type { RoomProxy as Room } from '../bare/room-proxy'
import type { ChatMessage } from '@core/rooms/room'

export interface UseRoomResult {
  messages: ChatMessage[]
  loading: boolean
  sendMessage: (body: string, replyTo?: string) => Promise<void>
  sendFile: (name: string, mimeType: string, base64: string, thumbnail?: string) => Promise<void>
  editMessage: (id: string, body: string) => Promise<void>
  deleteMessage: (id: string) => Promise<void>
  toggleReaction: (messageId: string, emoji: string) => Promise<void>
  refreshMessages: () => Promise<void>
  typingUsers: Set<string>
  notifyTyping: () => void
  readBy: Set<string>
}

export function useRoom(room: Room | null | undefined, identityId: string): UseRoomResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  const loadMessages = useCallback(async () => {
    if (!room) return
    setLoading(true)
    const msgs: ChatMessage[] = []
    for await (const msg of room.messages()) {
      if (!mountedRef.current) return
      msgs.push(msg)
    }
    if (mountedRef.current) {
      setMessages(msgs)
      setLoading(false)
    }
  }, [room])

  useEffect(() => {
    mountedRef.current = true
    void loadMessages()
    return () => { mountedRef.current = false }
  }, [loadMessages])

  // Listen for new messages and mutations
  useEffect(() => {
    if (!room) return
    const handler = async (index: number) => {
      if (!mountedRef.current) return
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
    room.onMessage(handler)
    // Note: Room doesn't provide an unsubscribe mechanism,
    // but the mountedRef guard prevents state updates after unmount
  }, [room])

  const sendMessage = useCallback(async (body: string, replyTo?: string) => {
    if (!room) return
    await room.send(identityId, body, replyTo)
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
    refreshMessages: loadMessages,
    typingUsers,
    notifyTyping,
    readBy,
  }
}
