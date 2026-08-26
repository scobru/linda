/**
 * Chat backgrounds, shared by desktop and mobile.
 *
 * Every pattern is one small tile built here rather than a shipped image: it keeps the app binary
 * the size it already is, scales to any screen without a second asset, and — because the ink
 * colour is a parameter — one definition serves both palettes instead of two files.
 *
 * The two platforms need the same tile in different wrappers. Desktop repeats it with CSS
 * `background-repeat`, so it wants a data URL. React Native's `Image` cannot render SVG at all
 * (its data-URI support stops at PNG/JPEG/GIF/WebP), so mobile draws it through `react-native-svg`
 * instead and needs the tile wrapped in an SVG `<pattern>` that fills the whole surface.
 */

export interface Wallpaper {
  id: string
  name: string
  /** Tile edge in px. */
  size: number
  /** The tile's shapes, given the ink colour. `null` = no pattern, just the app's background. */
  shapes: ((ink: string) => string) | null
}

export const WALLPAPERS: Wallpaper[] = [
  { id: 'plain', name: 'Plain', size: 0, shapes: null },
  {
    id: 'dots',
    name: 'Dots',
    size: 26,
    shapes: (ink) => `<circle cx="13" cy="13" r="2" fill="${ink}"/>`
  },
  {
    id: 'lattice',
    name: 'Lattice',
    size: 40,
    shapes: (ink) => `<path d="M0 20 L20 0 L40 20 L20 40 Z" fill="none" stroke="${ink}" stroke-width="1.5"/>`
  },
  {
    id: 'bubbles',
    name: 'Bubbles',
    size: 64,
    shapes: (ink) => [
      `<circle cx="16" cy="18" r="7" fill="none" stroke="${ink}" stroke-width="1.8"/>`,
      `<circle cx="46" cy="40" r="11" fill="none" stroke="${ink}" stroke-width="1.8"/>`,
      `<circle cx="52" cy="12" r="4" fill="${ink}"/>`,
      `<circle cx="8" cy="50" r="3" fill="${ink}"/>`
    ].join('')
  }
]

export const DEFAULT_WALLPAPER = 'plain'

/**
 * Ink colour for the current theme. Kept here so both platforms tint identically — they had drifted
 * apart when each picked its own value, and the first version was so faint it read as no pattern
 * at all on either.
 */
export function wallpaperInk(isDark: boolean): string {
  return isDark ? 'rgba(226,232,240,0.13)' : 'rgba(15,23,42,0.11)'
}

export function wallpaperById(id: string): Wallpaper {
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0]!
}

/** One tile as an SVG data URL, for CSS `background-repeat`. `null` for Plain. */
export function wallpaperDataUrl(id: string, ink: string): string | null {
  const wallpaper = wallpaperById(id)
  if (!wallpaper.shapes) return null
  const { size } = wallpaper
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${wallpaper.shapes(ink)}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * The tile wrapped in a `<pattern>` that fills the element, for renderers that draw SVG markup
 * directly rather than repeating an image (React Native). `null` for Plain.
 */
export function wallpaperPatternSvg(id: string, ink: string): string | null {
  const wallpaper = wallpaperById(id)
  if (!wallpaper.shapes) return null
  const { size } = wallpaper
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">',
    `<defs><pattern id="wp" x="0" y="0" width="${size}" height="${size}" patternUnits="userSpaceOnUse">`,
    wallpaper.shapes(ink),
    '</pattern></defs>',
    '<rect width="100%" height="100%" fill="url(#wp)"/>',
    '</svg>'
  ].join('')
}
