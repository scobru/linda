import { useCallback } from 'react'
import { useSession } from './useSession'
import type { ContactEntry } from '@core/app/session'

export interface UseContactsResult {
  contacts: ContactEntry[]
  incoming: ContactEntry[]
  outgoing: ContactEntry[]
  accepted: ContactEntry[]
  sendRequest: (userId: string, nickname: string) => Promise<boolean>
  respond: (userId: string, accept: boolean) => Promise<void>
  remove: (userId: string) => Promise<void>
}

export function useContacts(): UseContactsResult {
  const { session, contacts, refresh } = useSession()

  const incoming = contacts.filter((c) => c.status === 'incoming')
  const outgoing = contacts.filter((c) => c.status === 'outgoing')
  const accepted = contacts.filter((c) => c.status === 'accepted')

  const sendRequest = useCallback(async (userId: string, nickname: string): Promise<boolean> => {
    if (!session) return false
    const ok = await session.sendContactRequest(userId, nickname)
    if (ok) refresh()
    return ok
  }, [session, refresh])

  const respond = useCallback(async (userId: string, accept: boolean) => {
    if (!session) return
    // Refresh even on failure: the worklet may have gotten partway (room created, response not
    // sent) and the list must show what actually happened. The error still reaches the caller.
    try {
      await session.respondToContact(userId, accept)
    } finally {
      refresh()
    }
  }, [session, refresh])

  const remove = useCallback(async (userId: string) => {
    if (!session) return
    await session.deleteContact(userId)
    refresh()
  }, [session, refresh])

  return {
    contacts,
    incoming,
    outgoing,
    accepted,
    sendRequest,
    respond,
    remove,
  }
}
