/**
 * Chat backgrounds, shared by desktop and mobile.
 *
 * Every pattern is an SVG built here rather than a shipped image: it keeps the app binary the
 * size it already is, scales to any screen without a second asset, and — because the colours are
 * parameters — one definition serves both the light and dark palette instead of two files.
 */

export interface Wallpaper {
  id: string
  name: string
  /** `null` = no pattern, just the app's own background colour. */
  svg: ((ink: string) => string) | null
}

function tile(size: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`
}

export const WALLPAPERS: Wallpaper[] = [
  { id: 'plain', name: 'Plain', svg: null },
  {
    id: 'dots',
    name: 'Dots',
    svg: (ink) => tile(28, `<circle cx="14" cy="14" r="1.6" fill="${ink}"/>`)
  },
  {
    id: 'lattice',
    name: 'Lattice',
    svg: (ink) => tile(40, `<path d="M0 20 L20 0 L40 20 L20 40 Z" fill="none" stroke="${ink}" stroke-width="1"/>`)
  },
  {
    id: 'bubbles',
    name: 'Bubbles',
    svg: (ink) => tile(64, [
      `<circle cx="16" cy="18" r="7" fill="none" stroke="${ink}" stroke-width="1.2"/>`,
      `<circle cx="46" cy="40" r="11" fill="none" stroke="${ink}" stroke-width="1.2"/>`,
      `<circle cx="52" cy="12" r="3.5" fill="${ink}"/>`,
      `<circle cx="8" cy="50" r="2.5" fill="${ink}"/>`
    ].join(''))
  }
]

export const DEFAULT_WALLPAPER = 'plain'

export function wallpaperById(id: string): Wallpaper {
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0]!
}

/**
 * `ink` is the pattern colour and carries its own alpha — the caller passes something close to
 * the text colour at low opacity, so the same pattern reads correctly on a light or a dark
 * background without a second set of definitions.
 */
export function wallpaperDataUrl(id: string, ink: string): string | null {
  const wallpaper = wallpaperById(id)
  if (!wallpaper.svg) return null
  return `data:image/svg+xml;utf8,${encodeURIComponent(wallpaper.svg(ink))}`
}
