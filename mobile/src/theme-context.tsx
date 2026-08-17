import React, { createContext, useContext, useMemo, useState } from 'react'
import { useColorScheme } from 'react-native'
import { darkColors, lightColors, type ThemeColors } from './theme'

export type ThemeMode = 'system' | 'light' | 'dark'

interface ThemeContextValue {
  colors: ThemeColors
  mode: ThemeMode
  isDark: boolean
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme()
  const [mode, setMode] = useState<ThemeMode>('system')
  const isDark = mode === 'system' ? systemScheme !== 'light' : mode === 'dark'
  const colors = isDark ? darkColors : lightColors
  const value = useMemo(() => ({ colors, mode, isDark, setMode }), [colors, mode, isDark])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
