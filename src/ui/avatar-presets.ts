import { svgToDataUrl } from './room-presets.js'

// ---------------------------------------------------------------------------
// The preset avatars, shared by desktop and mobile.
//
// Both shells had a gallery and they were not the same gallery. The desktop had these nine, drawn
// as real illustrations. Mobile had six of its own — `cat`, `dog`, `fox`, `robot`, `alien`, `pear`
// — every one of them a coloured circle with a single letter in it, which is pixel for pixel what
// `avatarColor` + `avatarInitials` already draw for a peer who has set no avatar at all. Picking one
// gave a mobile user exactly what they already had. That is not a smaller gallery than the
// desktop's; it is not a gallery.
//
// So there is one set now and it is the desktop's. Mobile gains nine avatars it never had; nobody
// loses anything they could see.
//
// The definitions live here rather than in either shell because the chosen value is not a local
// preference: `setAvatar` stores the whole data URL and presence broadcasts it, so the string a
// desktop picks is rendered by every mobile peer and the other way round. One definition is the only
// way the two ends are drawing the same picture.
// ---------------------------------------------------------------------------

export interface AvatarPreset {
  id: string
  name: string
  /** The `data:image/svg+xml;utf8,…` value stored on the profile and sent over presence. */
  svg: string
  /**
   * Strings this preset used to produce, kept so a profile that already holds one still lights up
   * its own tile in the picker.
   *
   * Both shells decide which preset is selected by comparing the stored value to `svg` exactly —
   * there is no preset id on the profile, only the picture. So editing a preset silently unselects
   * it for everyone who had chosen it: the avatar still renders, being self-contained, but the
   * gallery stops admitting it came from there. `matchesPreset` reads this list as well.
   */
  legacy?: string[]
}

/**
 * Nine presets, each a self-contained SVG under a kilobyte.
 *
 * `cyberpunk`'s visor glow is the one definition that changed. It asked for the glow with the CSS
 * shorthand `filter="drop-shadow(0 0 4px #00c2cb)"`, which a browser understands; `react-native-svg`
 * ships `feDropShadow` as an element and parses the shorthand only for its `FilterImage` component,
 * which is not the path an `SvgXml` takes. So the same glow is now asked for the portable way, as a
 * real `<filter>` in `<defs>` referenced by id — standard SVG that both ends resolve, built from the
 * primitive the library actually has. (`stdDeviation` is half the CSS blur radius.) Worth saying
 * plainly: this repo cannot render an Android view, so that is reasoned from the two libraries'
 * source rather than seen.
 */
