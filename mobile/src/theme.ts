/**
 * Design tokens — mirrors Keet-inspired theme (slate navy + indigo/cyan accents, rounded cards and pills).
 * Single source of truth for all mobile styling.
 */

export const darkColors = {
  // Backgrounds (from desktop --bg-*)
  bgPrimary: '#0e121a',
  bgSecondary: '#111622',
  bgTertiary: '#161c28',
  bgElevated: '#1c2433',
  bgHover: 'rgba(255, 255, 255, 0.06)',
  bgActive: '#1c2433',

  // Surfaces
  surface: '#161c28',
  surfaceHover: '#1c2434',
  card: '#161c28',
  cardBorder: 'rgba(255, 255, 255, 0.08)',

  // Text
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  textTertiary: '#64748b',
  textMuted: '#475569',

  // Accent / Brand (Keet Indigo + Cyan)
  accent: '#5865f2',
  accentLight: '#00c2cb',
  accentDark: '#4752c4',
  accentGlow: 'rgba(88, 101, 242, 0.35)',

  // Cyan Accent
  cyan: '#00c2cb',
  cyanLight: '#06b6d4',
  cyanDim: 'rgba(0, 194, 203, 0.15)',

  // Status
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#38bdf8',

  // Chat bubbles
  bubbleSelf: '#202b3d',
  bubbleSelfText: '#ffffff',
  bubbleOther: '#1c2433',
  bubbleOtherText: '#f1f5f9',

  // Misc
  border: 'rgba(255, 255, 255, 0.08)',
  borderFocus: '#00c2cb',
  overlay: 'rgba(0, 0, 0, 0.75)',
  inputBg: '#18202d',
  badgeBg: '#00c2cb',
  badgeText: '#061e27',
  betaBadge: '#f59e0b',
  betaBadgeBg: 'rgba(245, 158, 11, 0.12)',

  // Gradient stops
  gradientStart: '#5865f2',
  gradientEnd: '#00c2cb',
} as const

export type ThemeColors = { [K in keyof typeof darkColors]: string }

export const lightColors: ThemeColors = {
  bgPrimary: '#f8fafc',
  bgSecondary: '#ffffff',
  bgTertiary: '#f1f5f9',
  bgElevated: '#ffffff',
  bgHover: 'rgba(15, 23, 42, 0.04)',
  bgActive: '#e2e8f0',

  surface: '#ffffff',
  surfaceHover: '#f1f5f9',
  card: '#ffffff',
  cardBorder: '#e2e8f0',

  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textTertiary: '#94a3b8',
  textMuted: '#cbd5e1',

  accent: '#5865f2',
  accentLight: '#00c2cb',
  accentDark: '#4752c4',
  accentGlow: 'rgba(88, 101, 242, 0.18)',

  cyan: '#00c2cb',
  cyanLight: '#0891b2',
  cyanDim: 'rgba(0, 194, 203, 0.1)',

  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#0284c7',

  bubbleSelf: '#5865f2',
  bubbleSelfText: '#ffffff',
  bubbleOther: '#ffffff',
  bubbleOtherText: '#0f172a',

  border: '#e2e8f0',
  borderFocus: '#00c2cb',
  overlay: 'rgba(15, 23, 42, 0.4)',
  inputBg: '#f1f5f9',
  badgeBg: '#00c2cb',
  badgeText: '#ffffff',
  betaBadge: '#d97706',
  betaBadgeBg: 'rgba(217, 119, 6, 0.1)',

  gradientStart: '#5865f2',
  gradientEnd: '#00c2cb',
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const

// Matches desktop's --radius-* (rounded Keet aesthetic)
export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
} as const

export const typography = {
  // Font families — loaded via expo-font or system defaults
  fontFamily: 'System',
  fontFamilyMono: 'monospace',

  // Sizes
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  title: 28,

  // Weights
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
} as const

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  glow: {
    shadowColor: darkColors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
} as const

// Shared with desktop (app-shell.ts) so the same identityId resolves to the same avatar color
// and initials on both platforms.
export { AVATAR_COLORS, avatarColor, avatarInitials } from '@core/util/avatar'

export interface PresetAvatar {
  id: string
  name: string
  svg: string
}

/** Native SVG text rendering on Android doesn't reliably resolve color-emoji glyphs (renders blank) — plain letters on a solid fill instead. */
function presetSvg(fill: string, letter: string): string {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="${fill}"/><text x="50" y="67" font-size="42" font-family="sans-serif" font-weight="700" fill="white" text-anchor="middle">${letter}</text></svg>`
}

export const PRESET_AVATARS: PresetAvatar[] = [
  { id: 'cat', name: 'Cat', svg: presetSvg('%236366f1', 'C') },
  { id: 'dog', name: 'Dog', svg: presetSvg('%233b82f6', 'D') },
  { id: 'fox', name: 'Fox', svg: presetSvg('%23f59e0b', 'F') },
  { id: 'robot', name: 'Robot', svg: presetSvg('%2310b981', 'R') },
  { id: 'alien', name: 'Alien', svg: presetSvg('%238b5cf6', 'A') },
  { id: 'pear', name: 'Pear', svg: presetSvg('%2314b8a6', 'P') },
]
