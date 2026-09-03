// Room icon presets, shared by both clients. They live here rather than in app-shell.ts because
// the mobile app needs them too and cannot import that file at all — it touches `document` and
// `HTMLElement` the moment it is evaluated, which Metro has no DOM for.
//
// The `data:image/svg+xml;utf8,` shape matters: react-native's Image decodes raster formats only,
// so the mobile Avatar detects this exact prefix and hands the markup to react-native-svg instead
// (see mobile/src/components/Avatar.tsx).

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export interface RoomPreset {
  id: string
  name: string
  svg: string
}

export const ROOM_PRESETS: RoomPreset[] = [
  { id: 'dev', name: 'Dev Hub', svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="rg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#0f172a"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#rg1)" stroke-width="2"/><path d="M36 38 L24 50 L36 62 M64 38 L76 50 L64 62 M54 32 L46 68" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`) },
  { id: 'music', name: 'Music Studio', svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="rm" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ec4899"/><stop offset="100%" stop-color="#f43f5e"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#180c1e"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#rm)" stroke-width="2"/><path d="M38 64 A6 6 0 1 1 32 58 L32 34 L68 26 L68 56 A6 6 0 1 1 62 50 L62 38 L38 44 Z" fill="#f43f5e"/></svg>`) },
  { id: 'gaming', name: 'Gaming Lounge', svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#091a18"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#rg)" stroke-width="2"/><rect x="24" y="38" width="52" height="30" rx="10" fill="#0f2e29" stroke="#10b981" stroke-width="2"/><circle cx="38" cy="53" r="3" fill="#10b981"/><circle cx="62" cy="48" r="2.5" fill="#34d399"/><circle cx="68" cy="54" r="2.5" fill="#06b6d4"/><circle cx="56" cy="54" r="2.5" fill="#a7f3d0"/><circle cx="62" cy="60" r="2.5" fill="#6ee7b7"/></svg>`) },
  { id: 'crypto', name: 'Sovereign Node', svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="rc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#facc15"/><stop offset="100%" stop-color="#ca8a04"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#191507"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#rc)" stroke-width="2"/><polygon points="50,22 74,36 74,64 50,78 26,64 26,36" fill="none" stroke="#facc15" stroke-width="3"/><circle cx="50" cy="50" r="10" fill="#facc15"/><line x1="50" y1="22" x2="50" y2="40" stroke="#facc15" stroke-width="2"/><line x1="26" y1="64" x2="42" y2="55" stroke="#facc15" stroke-width="2"/><line x1="74" y1="64" x2="58" y2="55" stroke="#facc15" stroke-width="2"/></svg>`) },
  { id: 'secret', name: 'Vault E2E', svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="rs" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#0f0e1c"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#rs)" stroke-width="2"/><rect x="30" y="44" width="40" height="32" rx="6" fill="#1e1b4b" stroke="#818cf8" stroke-width="2.5"/><path d="M38 44 V34 C38 27.37 43.37 22 50 22 C56.63 22 62 27.37 62 34 V44" fill="none" stroke="#818cf8" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="58" r="4" fill="#ec4899"/><path d="M50 62 V68" stroke="#ec4899" stroke-width="2.5" stroke-linecap="round"/></svg>`) },
  { id: 'lounge', name: 'Cozy Lounge', svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="rl" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#eab308"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#1c1208"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#rl)" stroke-width="2"/><path d="M30 46 C30 38 40 32 50 32 C60 32 70 38 70 46 C70 54 62 58 50 58 C38 58 30 54 30 46 Z" fill="#ea580c"/><rect x="26" y="52" width="48" height="18" rx="6" fill="#c2410c"/><circle cx="36" cy="44" r="2.5" fill="#fed7aa"/><circle cx="64" cy="44" r="2.5" fill="#fed7aa"/><path d="M44 64 Q50 68 56 64" stroke="#fed7aa" stroke-width="2" fill="none"/></svg>`) }
]
