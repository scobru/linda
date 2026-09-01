/**
 * App shell backgrounds — the canvas behind the sidebar and chat panel, not the chat wallpaper
 * behind messages (see `wallpapers.ts`). Desktop-only: the floating sidebar/chat-panel layout this
 * paints behind is itself desktop-only, so there is nothing for mobile to wire up yet.
 */

export interface AppBackground {
  id: string
  name: string
  /** CSS `background` value for the given theme. Empty string = fall back to the flat `--bg` token. */
  css: (isDark: boolean) => string
}

export const APP_BACKGROUNDS: AppBackground[] = [
  { id: 'default', name: 'Default', css: () => '' },
  /* Strips the sidebar/chat panels' own background, border and shadow (see `.panels-transparent`
     in style.css) so whatever this paints on `.app-container` shows straight through them instead
     of just in the margins around them. */
  {
    id: 'transparent',
    name: 'Transparent',
    css: () => ''
  },
  {
    id: 'midnight',
    name: 'Midnight',
    css: (isDark) => isDark
      ? 'linear-gradient(160deg, #0b0e16 0%, #1b2140 55%, #0b0e16 100%)'
      : 'linear-gradient(160deg, #eef2ff 0%, #dbe4ff 55%, #f8fafc 100%)'
  },
  {
    id: 'aurora',
    name: 'Aurora',
    css: (isDark) => isDark
      ? 'linear-gradient(135deg, #0b1a1c 0%, #10202b 45%, #16203a 100%)'
      : 'linear-gradient(135deg, #ecfeff 0%, #e0f2fe 45%, #eef2ff 100%)'
  },
  {
    id: 'sunset',
    name: 'Sunset',
    css: (isDark) => isDark
      ? 'linear-gradient(160deg, #1a1420 0%, #2c1b2e 55%, #1a1420 100%)'
      : 'linear-gradient(160deg, #fdf2f8 0%, #fce7f3 55%, #fef3f2 100%)'
  },
  {
    id: 'forest',
    name: 'Forest',
    css: (isDark) => isDark
      ? 'linear-gradient(160deg, #0e1a15 0%, #16261d 55%, #0e1a15 100%)'
      : 'linear-gradient(160deg, #f0fdf4 0%, #dcfce7 55%, #f8fafc 100%)'
  }
]

export const DEFAULT_APP_BACKGROUND = 'default'

export function appBackgroundById(id: string): AppBackground {
  return APP_BACKGROUNDS.find((b) => b.id === id) ?? APP_BACKGROUNDS[0]!
}
