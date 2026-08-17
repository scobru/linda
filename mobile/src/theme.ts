/**
 * Design tokens — mirrors desktop style.css exactly (Nothing-inspired monochrome + red accent, see style.css :root / [data-theme="light"]).
 * Single source of truth for all mobile styling.
 */

export const darkColors = {
  // Backgrounds (from desktop --bg-*)
  bgPrimary: '#000000',
  bgSecondary: '#0a0a0a',
  bgTertiary: '#171717',
  bgElevated: '#0d0d0d',
  bgHover: 'rgba(255, 255, 255, 0.05)',
  bgActive: 'rgba(215, 25, 33, 0.15)',

  // Surfaces
  surface: '#0d0d0d',
  surfaceHover: '#171717',
  card: '#0d0d0d',
  cardBorder: 'rgba(255, 255, 255, 0.05)',

  // Text
  textPrimary: '#ffffff',
  textSecondary: '#999999',
  textTertiary: '#5c5c5c',
  textMuted: '#3d3d3d',

  // Accent / Brand ("Nothing Red")
  accent: '#D71921',
  accentLight: '#ff2a34',
  accentDark: '#a10f16',
  accentGlow: 'rgba(215, 25, 33, 0.35)',

  // Status
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  // Chat bubbles
  bubbleSelf: '#161616',
  bubbleSelfText: '#ffffff',
  bubbleOther: '#0d0d0d',
  bubbleOtherText: '#f1f1f1',

  // Misc
  border: 'rgba(255, 255, 255, 0.1)',
  borderFocus: '#D71921',
  overlay: 'rgba(0, 0, 0, 0.6)',
  inputBg: '#0a0a0a',
  badgeBg: '#ef4444',
  badgeText: '#ffffff',

  // Gradient stops
  gradientStart: '#D71921',
  gradientEnd: '#ff2a34',
} as const

export type ThemeColors = { [K in keyof typeof darkColors]: string }

export const lightColors: ThemeColors = {
  bgPrimary: '#ffffff',
  bgSecondary: '#fafafa',
  bgTertiary: '#f0f0f0',
  bgElevated: '#ffffff',
  bgHover: 'rgba(10, 10, 10, 0.04)',
  bgActive: 'rgba(215, 25, 33, 0.1)',

  surface: '#ffffff',
  surfaceHover: '#f0f0f0',
  card: '#ffffff',
  cardBorder: 'rgba(10, 10, 10, 0.06)',

  textPrimary: '#0a0a0a',
  textSecondary: '#4d4d4d',
  textTertiary: '#999999',
  textMuted: '#c2c2c2',

  accent: '#D71921',
  accentLight: '#b8141a',
  accentDark: '#8f0d13',
  accentGlow: 'rgba(215, 25, 33, 0.18)',

  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  bubbleSelf: '#0a0a0a',
  bubbleSelfText: '#ffffff',
  bubbleOther: '#ffffff',
  bubbleOtherText: '#0a0a0a',

  border: '#e0e0e0',
  borderFocus: '#D71921',
  overlay: 'rgba(10, 10, 10, 0.4)',
  inputBg: '#f0f0f0',
  badgeBg: '#ef4444',
  badgeText: '#ffffff',

  gradientStart: '#D71921',
  gradientEnd: '#b8141a',
}

/** @deprecated static dark palette, kept for any not-yet-themed call site — prefer `useTheme().colors` */
export const colors = darkColors

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const

// Matches desktop's --radius-* (sharp, dot-matrix aesthetic — not the old rounded indigo look)
export const radii = {
  sm: 2,
  md: 4,
  lg: 6,
  xl: 8,
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
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
} as const

// Avatar helpers — identical array + hash to desktop's avatarColor() (app-shell.ts) so the same
// identityId resolves to the same avatar color on both platforms.
export const AVATAR_COLORS = [
  '#22c55e', '#00c2cb', '#3b82f6', '#8b5cf6',
  '#f59e0b', '#ec4899', '#10b981', '#06b6d4',
] as const

export function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!
}

export function avatarInitials(label: string): string {
  if (!label) return '?'
  const clean = label.replace(/[@#]/g, '').trim()
  return clean.slice(0, 2).toUpperCase() || '?'
}

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