const DEFINITIONS: { id: string; name: string; svg: string; legacy?: string[] }[] = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ec4899"/><stop offset="50%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#00c2cb"/></linearGradient><linearGradient id="v" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#00c2cb"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient><filter id="visorGlow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#00c2cb"/></filter></defs><rect width="100" height="100" rx="50" fill="#0f111a"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#g1)" stroke-width="2.5"/><path d="M26 44 L74 44 L68 56 L32 56 Z" fill="url(#v)" filter="url(#visorGlow)"/><rect x="22" y="47" width="6" height="4" rx="1" fill="#ec4899"/><rect x="72" y="47" width="6" height="4" rx="1" fill="#ec4899"/><circle cx="50" cy="70" r="3" fill="#00c2cb"/><path d="M42 66 L58 66" stroke="#ec4899" stroke-width="2" stroke-linecap="round"/><circle cx="35" cy="32" r="3" fill="#ec4899"/><circle cx="65" cy="32" r="3" fill="#00c2cb"/></svg>`,
    legacy: [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ec4899"/><stop offset="50%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#00c2cb"/></linearGradient><linearGradient id="v" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#00c2cb"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#0f111a"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#g1)" stroke-width="2.5"/><path d="M26 44 L74 44 L68 56 L32 56 Z" fill="url(#v)" filter="drop-shadow(0 0 4px #00c2cb)"/><rect x="22" y="47" width="6" height="4" rx="1" fill="#ec4899"/><rect x="72" y="47" width="6" height="4" rx="1" fill="#ec4899"/><circle cx="50" cy="70" r="3" fill="#00c2cb"/><path d="M42 66 L58 66" stroke="#ec4899" stroke-width="2" stroke-linecap="round"/><circle cx="35" cy="32" r="3" fill="#ec4899"/><circle cx="65" cy="32" r="3" fill="#00c2cb"/></svg>`]
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#180b2b"/><stop offset="100%" stop-color="#3b0764"/></linearGradient><linearGradient id="sun" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#fde047"/><stop offset="60%" stop-color="#f43f5e"/><stop offset="100%" stop-color="#c026d3"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="url(#bg)"/><circle cx="50" cy="46" r="26" fill="url(#sun)"/><line x1="24" y1="46" x2="76" y2="46" stroke="#180b2b" stroke-width="2.5"/><line x1="28" y1="52" x2="72" y2="52" stroke="#180b2b" stroke-width="3"/><line x1="34" y1="58" x2="66" y2="58" stroke="#180b2b" stroke-width="3.5"/><path d="M10 74 L90 74 M20 82 L80 82 M30 90 L70 90" stroke="#06b6d4" stroke-width="1.5" opacity="0.8"/><path d="M50 74 L50 96 M30 74 L15 96 M70 74 L85 96" stroke="#06b6d4" stroke-width="1.5" opacity="0.8"/></svg>`
  },
  {
    id: 'matrix',
    name: 'Hacker',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#021a0e"/><circle cx="50" cy="50" r="46" fill="none" stroke="#22c55e" stroke-width="2"/><text x="50" y="38" font-family="monospace" font-size="14" font-weight="bold" fill="#22c55e" text-anchor="middle" letter-spacing="1">&gt;_ LINDA</text><text x="50" y="58" font-family="monospace" font-size="11" fill="#4ade80" text-anchor="middle">01101001</text><text x="50" y="74" font-family="monospace" font-size="11" fill="#16a34a" text-anchor="middle">P2P // E2E</text></svg>`
  },
  {
    id: 'sovereign',
    name: 'Sovereign',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#eab308"/><stop offset="100%" stop-color="#a16207"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#1c1917"/><path d="M50 18 L76 30 V56 C76 72 50 84 50 84 C50 84 24 72 24 56 V30 Z" fill="none" stroke="url(#gold)" stroke-width="3.5"/><polygon points="50,34 54,44 64,44 56,51 59,61 50,55 41,61 44,51 36,44 46,44" fill="url(#gold)"/><circle cx="50" cy="50" r="46" fill="none" stroke="url(#gold)" stroke-width="1.5" stroke-dasharray="4,4"/></svg>`
  },
  {
    id: 'nebula',
    name: 'Nebula',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="neb" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#c084fc"/><stop offset="40%" stop-color="#6366f1"/><stop offset="80%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#090a0f"/></radialGradient></defs><rect width="100" height="100" rx="50" fill="url(#neb)"/><circle cx="50" cy="50" r="22" fill="#0f172a" stroke="#a855f7" stroke-width="2.5"/><ellipse cx="50" cy="50" rx="38" ry="12" fill="none" stroke="#38bdf8" stroke-width="2" transform="rotate(-25 50 50)"/><circle cx="32" cy="28" r="1.5" fill="#fff"/><circle cx="70" cy="24" r="1.5" fill="#fff"/><circle cx="68" cy="74" r="1.5" fill="#fff"/><circle cx="24" cy="68" r="1.5" fill="#fff"/><circle cx="50" cy="50" r="8" fill="#38bdf8" opacity="0.8"/></svg>`
  },
  {
    id: 'prism',
    name: 'Prism',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="p1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#6366f1"/></linearGradient><linearGradient id="p2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ec4899"/><stop offset="100%" stop-color="#f43f5e"/></linearGradient><linearGradient id="p3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#0b0f19"/><polygon points="50,18 78,42 50,56 22,42" fill="url(#p1)"/><polygon points="22,42 50,56 50,84" fill="url(#p2)"/><polygon points="78,42 50,56 50,84" fill="url(#p3)"/><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/></svg>`
  },
  {
    id: 'panther',
    name: 'Panther',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#050811"/><circle cx="50" cy="50" r="45" fill="none" stroke="#06b6d4" stroke-width="2"/><polygon points="30,26 40,42 22,46" fill="#06b6d4"/><polygon points="70,26 60,42 78,46" fill="#06b6d4"/><polygon points="30,32 38,42 26,45" fill="#0f172a"/><polygon points="70,32 62,42 74,45" fill="#0f172a"/><path d="M32 54 L44 58 L36 62 Z" fill="#22d3ee"/><path d="M68 54 L56 58 L64 62 Z" fill="#22d3ee"/><polygon points="50,66 45,72 55,72" fill="#06b6d4"/><path d="M42 76 Q50 82 58 76" stroke="#06b6d4" stroke-width="2" fill="none"/></svg>`
  },
  {
    id: 'pixel',
    name: 'Pixel Knight',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" shape-rendering="crispEdges"><rect width="100" height="100" rx="50" fill="#18181b"/><rect x="36" y="24" width="28" height="8" fill="#a1a1aa"/><rect x="28" y="32" width="44" height="28" fill="#71717a"/><rect x="36" y="40" width="8" height="6" fill="#38bdf8"/><rect x="56" y="40" width="8" height="6" fill="#38bdf8"/><rect x="44" y="48" width="12" height="12" fill="#3f3f46"/><rect x="32" y="60" width="36" height="16" fill="#52525b"/><rect x="44" y="64" width="12" height="8" fill="#e4e4e7"/></svg>`
  },
  {
    id: 'quantum',
    name: 'Quantum',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="qcore" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#67e8f9"/><stop offset="60%" stop-color="#06b6d4"/><stop offset="100%" stop-color="#083344"/></radialGradient></defs><rect width="100" height="100" rx="50" fill="#080d1a"/><ellipse cx="50" cy="50" rx="36" ry="14" fill="none" stroke="#22d3ee" stroke-width="1.5" transform="rotate(30 50 50)"/><ellipse cx="50" cy="50" rx="36" ry="14" fill="none" stroke="#818cf8" stroke-width="1.5" transform="rotate(-30 50 50)"/><ellipse cx="50" cy="50" rx="36" ry="14" fill="none" stroke="#f472b6" stroke-width="1.5" transform="rotate(90 50 50)"/><circle cx="50" cy="50" r="12" fill="url(#qcore)"/><circle cx="76" cy="35" r="3" fill="#22d3ee"/><circle cx="24" cy="65" r="3" fill="#818cf8"/><circle cx="50" cy="18" r="2.5" fill="#f472b6"/></svg>`
  }
]

export const AVATAR_PRESETS: AvatarPreset[] = DEFINITIONS.map((preset) => ({
  id: preset.id,
  name: preset.name,
  svg: svgToDataUrl(preset.svg),
  ...(preset.legacy ? { legacy: preset.legacy.map(svgToDataUrl) } : {})
}))

/**
 * Whether a stored avatar is this preset — its current drawing or one it used to have.
 *
 * Both shells ask this instead of `stored === preset.svg`, so that a preset can be redrawn without
 * quietly unselecting itself for everyone who had picked it.
 */
export function matchesPreset(preset: AvatarPreset, stored: string | null | undefined): boolean {
  if (!stored) return false
  return stored === preset.svg || (preset.legacy?.includes(stored) ?? false)
}
