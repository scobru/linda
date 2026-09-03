import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as SecureStore from 'expo-secure-store'

/**
 * Private mode — the phone-side counterpart of the desktop toggle (app-shell.ts, and the
 * `body.private-mode-active` rules in style.css): it hides what is on screen so the app can be
 * handed to someone without handing them the conversations.
 *
 * The desktop blurs the text with a CSS filter. React Native has no equivalent for text, and
 * expo-blur is not a dependency here, so the same three surfaces redact instead: message bodies,
 * room-list previews, and the room topic. Notification content is suppressed too — on a phone the
 * lock screen is where a message is most likely to be read by the wrong person, which is the one
 * case the desktop never has to handle.
 *
 * SecureStore rather than AsyncStorage for the reason dht-port.ts already gives: it is the one
 * key/value store this app ships.
 */
const KEY = 'linda-private-mode'

/** Mirrors the stored flag for callers outside the React tree — the notification is raised from a
 * bare-client event handler in useSession, which has no hook context to read. */
let cached = false

export function privateModeEnabled(): boolean {
  return cached
}

/** Same shape on every surface, so redacted text reads as deliberate rather than as a glitch.
 * Length is capped: a long message should not redact into a wall of dots. */
export function redact(text: string): string {
  const width = Math.min(Math.max(text.trim().length, 3), 18)
  return '•'.repeat(width)
}

interface PrivateModeValue {
  privateMode: boolean
  setPrivateMode: (on: boolean) => void
}

const PrivateModeContext = createContext<PrivateModeValue | null>(null)

export function PrivateModeProvider({ children }: { children: React.ReactNode }) {
  const [privateMode, setEnabled] = useState(cached)

  useEffect(() => {
    void SecureStore.getItemAsync(KEY)
      .then((value) => {
        cached = value === '1'
        setEnabled(cached)
      })
      .catch(() => {})
  }, [])

  const setPrivateMode = useCallback((on: boolean) => {
    cached = on
    setEnabled(on)
    void SecureStore.setItemAsync(KEY, on ? '1' : '0').catch(() => {})
  }, [])

  const value = useMemo(() => ({ privateMode, setPrivateMode }), [privateMode, setPrivateMode])
  return <PrivateModeContext.Provider value={value}>{children}</PrivateModeContext.Provider>
}

export function usePrivateMode(): PrivateModeValue {
  const ctx = useContext(PrivateModeContext)
  if (!ctx) throw new Error('usePrivateMode must be used within PrivateModeProvider')
  return ctx
}
