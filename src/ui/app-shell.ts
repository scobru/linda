import b4a from 'b4a'
import { identityExists, createIdentity, unlockIdentity, recoverIdentity, pairIdentity, revealMnemonic, WrongPassphraseError, type Identity } from '../identity/index.js'
import { Session, type RoomBookmark } from '../app/session.js'
import type { Room, ChatMessage, VaultFile } from '../rooms/room.js'
import { inviteToDataUrl, decodeInviteFromImageFile, decodeInvite, encodeInvite, DEFAULT_CHANNEL, textToDataUrl, decodeTextFromImageFile } from './qr.js'
import { hostPairing, joinPairing, decodePairingCode } from '../identity/pairing.js'
import { extractHashtags, hasHashtag, linkifyHashtags } from '../util/hashtag.js'
import { avatarColor, avatarInitials } from '../util/avatar.js'

function storageDir(): string {
  if (typeof Pear !== 'undefined') return Pear.config.storage
  if (process.env.LINDA_PEAR_STORAGE_DIR) return process.env.LINDA_PEAR_STORAGE_DIR
  const os = require('node:os')
  const path = require('node:path')
  return path.join(os.homedir(), '.linda-pear', 'storage')
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const PRESET_AVATARS = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ec4899"/><stop offset="50%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#00c2cb"/></linearGradient><linearGradient id="v" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#00c2cb"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#0f111a"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#g1)" stroke-width="2.5"/><path d="M26 44 L74 44 L68 56 L32 56 Z" fill="url(#v)" filter="drop-shadow(0 0 4px #00c2cb)"/><rect x="22" y="47" width="6" height="4" rx="1" fill="#ec4899"/><rect x="72" y="47" width="6" height="4" rx="1" fill="#ec4899"/><circle cx="50" cy="70" r="3" fill="#00c2cb"/><path d="M42 66 L58 66" stroke="#ec4899" stroke-width="2" stroke-linecap="round"/><circle cx="35" cy="32" r="3" fill="#ec4899"/><circle cx="65" cy="32" r="3" fill="#00c2cb"/></svg>`)
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#180b2b"/><stop offset="100%" stop-color="#3b0764"/></linearGradient><linearGradient id="sun" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#fde047"/><stop offset="60%" stop-color="#f43f5e"/><stop offset="100%" stop-color="#c026d3"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="url(#bg)"/><circle cx="50" cy="46" r="26" fill="url(#sun)"/><line x1="24" y1="46" x2="76" y2="46" stroke="#180b2b" stroke-width="2.5"/><line x1="28" y1="52" x2="72" y2="52" stroke="#180b2b" stroke-width="3"/><line x1="34" y1="58" x2="66" y2="58" stroke="#180b2b" stroke-width="3.5"/><path d="M10 74 L90 74 M20 82 L80 82 M30 90 L70 90" stroke="#06b6d4" stroke-width="1.5" opacity="0.8"/><path d="M50 74 L50 96 M30 74 L15 96 M70 74 L85 96" stroke="#06b6d4" stroke-width="1.5" opacity="0.8"/></svg>`)
  },
  {
    id: 'matrix',
    name: 'Hacker',
    svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#021a0e"/><circle cx="50" cy="50" r="46" fill="none" stroke="#22c55e" stroke-width="2"/><text x="50" y="38" font-family="monospace" font-size="14" font-weight="bold" fill="#22c55e" text-anchor="middle" letter-spacing="1">&gt;_ LINDA</text><text x="50" y="58" font-family="monospace" font-size="11" fill="#4ade80" text-anchor="middle">01101001</text><text x="50" y="74" font-family="monospace" font-size="11" fill="#16a34a" text-anchor="middle">P2P // E2E</text></svg>`)
  },
  {
    id: 'sovereign',
    name: 'Sovereign',
    svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#eab308"/><stop offset="100%" stop-color="#a16207"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#1c1917"/><path d="M50 18 L76 30 V56 C76 72 50 84 50 84 C50 84 24 72 24 56 V30 Z" fill="none" stroke="url(#gold)" stroke-width="3.5"/><polygon points="50,34 54,44 64,44 56,51 59,61 50,55 41,61 44,51 36,44 46,44" fill="url(#gold)"/><circle cx="50" cy="50" r="46" fill="none" stroke="url(#gold)" stroke-width="1.5" stroke-dasharray="4,4"/></svg>`)
  },
  {
    id: 'nebula',
    name: 'Nebula',
    svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="neb" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#c084fc"/><stop offset="40%" stop-color="#6366f1"/><stop offset="80%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#090a0f"/></radialGradient></defs><rect width="100" height="100" rx="50" fill="url(#neb)"/><circle cx="50" cy="50" r="22" fill="#0f172a" stroke="#a855f7" stroke-width="2.5"/><ellipse cx="50" cy="50" rx="38" ry="12" fill="none" stroke="#38bdf8" stroke-width="2" transform="rotate(-25 50 50)"/><circle cx="32" cy="28" r="1.5" fill="#fff"/><circle cx="70" cy="24" r="1.5" fill="#fff"/><circle cx="68" cy="74" r="1.5" fill="#fff"/><circle cx="24" cy="68" r="1.5" fill="#fff"/><circle cx="50" cy="50" r="8" fill="#38bdf8" opacity="0.8"/></svg>`)
  },
  {
    id: 'prism',
    name: 'Prism',
    svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="p1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#6366f1"/></linearGradient><linearGradient id="p2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ec4899"/><stop offset="100%" stop-color="#f43f5e"/></linearGradient><linearGradient id="p3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#0b0f19"/><polygon points="50,18 78,42 50,56 22,42" fill="url(#p1)"/><polygon points="22,42 50,56 50,84" fill="url(#p2)"/><polygon points="78,42 50,56 50,84" fill="url(#p3)"/><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/></svg>`)
  },
  {
    id: 'panther',
    name: 'Panther',
    svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#050811"/><circle cx="50" cy="50" r="45" fill="none" stroke="#06b6d4" stroke-width="2"/><polygon points="30,26 40,42 22,46" fill="#06b6d4"/><polygon points="70,26 60,42 78,46" fill="#06b6d4"/><polygon points="30,32 38,42 26,45" fill="#0f172a"/><polygon points="70,32 62,42 74,45" fill="#0f172a"/><path d="M32 54 L44 58 L36 62 Z" fill="#22d3ee"/><path d="M68 54 L56 58 L64 62 Z" fill="#22d3ee"/><polygon points="50,66 45,72 55,72" fill="#06b6d4"/><path d="M42 76 Q50 82 58 76" stroke="#06b6d4" stroke-width="2" fill="none"/></svg>`)
  },
  {
    id: 'pixel',
    name: 'Pixel Knight',
    svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" shape-rendering="crispEdges"><rect width="100" height="100" rx="50" fill="#18181b"/><rect x="36" y="24" width="28" height="8" fill="#a1a1aa"/><rect x="28" y="32" width="44" height="28" fill="#71717a"/><rect x="36" y="40" width="8" height="6" fill="#38bdf8"/><rect x="56" y="40" width="8" height="6" fill="#38bdf8"/><rect x="44" y="48" width="12" height="12" fill="#3f3f46"/><rect x="32" y="60" width="36" height="16" fill="#52525b"/><rect x="44" y="64" width="12" height="8" fill="#e4e4e7"/></svg>`)
  },
  {
    id: 'quantum',
    name: 'Quantum',
    svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="qcore" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#67e8f9"/><stop offset="60%" stop-color="#06b6d4"/><stop offset="100%" stop-color="#083344"/></radialGradient></defs><rect width="100" height="100" rx="50" fill="#080d1a"/><ellipse cx="50" cy="50" rx="36" ry="14" fill="none" stroke="#22d3ee" stroke-width="1.5" transform="rotate(30 50 50)"/><ellipse cx="50" cy="50" rx="36" ry="14" fill="none" stroke="#818cf8" stroke-width="1.5" transform="rotate(-30 50 50)"/><ellipse cx="50" cy="50" rx="36" ry="14" fill="none" stroke="#f472b6" stroke-width="1.5" transform="rotate(90 50 50)"/><circle cx="50" cy="50" r="12" fill="url(#qcore)"/><circle cx="76" cy="35" r="3" fill="#22d3ee"/><circle cx="24" cy="65" r="3" fill="#818cf8"/><circle cx="50" cy="18" r="2.5" fill="#f472b6"/></svg>`)
  }
]

export const ROOM_PRESETS = [
  { id: 'dev', name: 'Dev Hub', svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="rg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#0f172a"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#rg1)" stroke-width="2"/><path d="M36 38 L24 50 L36 62 M64 38 L76 50 L64 62 M54 32 L46 68" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`) },
  { id: 'music', name: 'Music Studio', svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="rm" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ec4899"/><stop offset="100%" stop-color="#f43f5e"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#180c1e"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#rm)" stroke-width="2"/><path d="M38 64 A6 6 0 1 1 32 58 L32 34 L68 26 L68 56 A6 6 0 1 1 62 50 L62 38 L38 44 Z" fill="#f43f5e"/></svg>`) },
  { id: 'gaming', name: 'Gaming Lounge', svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#091a18"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#rg)" stroke-width="2"/><rect x="24" y="38" width="52" height="30" rx="10" fill="#0f2e29" stroke="#10b981" stroke-width="2"/><circle cx="38" cy="53" r="3" fill="#10b981"/><circle cx="62" cy="48" r="2.5" fill="#34d399"/><circle cx="68" cy="54" r="2.5" fill="#06b6d4"/><circle cx="56" cy="54" r="2.5" fill="#a7f3d0"/><circle cx="62" cy="60" r="2.5" fill="#6ee7b7"/></svg>`) },
  { id: 'crypto', name: 'Sovereign Node', svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="rc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#facc15"/><stop offset="100%" stop-color="#ca8a04"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#191507"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#rc)" stroke-width="2"/><polygon points="50,22 74,36 74,64 50,78 26,64 26,36" fill="none" stroke="#facc15" stroke-width="3"/><circle cx="50" cy="50" r="10" fill="#facc15"/><line x1="50" y1="22" x2="50" y2="40" stroke="#facc15" stroke-width="2"/><line x1="26" y1="64" x2="42" y2="55" stroke="#facc15" stroke-width="2"/><line x1="74" y1="64" x2="58" y2="55" stroke="#facc15" stroke-width="2"/></svg>`) },
  { id: 'secret', name: 'Vault E2E', svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="rs" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#ec4899"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#0f0e1c"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#rs)" stroke-width="2"/><rect x="30" y="44" width="40" height="32" rx="6" fill="#1e1b4b" stroke="#818cf8" stroke-width="2.5"/><path d="M38 44 V34 C38 27.37 43.37 22 50 22 C56.63 22 62 27.37 62 34 V44" fill="none" stroke="#818cf8" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="58" r="4" fill="#ec4899"/><path d="M50 62 V68" stroke="#ec4899" stroke-width="2.5" stroke-linecap="round"/></svg>`) },
  { id: 'lounge', name: 'Cozy Lounge', svg: svgToDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="rl" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#eab308"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="#1c1208"/><circle cx="50" cy="50" r="45" fill="none" stroke="url(#rl)" stroke-width="2"/><path d="M30 46 C30 38 40 32 50 32 C60 32 70 38 70 46 C70 54 62 58 50 58 C38 58 30 54 30 46 Z" fill="#ea580c"/><rect x="26" y="52" width="48" height="18" rx="6" fill="#c2410c"/><circle cx="36" cy="44" r="2.5" fill="#fed7aa"/><circle cx="64" cy="44" r="2.5" fill="#fed7aa"/><path d="M44 64 Q50 68 56 64" stroke="#fed7aa" stroke-width="2" fill="none"/></svg>`) }
]

function resizeImageToDataUrl(file: File, maxDim = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const size = Math.min(img.width, img.height)
        const sx = (img.width - size) / 2
        const sy = (img.height - size) / 2
        const targetDim = Math.min(size, maxDim)
        canvas.width = targetDim
        canvas.height = targetDim
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(reader.result as string)
          return
        }
        ctx.drawImage(img, sx, sy, size, size, 0, 0, targetDim, targetDim)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

function avatarHtml(id: string, size: 'sm' | 'md' | 'lg' | 'xl' | '' = '', label?: string, avatarUrl?: string): string {
  const bg = avatarColor(id || 'default')
  const text = avatarInitials(label || id)
  const escapedLabel = escapeHtml(label || id)
  if (avatarUrl && avatarUrl.trim()) {
    return `<div class="avatar ${size} has-img" title="${escapedLabel}"><img src="${avatarUrl}" alt="${escapedLabel}" /></div>`
  }
  return `<div class="avatar ${size}" style="background:${bg}" title="${escapedLabel}">${text}</div>`
}

// --- SVG Icons -------------------------------------------------------------
const ICONS = {
  shield: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  lock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  key: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`,
  compass: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>`,
  users: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  qr: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  send: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  attach: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
  phone: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  phoneOff: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>`,
  copy: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  edit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  reply: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
  smile: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  device: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
  chat: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  camera: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  settings: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  verified: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#38bdf8" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`,
  globe: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  moon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  sun: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
  user: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  userPlus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>`,
  folder: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  folderLarge: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  upload: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  download: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  image: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  music: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  video: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`,
  archive: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
  file: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  eye: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  crown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h20l-2-11-5 4-3-6-3 6-5-4z"/></svg>`,
  volumeOff: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
  volumeOn: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  ban: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
  kick: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  externalLink: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  star: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  mic: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  stopCircle: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6"/></svg>`,
  play: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" style="vertical-align:-1px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  starFilled: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  chatSmall: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  shieldSmall: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  hash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`
}

type View = 'create' | 'unlock' | 'recover' | 'reveal' | 'pair' | 'app'
  | 'profile' | 'room-settings' | 'members' | 'invite' | 'discover' | 'people' | 'pair-device' | 'network-status'

type FilterTab = 'all' | 'unread' | 'favorites'

export class AppShell extends HTMLElement {
  private view: View = 'create'
  private identity: Identity | null = null
  private pendingMnemonic: string | null = null
  private session: Session | null = null
  private activeRoom: Room | null = null
  private activeRoomName = ''
  /** Set right before a send/edit of our own — the next renderMessages() should land on the tail
   * regardless of scroll position, unlike an arbitrary incoming mutation which shouldn't yank
   * someone back down while they're reading history. */
  private forceScrollOnNextRender = false
  private replyingTo: ChatMessage | null = null
  private editingMessage: ChatMessage | null = null
  private selectionMode = false
  private selectedMessageIds = new Set<string>()
  private messageFilter = ''
  /** Non-null while the message list is narrowed to one hashtag — see renderHashtagBar. */
  private activeHashtag: string | null = null
  private activeRoomTab: 'chat' | 'vault' = 'chat'
  private vaultSearchQuery = ''
  private editingMessageId: string | null = null
  private activeFilter: FilterTab = 'all'
  private sidebarSearchQuery = ''
  private isProfileDrawerOpen = false
  private privateMode = false
  private activeModal: 'none' | 'new-group' | 'join-room' = 'none'

  private profileWorkingAvatar = ''
  private profileWorkingNickname = ''
  private profileShowSecretKey = false
  private profileMnemonicWords: string | null = null
  private profileMnemonicError = ''
  private roomSettingsWorkingName = ''
  private roomSettingsWorkingAvatar = ''
  private roomSettingsWorkingDesc = ''
  private inviteQrDataUrl = ''
  private pairStep: 'starting' | 'code' | 'done' = 'starting'
  private pairDataUrl = ''
  private pairStop: (() => void) | null = null
  private typingPeers = new Set<string>()
  private readBy = new Set<string>()
  private lastReadSent: string | null = null
  private onlineUsers = new Set<string>()
  private nicknames = new Map<string, string>()
  private avatars = new Map<string, string>()
  private nickname = ''
  private avatar = ''
  private remoteImageCache = new Map<string, string>()
  private lastMessages = new Map<string, { author: string; text: string; time: number }>()
  private renderAppQueued = false
  /** Torn down when the active room changes — a room fires its listeners for the lifetime of the
   * session, so leaving these attached meant every previously-visited room kept redrawing the UI,
   * multiplying the cost of every incoming message by the number of rooms opened so far. */
  private activeRoomUnsubscribes: Array<() => void> = []

  connectedCallback(): void {
    if (localStorage.getItem('linda-theme') === 'light') document.documentElement.setAttribute('data-theme', 'light')
    if (localStorage.getItem('linda-private-mode') === 'true') {
      this.privateMode = true
      document.body.classList.add('private-mode-active')
    }

    this.view = identityExists(storageDir()) ? 'unlock' : 'create'
    this.render()
  }

  private toggleTheme(): void {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light'
    if (isLight) {
      document.documentElement.removeAttribute('data-theme')
      localStorage.setItem('linda-theme', 'dark')
    } else {
      document.documentElement.setAttribute('data-theme', 'light')
      localStorage.setItem('linda-theme', 'light')
    }
    this.render()
  }

  /** For redraws triggered by the network rather than by the user: replication delivers messages in
   * bursts, and `renderApp` rebuilds the whole DOM, so a burst of N events used to cost N full
   * rebuilds to display one final state. Coalesces them into a single rebuild per frame. User
   * actions still call `renderApp` directly, where the immediate repaint is the point. */
  private scheduleRenderApp(): void {
    if (this.renderAppQueued) return
    this.renderAppQueued = true
    requestAnimationFrame(() => {
      this.renderAppQueued = false
      if (this.view === 'app') this.renderApp()
    })
  }

  private render(): void {
    if (this.view === 'create') return this.renderCreate()
    if (this.view === 'unlock') return this.renderUnlock()
    if (this.view === 'recover') return this.renderRecover()
    if (this.view === 'reveal') return this.renderReveal()
    if (this.view === 'pair') return this.renderPair()
    if (this.view === 'app') return this.renderApp()
    if (this.view === 'profile') return this.renderProfilePage()
    if (this.view === 'room-settings') return this.renderRoomSettingsPage()
    if (this.view === 'members') return this.renderMembersPage()
    if (this.view === 'invite') return this.renderInvitePage()
    if (this.view === 'discover') return this.renderDiscoverPage()
    if (this.view === 'people') return this.renderPeoplePage()
    if (this.view === 'pair-device') return this.renderPairDevicePage()
    if (this.view === 'network-status') return this.renderNetworkStatusPage()
  }

  // --- identity ---------------------------------------------------------

  private renderCreate(): void {
    this.innerHTML = `
      <div class="centered">
        <div class="auth-card">
          <div class="brand-header">
            <div class="brand-badge">${ICONS.shield}</div>
            <h1>Create Identity</h1>
            <p>Linda is a decentralized, serverless P2P messenger powered by the Holepunch stack.</p>
          </div>
          <div class="form-group">
            <label style="font-size:0.8rem;color:var(--text-dim);font-weight:500;">Passphrase</label>
            <input id="pass" type="password" placeholder="Choose a secure passphrase" autofocus />
          </div>
          <button id="submit" class="primary">Create Identity</button>
          <p class="link" id="showPair" style="color:var(--accent);cursor:pointer;text-align:center;margin-top:1rem;font-size:0.85rem;">Have another device? Pair instead</p>
          <p class="toast" id="error"></p>
        </div>
      </div>
    `
    this.querySelector('#submit')!.addEventListener('click', () => {
      const pass = (this.querySelector('#pass') as HTMLInputElement).value
      if (!pass) return this.setError('Passphrase required')
      const { identity, mnemonic } = createIdentity(pass, storageDir())
      this.identity = identity
      this.pendingMnemonic = mnemonic
      this.view = 'reveal'
      this.render()
    })
    const passInput = this.querySelector('#pass') as HTMLInputElement
    passInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (this.querySelector('#submit') as HTMLButtonElement).click()
    })
    this.querySelector('#showPair')!.addEventListener('click', () => {
      this.view = 'pair'
      this.render()
    })
  }

  private renderReveal(): void {
    const words = this.pendingMnemonic!.split(' ')
    this.innerHTML = `
      <div class="centered">
        <div class="auth-card" style="max-width: 520px;">
          <div class="brand-header">
            <div class="brand-badge">${ICONS.key}</div>
            <h1>Recovery Phrase</h1>
            <p>Save these 12 words in a safe place. They are the <strong>only way</strong> to recover your identity if you lose access to this device.</p>
          </div>
          <div class="mnemonic-container">
            <div class="mnemonic-grid">
              ${words.map((w, i) => `<div class="mnemonic-word"><span>${i + 1}</span>${escapeHtml(w)}</div>`).join('')}
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.5rem">
            <button id="copyMnemonic" class="ghost" style="font-size:0.8rem;padding:0.4rem 0.6rem;">${ICONS.copy} Copy to clipboard</button>
            <label class="check-row"><input type="checkbox" id="confirm" /> I have saved it safely</label>
          </div>
          <button id="continue" class="primary" disabled style="margin-top:1.25rem;">Enter Linda</button>
        </div>
      </div>
    `
    const confirm = this.querySelector('#confirm') as HTMLInputElement
    const btn = this.querySelector('#continue') as HTMLButtonElement
    confirm.addEventListener('change', () => {
      btn.disabled = !confirm.checked
    })
    btn.addEventListener('click', () => this.enterApp(true))
    this.querySelector('#copyMnemonic')!.addEventListener('click', () => {
      copyToClipboard(this.pendingMnemonic!)
      const c = this.querySelector('#copyMnemonic')!
      c.textContent = '✓ Copied!'
      setTimeout(() => { c.innerHTML = `${ICONS.copy} Copy to clipboard` }, 2000)
    })
  }

  private renderUnlock(): void {
    this.innerHTML = `
      <div class="centered">
        <div class="auth-card">
          <div class="brand-header">
            <div class="brand-badge">${ICONS.lock}</div>
            <h1>Unlock Identity</h1>
            <p>Enter your local device passphrase to unlock your cryptographic identity.</p>
          </div>
          <div class="form-group">
            <input id="pass" type="password" placeholder="Device passphrase" autofocus />
          </div>
          <button id="submit" class="primary">Unlock</button>
          <p class="link" id="showRecover" style="color:var(--accent);cursor:pointer;text-align:center;margin-top:1rem;font-size:0.85rem;">Lost passphrase? Recover from phrase</p>
          <!-- Joining a pairing replaces whatever identity is on this device, so it lived only on
               the first-run screen. That left no way to adopt another device's identity here
               without wiping the install first, and no hint that this was even possible. -->
          <p class="link" id="showPairFromUnlock" style="color:var(--text-muted);cursor:pointer;text-align:center;margin-top:0.5rem;font-size:0.8rem;">Pair with another device instead</p>
          <p class="toast" id="error"></p>
        </div>
      </div>
    `
    const submit = () => {
      const pass = (this.querySelector('#pass') as HTMLInputElement).value
      if (!pass) return this.setError('Passphrase required')
      try {
        this.identity = unlockIdentity(pass, storageDir())
        this.enterApp()
      } catch (err) {
        this.setError(err instanceof WrongPassphraseError ? 'Wrong passphrase' : 'Failed to unlock')
      }
    }
    this.querySelector('#submit')!.addEventListener('click', submit)
    const passInput = this.querySelector('#pass') as HTMLInputElement
    passInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit()
    })
    this.querySelector('#showPairFromUnlock')!.addEventListener('click', () => {
      // Destructive: the identity already stored here is overwritten by the one being adopted,
      // and its rooms go with it. Worth a confirmation the first-run screen doesn't need.
      if (!confirm(
        'Pairing adopts another device’s identity and replaces the one already on this device.\n\n' +
        'The rooms and contacts stored here will no longer be reachable unless you have that ' +
        'identity’s recovery phrase.\n\nContinue?'
      )) return
      this.view = 'pair'
      this.render()
    })
    this.querySelector('#showRecover')!.addEventListener('click', () => {
      this.view = 'recover'
      this.render()
    })
  }

  private renderRecover(): void {
    this.innerHTML = `
      <div class="centered">
        <div class="auth-card">
          <div class="brand-header">
            <div class="brand-badge">${ICONS.key}</div>
            <h1>Recover Identity</h1>
            <p>Enter your 12-word recovery phrase and choose a new passphrase for this device.</p>
          </div>
          <div class="form-group">
            <textarea id="mnemonic" placeholder="word1 word2 word3 ... (12 words)" rows="3"></textarea>
            <input id="pass" type="password" placeholder="New passphrase" />
          </div>
          <button id="submit" class="primary">Recover Identity</button>
          <p class="link" id="showUnlock" style="color:var(--accent);cursor:pointer;text-align:center;margin-top:1rem;font-size:0.85rem;">Back to unlock</p>
          <p class="toast" id="error"></p>
        </div>
      </div>
    `
    this.querySelector('#submit')!.addEventListener('click', () => {
      const mnemonic = (this.querySelector('#mnemonic') as HTMLTextAreaElement).value
      const pass = (this.querySelector('#pass') as HTMLInputElement).value
      if (!pass) return this.setError('Passphrase required')
      try {
        this.identity = recoverIdentity(mnemonic, pass, storageDir())
        this.enterApp()
      } catch {
        this.setError('Invalid recovery phrase')
      }
    })
    this.querySelector('#showUnlock')!.addEventListener('click', () => {
      this.view = 'unlock'
      this.render()
    })
  }

  private renderPair(): void {
    this.innerHTML = `
      <div class="centered">
        <div class="auth-card">
          <div class="brand-header">
            <div class="brand-badge">${ICONS.device}</div>
            <h1>Pair Device</h1>
            <p>On your other device, go to <strong>Profile &gt; Pair Device</strong> and paste the pairing code or scan QR code here.</p>
          </div>
          <div class="form-group">
            <textarea id="pairCode" placeholder="Paste pairing code here..." rows="2"></textarea>
            <div style="display:flex;justify-content:flex-end;">
              <label class="file-label" style="font-size:0.8rem;cursor:pointer;color:var(--accent);display:inline-flex;align-items:center;gap:0.3rem">
                ${ICONS.qr} Scan QR image
                <input id="pairQrFile" type="file" accept="image/*" style="display:none" />
              </label>
            </div>
            <input id="pass" type="password" placeholder="New passphrase for this device" />
          </div>
          <button id="submit" class="primary">Pair Device</button>
          <p class="link" id="showCreate" style="color:var(--accent);cursor:pointer;text-align:center;margin-top:1rem;font-size:0.85rem;">Back to create</p>
          <p class="toast" id="error"></p>
        </div>
      </div>
    `
    this.querySelector('#pairQrFile')?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await decodeTextFromImageFile(file)
      if (!text) return this.setError('Could not read QR code')
      ;(this.querySelector('#pairCode') as HTMLTextAreaElement).value = text
    })
    this.querySelector('#submit')!.addEventListener('click', async () => {
      const codeText = (this.querySelector('#pairCode') as HTMLTextAreaElement).value
      const pass = (this.querySelector('#pass') as HTMLInputElement).value
      if (!pass) return this.setError('Passphrase required')
      const code = decodePairingCode(codeText)
      if (!code) return this.setError('Invalid pairing code')
      const btn = this.querySelector('#submit') as HTMLButtonElement
      btn.disabled = true
      btn.textContent = 'Pairing via P2P swarm…'
      try {
        const keypair = await joinPairing(code)
        this.identity = pairIdentity(keypair, pass, storageDir())
        this.enterApp()
      } catch {
        this.setError('Pairing failed or timed out')
        btn.disabled = false
        btn.textContent = 'Pair Device'
      }
    })
    this.querySelector('#showCreate')!.addEventListener('click', () => {
      this.view = 'create'
      this.render()
    })
  }

  private async enterApp(isNewIdentity = false): Promise<void> {
    if (!this.identity) return
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
    try {
      this.session = await Session.create(this.identity, storageDir(), {
        onTyping: (m) => this.onTyping(m.roomId, m.userId, m.typing),
        onPresence: (m) => this.onPresence(m.userId, m.online, m.nickname, m.avatar),
        onReadReceipt: (m) => this.onReadReceipt(m.roomId, m.userId),
        onDirectoryChange: () => { if (this.view === 'discover') this.render() },
        onContactsChange: () => { if (this.view === 'people') this.render() },
        onBookmarksChange: () => { if (this.view === 'app') this.render() },
        onPeerConnected: () => {
          this.session?.broadcastPresence(true)
          this.scheduleRenderApp()
        },
        onPeerDisconnected: () => this.scheduleRenderApp(),
        onIncomingMessage: (roomId, message) => this.notifyIncomingMessage(roomId, message)
      })
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (msg.includes('locked') || msg.includes('FDLock')) {
        this.setError(`Storage directory is already in use by another running instance of Linda. Please close the other instance.`)
      } else {
        this.setError(`Failed to open storage: ${msg}`)
      }
      return
    }

    // Favourites used to live in localStorage, which mobile has no equivalent of; they are on
    // the bookmark now so both platforms share one flag. Carry any existing ones over rather
    // than silently dropping them, then retire the key.
    const legacyFavorites = localStorage.getItem('linda-favorites')
    if (legacyFavorites) {
      try {
        for (const roomId of JSON.parse(legacyFavorites) as string[]) {
          await this.session.setRoomFavorite(roomId, true)
        }
      } catch { /* malformed value from an old build — nothing worth recovering */ }
      localStorage.removeItem('linda-favorites')
    }

    this.nickname = this.session.getNickname()
    this.avatar = this.session.getAvatar()
    if (this.avatar) this.avatars.set(this.identity.id, this.avatar)
    for (const [uid, av] of this.session.listPeerAvatars()) {
      if (av) this.avatars.set(uid, av)
    }
    for (const c of this.session.listContacts()) {
      if (c.avatar) this.avatars.set(c.userId, c.avatar)
    }
    await this.session.reopenBookmarkedRooms()

    // Fire-and-forget: joinRoomByKey can block up to ~30s waiting on the swarm, and a
    // brand-new identity with no peers yet may not even reach it in time — fine either way,
    // don't hold up onboarding for it. Re-renders the room list on success since a join
    // doesn't otherwise emit any change event this shell listens for.
    if (isNewIdentity) {
      this.session.joinRoomByKey(DEFAULT_CHANNEL.name, DEFAULT_CHANNEL.key)
        .then(() => this.scheduleRenderApp())
        .catch(() => {})
    }

    // Pre-populate last messages from rooms
    for (const b of this.session.listBookmarks()) {
      const room = this.session.getRoom(b.id)
      if (room) {
        void (async () => {
          // Walk backward from the newest message instead of decrypting the room's whole
          // history just to find its tail.
          let lastMsg: ChatMessage | null = null
          for (let i = room.messageCount - 1; i >= 0; i--) {
            const m = await room.getMessage(i)
            if (!m.deleted) { lastMsg = m; break }
          }
          if (lastMsg) {
            this.lastMessages.set(b.id, {
              author: this.displayName(lastMsg.authorId),
              text: lastMsg.file ? `Shared an image` : lastMsg.body,
              time: lastMsg.timestamp
            })
            this.scheduleRenderApp()
          }
        })()
      }
    }

    window.addEventListener('beforeunload', () => this.session?.broadcastPresence(false))
    this.view = 'app'
    this.render()
  }

  /**
   * The Notification API's `sound` option is ignored by Chromium, so a custom tone has to be
   * played alongside the notification rather than through it. One reused element: a fresh Audio
   * per message would stack up on a burst, and rewinding gives a retrigger instead of an overlap.
   */
  private notificationAudio: HTMLAudioElement | null = null

  private playNotificationSound(): void {
    try {
      if (!this.notificationAudio) {
        this.notificationAudio = new Audio('./assets/notification.wav')
        this.notificationAudio.volume = 0.5
      }
      this.notificationAudio.currentTime = 0
      // Rejects when the window has never been interacted with (autoplay policy) — not worth
      // surfacing, the notification itself still appears.
      void this.notificationAudio.play().catch(() => {})
    } catch { /* no audio device */ }
  }

  private notifyIncomingMessage(roomId: string, message: ChatMessage): void {
    this.lastMessages.set(roomId, {
      author: this.displayName(message.authorId),
      text: message.file ? `Shared an image` : message.body,
      time: message.timestamp
    })

    if (document.hasFocus() && this.activeRoom?.id === roomId) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    this.playNotificationSound()
    const roomName = this.session?.listBookmarks().find((b) => b.id === roomId)?.name ?? 'linda-pear'
    const notification = new Notification(`${this.displayName(message.authorId)} in ${roomName}`, { body: message.body.slice(0, 200) })
    notification.onclick = () => {
      window.focus()
      this.openRoom(roomId, roomName)
    }
  }

  // --- Main App Shell ------------------------------------------------------

  /** Whether a room passes the sidebar's tab and search query. Shared by the full render and the
   * in-place filter so the two can never disagree about what should be on screen. */
  private matchesSidebarFilter(b: RoomBookmark): boolean {
    const query = this.sidebarSearchQuery.trim().toLowerCase()
    if (query && !b.name.toLowerCase().includes(query) && !b.description?.toLowerCase().includes(query)) return false
    if (this.activeFilter === 'favorites') return this.session!.isRoomFavorite(b.id)
    if (this.activeFilter === 'unread') return this.isRoomUnread(b)
    return true
  }

  /** Applies the current filter to the already-rendered room list without rebuilding the DOM. */
  private applySidebarFilter(): void {
    const bookmarks = new Map(this.session?.listBookmarks().map((b) => [b.id, b]) ?? [])
    let visible = 0
    this.querySelectorAll<HTMLElement>('.room-item').forEach((item) => {
      const bookmark = bookmarks.get(item.dataset.roomId!)
      const show = bookmark !== undefined && this.matchesSidebarFilter(bookmark)
      item.style.display = show ? '' : 'none'
      if (show) visible++
    })
    const hint = this.querySelector('.empty-room-hint') as HTMLElement | null
    if (hint) hint.style.display = visible === 0 ? '' : 'none'
  }

  private renderApp(): void {
    if (!this.session || !this.identity) return

    // renderApp() rebuilds the whole DOM below on every room event — a message, a typing
    // indicator, a read receipt (see the call-area comment further down) — which recreates
    // #body/#sidebarSearch from scratch. Without this, whatever the user was mid-typing gets
    // wiped and the input loses focus every time one of those arrives, which on an active chat
    // can happen every animation frame — the box then reads as unresponsive until things quiet
    // down long enough for a keystroke to survive a full render cycle.
    const active = document.activeElement as (HTMLInputElement | HTMLTextAreaElement) | null
    const focused = active?.id && this.contains(active)
      ? { id: active.id, value: active.value, selectionStart: active.selectionStart, selectionEnd: active.selectionEnd }
      : null

    const allBookmarks = this.session.listBookmarks()

    const filteredBookmarks = allBookmarks.filter((b) => this.matchesSidebarFilter(b))

    const peerCount = this.session.peers.size
    const userInitial = this.nickname ? this.nickname.slice(0, 1).toUpperCase() : (this.identity.id.slice(0, 1).toUpperCase() || 'S')
    const userHandle = this.nickname ? `@${this.nickname.toLowerCase().replace(/\s+/g, '')}` : `@${this.identity.id.slice(0, 8)}`
    const isLight = document.documentElement.getAttribute('data-theme') === 'light'

    this.innerHTML = `
      <div class="app-container">
        <!-- Top App Titlebar -->
        <header class="app-topbar">
          <div class="topbar-left">
            <div class="topbar-user-badge" id="topbarUserBtn" title="Open Profile">
              <div class="topbar-avatar">${this.avatar ? `<img src="${this.avatar}" />` : userInitial}</div>
              <span class="topbar-globe ${peerCount > 0 ? 'connected' : ''}" title="${peerCount} connected peer(s)">${ICONS.globe}</span>
              <span class="keet-beta-badge">BETA</span>
            </div>
          </div>
          <div class="topbar-window-controls">
            <button class="win-ctrl-btn" id="themeToggleBtn" title="Toggle Light/Dark Theme">${isLight ? ICONS.moon : ICONS.sun}</button>
          </div>
        </header>

        <!-- Main Body (Sidebar + Chat Area + Right Drawer) -->
        <div class="app-main-content">
          <!-- Sidebar -->
          <aside class="sidebar">
            <div class="sidebar-search-container">
              <div class="sidebar-search-box">
                <span class="search-icon">${ICONS.search}</span>
                <input id="sidebarSearch" placeholder="Search or join with a link" value="${escapeHtml(this.sidebarSearchQuery)}" />
              </div>
              <button class="compose-icon-btn" id="composeBtn" title="New group chat">
                ${ICONS.edit}
              </button>
            </div>

            <div class="filter-pills-row">
              <button class="filter-pill ${this.activeFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
              <button class="filter-pill ${this.activeFilter === 'unread' ? 'active' : ''}" data-filter="unread">Unread</button>
              <button class="filter-pill ${this.activeFilter === 'favorites' ? 'active' : ''}" data-filter="favorites">Favorites</button>
            </div>

            <div class="room-list">
              ${allBookmarks.map((b) => this.renderRoomListItem(b, this.matchesSidebarFilter(b))).join('')}
              <div class="empty-room-hint" style="padding:2.5rem 1rem;text-align:center;color:var(--text-muted);font-size:0.825rem;${filteredBookmarks.length ? 'display:none;' : ''}">
                <p>No conversations found.</p>
                <small>Click the compose button above to start a chat.</small>
              </div>
            </div>

            <div class="sidebar-bottom-actions">
              <button id="toggleDiscover" class="sidebar-bottom-btn">${ICONS.compass} Discover</button>
              <button id="togglePeople" class="sidebar-bottom-btn">${ICONS.users} Contacts</button>
              <button id="openJoinBtn" class="sidebar-bottom-btn">${ICONS.key} Join</button>
            </div>
          </aside>

          <!-- Main Chat Area -->
          <main class="main">
            ${this.activeRoom ? this.roomHtml() : `
              <div class="empty-state" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;color:var(--text-muted);text-align:center;padding:2.5rem;">
                <div class="empty-state-icon" style="width:68px;height:68px;border-radius:20px;background:var(--bg-panel);display:flex;align-items:center;justify-content:center;color:var(--accent);">${ICONS.chat}</div>
                <h2 style="font-size:1.35rem;font-weight:700;margin-top:0.25rem;color:var(--text);">Welcome to Linda</h2>
                <p style="color:var(--text-dim);font-size:0.875rem;max-width:360px;">Select a conversation or create a sovereign encrypted group space.</p>
              </div>
            `}
          </main>

          <!-- Right Profile Drawer -->
          <aside class="profile-drawer ${this.isProfileDrawerOpen ? 'open' : ''}" id="profileDrawer">
            <div class="drawer-header">
              <h3>Profile</h3>
              <div class="drawer-header-actions">
                <button class="drawer-action-btn" id="drawerQrBtn" title="Device Pairing QR">${ICONS.qr}</button>
                <button class="drawer-action-btn" id="drawerEditBtn" title="Profile Settings & Avatar">${ICONS.edit}</button>
                <button class="drawer-action-btn" id="closeDrawerBtn" title="Close">✕</button>
              </div>
            </div>

            <div class="drawer-profile-card">
              <div class="drawer-avatar-wrap">
                ${this.avatar ? `<img src="${this.avatar}" />` : userInitial}
              </div>
              <div class="drawer-name">${escapeHtml(this.nickname) || 'Sovereign Peer'}</div>
              <div class="drawer-handle">${userHandle}</div>
            </div>

            <div class="drawer-network-card" id="networkCardBtn" title="Swarm Network Info">
              <span class="network-accent-bar"></span>
              <div class="network-status-text">
                <strong>Stable network.</strong>
                <div style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">${peerCount} peer(s) connected</div>
              </div>
              <span style="color:var(--text-muted);font-size:0.9rem;">&gt;</span>
            </div>

            <div class="drawer-private-mode-card">
              <div class="private-mode-top">
                <span>Private Mode</span>
                <label class="keet-switch">
                  <input type="checkbox" id="privateModeToggle" ${this.privateMode ? 'checked' : ''} />
                  <span class="keet-slider"></span>
                </label>
              </div>
              <p class="private-mode-desc">Turn on to hide app content, messages, and notifications to share your app with privacy.</p>
            </div>

            <div class="drawer-menu-list">
              <div class="drawer-menu-item" id="drawerThemeToggleBtn">
                <div class="drawer-menu-item-left">
                  <span class="drawer-menu-item-icon">${isLight ? ICONS.moon : ICONS.sun}</span>
                  <span>Theme: ${isLight ? 'Light Mode' : 'Dark Mode'}</span>
                </div>
                <span class="drawer-chevron">&gt;</span>
              </div>
              <div class="drawer-menu-item" id="drawerSettingsBtn">
                <div class="drawer-menu-item-left">
                  <span class="drawer-menu-item-icon">${ICONS.settings}</span>
                  <span>Profile &amp; Avatar Gallery</span>
                </div>
                <span class="drawer-chevron">&gt;</span>
              </div>
              <div class="drawer-menu-item" id="drawerContactsBtn">
                <div class="drawer-menu-item-left">
                  <span class="drawer-menu-item-icon">${ICONS.users}</span>
                  <span>Contacts &amp; Swarm</span>
                </div>
                <span class="drawer-chevron">&gt;</span>
              </div>
              <div class="drawer-menu-item" id="drawerDiscoverBtn">
                <div class="drawer-menu-item-left">
                  <span class="drawer-menu-item-icon">${ICONS.compass}</span>
                  <span>Discover Public Rooms</span>
                </div>
                <span class="drawer-chevron">&gt;</span>
              </div>
              <div class="drawer-menu-item" id="drawerPairDeviceBtn">
                <div class="drawer-menu-item-left">
                  <span class="drawer-menu-item-icon">${ICONS.device}</span>
                  <span>Pair Another Device</span>
                </div>
                <span class="drawer-chevron">&gt;</span>
              </div>
            </div>
          </aside>
        </div>

        <!-- Active Modals (New Group Chat / Join Room) -->
        ${this.renderActiveModal()}
      </div>
    `

    this.wireSidebar()
    this.wireTopbarAndDrawer()
    if (this.activeRoom) this.wireRoom()
    if (this.activeModal !== 'none') this.wireModal()

    if (focused) {
      const el = this.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${focused.id}`)
      if (el) {
        el.value = focused.value
        el.focus()
        try { el.setSelectionRange(focused.selectionStart, focused.selectionEnd) } catch { /* input type doesn't support range selection */ }
      }
    }
  }

  /** Unread = this room has a message newer than the last time it was opened (never opened counts as the epoch). */
  private isRoomUnread(b: RoomBookmark): boolean {
    if (this.activeRoom?.id === b.id) return false
    const lastMsgTime = this.lastMessages.get(b.id)?.time
    if (!lastMsgTime) return false
    return lastMsgTime > (b.lastReadAt ?? 0)
  }

  private renderRoomListItem(b: RoomBookmark, visible = true): string {
    const active = this.activeRoom?.id === b.id
    const contact = this.session?.listContacts().find((c) => c.roomId === b.id)
    // For a DM, the room's own `avatar` is just a one-time snapshot of the contact's avatar taken
    // when the room was created (see Session.respondToContact) — it goes stale the moment the
    // other person changes their picture. Live presence-tracked avatar wins for DMs; group rooms
    // (no matching contact) keep using the room's own avatar, which is the real, current picture.
    const roomAvatar = contact
      ? (this.avatars.get(contact.userId) || this.session?.getPeerAvatar(contact.userId) || contact.avatar || b.avatar)
      : b.avatar
    // Same staleness as the avatar above: a DM's bookmark name is whatever nickname was known
    // (or wasn't — falling back to an id slice) at accept time, and never updates again. Live
    // presence wins once it's known.
    const roomName = contact
      ? (this.nicknames.get(contact.userId) || contact.nickname || b.name)
      : b.name

    const lastMsgInfo = this.lastMessages.get(b.id)
    const lastAuthor = lastMsgInfo ? `${lastMsgInfo.author}: ` : ''
    const lastSnippet = lastMsgInfo ? lastMsgInfo.text : (b.description || (contact ? 'Direct Sovereign Chat' : 'E2E Sovereign Room'))
    const timeFormatted = lastMsgInfo ? formatRelativeTime(lastMsgInfo.time) : ''
    const unread = this.isRoomUnread(b)

    return `
      <div class="room-item ${active ? 'active' : ''} ${unread ? 'unread' : ''}" data-room-id="${b.id}" data-room-name="${escapeHtml(roomName)}"${visible ? '' : ' style="display:none;"'}>
        <div class="room-item-avatar-wrap">
          ${avatarHtml(b.id, 'md', roomName, roomAvatar)}
          ${unread ? '<span class="room-item-unread-dot"></span>' : ''}
        </div>
        <div class="room-item-content">
          <div class="room-item-top-row">
            <div class="room-item-name-group">
              <span class="room-item-name">${escapeHtml(roomName)}</span>
              <span class="verified-badge" title="End-to-End Encrypted">${ICONS.verified}</span>
            </div>
            ${timeFormatted ? `<span class="room-item-time">${timeFormatted}</span>` : ''}
          </div>
          <div class="room-item-bottom-row">
            <span class="room-item-snippet">${lastAuthor ? `<strong>${escapeHtml(lastAuthor)}</strong>` : ''}${escapeHtml(lastSnippet.slice(0, 34))}</span>
            ${unread ? `<span class="unread-pill">1</span>` : ''}
          </div>
        </div>
      </div>
    `
  }

  private renderActiveModal(): string {
    if (this.activeModal === 'new-group') {
      return `
        <div class="modal-overlay" id="modalOverlay">
          <div class="keet-modal-card">
            <div class="keet-modal-header">
              <button class="modal-back-arrow" id="closeModalArrow">←</button>
              <h2>New group chat</h2>
            </div>
            <p class="keet-modal-subtitle">Create a private space to talk, share, and connect.</p>

            <div class="form-group">
              <label>Group name *</label>
              <input class="keet-input" id="newGroupName" placeholder="Give your private group a name" autofocus />
            </div>

            <div class="form-group">
              <label>Description (Optional)</label>
              <input class="keet-input" id="newGroupDesc" placeholder="Add a short description" />
            </div>

            <div class="keet-switch-row">
              <div class="switch-label-wrap">
                <span>Broadcast Feed (Read-only)</span>
                <span class="info-tooltip-icon" title="Only administrators can send messages in a broadcast feed">ⓘ</span>
              </div>
              <label class="keet-switch">
                <input type="checkbox" id="newGroupBroadcast" />
                <span class="keet-slider"></span>
              </label>
            </div>

            <div class="keet-switch-row">
              <div class="switch-label-wrap">
                <span>Publish to Discovery Directory</span>
                <span class="info-tooltip-icon" title="Allow any peer on the network to discover and request access to this room">ⓘ</span>
              </div>
              <label class="keet-switch">
                <input type="checkbox" id="newGroupPublic" />
                <span class="keet-slider"></span>
              </label>
            </div>

            <button class="keet-pill-btn active" id="createGroupSubmit">Create group chat</button>
          </div>
        </div>
      `
    }

    if (this.activeModal === 'join-room') {
      return `
        <div class="modal-overlay" id="modalOverlay">
          <div class="keet-modal-card">
            <div class="keet-modal-header">
              <button class="modal-back-arrow" id="closeModalArrow">←</button>
              <h2>Join with a link</h2>
            </div>
            <p class="keet-modal-subtitle">Enter an invite code, room key, or scan a QR code.</p>

            <div class="form-group">
              <label>Room Name (Optional)</label>
              <input class="keet-input" id="joinRoomName" placeholder="Room name" />
            </div>

            <div class="form-group">
              <label>Invite Key / URL *</label>
              <input class="keet-input" id="joinRoomKey" placeholder="Paste room key or invite link..." style="font-family:var(--font-mono);font-size:0.8rem;" autofocus />
            </div>

            <div style="text-align:center;margin:0.25rem 0;">
              <label class="file-label" style="font-size:0.8rem;cursor:pointer;color:var(--accent);display:inline-flex;align-items:center;gap:0.35rem">
                ${ICONS.qr} Scan QR invite image
                <input id="joinQrInput" type="file" accept="image/*" style="display:none" />
              </label>
            </div>

            <button class="keet-pill-btn active" id="joinRoomSubmit">Join Room</button>
          </div>
        </div>
      `
    }

    return ''
  }

  private wireTopbarAndDrawer(): void {
    this.querySelector('#themeToggleBtn')?.addEventListener('click', () => this.toggleTheme())
    this.querySelector('#drawerThemeToggleBtn')?.addEventListener('click', () => this.toggleTheme())

    this.querySelector('#topbarUserBtn')?.addEventListener('click', () => {
      this.isProfileDrawerOpen = !this.isProfileDrawerOpen
      this.renderApp()
    })

    this.querySelector('#closeDrawerBtn')?.addEventListener('click', () => {
      this.isProfileDrawerOpen = false
      this.renderApp()
    })

    this.querySelector('#drawerEditBtn')?.addEventListener('click', () => {
      this.isProfileDrawerOpen = false
      this.openProfilePage()
    })

    this.querySelector('#drawerQrBtn')?.addEventListener('click', () => {
      this.isProfileDrawerOpen = false
      this.openPairPage()
    })

    this.querySelector('#networkCardBtn')?.addEventListener('click', () => {
      this.isProfileDrawerOpen = false
      this.view = 'network-status'
      this.render()
    })

    this.querySelector('#drawerSettingsBtn')?.addEventListener('click', () => {
      this.isProfileDrawerOpen = false
      this.openProfilePage()
    })

    this.querySelector('#drawerContactsBtn')?.addEventListener('click', () => {
      this.isProfileDrawerOpen = false
      this.view = 'people'
      this.render()
    })

    this.querySelector('#drawerDiscoverBtn')?.addEventListener('click', () => {
      this.isProfileDrawerOpen = false
      this.view = 'discover'
      this.render()
    })

    this.querySelector('#drawerPairDeviceBtn')?.addEventListener('click', () => {
      this.isProfileDrawerOpen = false
      this.openPairPage()
    })

    // Private mode toggle switch
    const privateToggle = this.querySelector('#privateModeToggle') as HTMLInputElement
    privateToggle?.addEventListener('change', () => {
      this.privateMode = privateToggle.checked
      localStorage.setItem('linda-private-mode', this.privateMode ? 'true' : 'false')
      if (this.privateMode) document.body.classList.add('private-mode-active')
      else document.body.classList.remove('private-mode-active')
    })
  }

  private wireSidebar(): void {
    this.querySelectorAll<HTMLElement>('.room-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.roomId!
        const name = item.dataset.roomName!
        this.openRoom(id, name)
      })
    })

    // Search filter input
    const searchInput = this.querySelector('#sidebarSearch') as HTMLInputElement
    // Filtering only affects which room items are shown, so hide/show them in place rather than
    // rebuilding the whole app on every keystroke — which also destroyed the input mid-typing and
    // needed the focus/caret to be restored afterwards.
    searchInput?.addEventListener('input', () => {
      this.sidebarSearchQuery = searchInput.value
      this.applySidebarFilter()
    })

    // Filter pills (All, Unread, Favorites)
    this.querySelectorAll<HTMLButtonElement>('.filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        this.activeFilter = pill.dataset.filter as FilterTab
        this.renderApp()
      })
    })

    // Compose Button -> Opens "New group chat" modal
    this.querySelector('#composeBtn')?.addEventListener('click', () => {
      this.activeModal = 'new-group'
      this.renderApp()
    })

    // Join button -> Opens "Join with a link" modal
    this.querySelector('#openJoinBtn')?.addEventListener('click', () => {
      this.activeModal = 'join-room'
      this.renderApp()
    })

    this.querySelector('#toggleDiscover')?.addEventListener('click', () => { this.view = 'discover'; this.render() })
    this.querySelector('#togglePeople')?.addEventListener('click', () => { this.view = 'people'; this.render() })
  }

  private wireModal(): void {
    this.querySelector('#closeModalArrow')?.addEventListener('click', () => {
      this.activeModal = 'none'
      this.renderApp()
    })

    this.querySelector('#modalOverlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'modalOverlay') {
        this.activeModal = 'none'
        this.renderApp()
      }
    })

    // Create Group Chat Submit
    this.querySelector('#createGroupSubmit')?.addEventListener('click', async () => {
      const name = (this.querySelector('#newGroupName') as HTMLInputElement)?.value.trim()
      const desc = (this.querySelector('#newGroupDesc') as HTMLInputElement)?.value.trim() || ''
      if (!name) return alert('Please enter a group name')
      try {
        const broadcast = (this.querySelector('#newGroupBroadcast') as HTMLInputElement)?.checked ?? false
        const isPublic = (this.querySelector('#newGroupPublic') as HTMLInputElement)?.checked ?? false
        const room = await this.session!.createRoom(name, isPublic, '', desc, broadcast)
        this.activeModal = 'none'
        this.openRoom(room.id, name)
      } catch (err) {
        alert((err as Error).message || 'Failed to create room')
      }
    })

    // Join Room Submit
    this.querySelector('#joinRoomSubmit')?.addEventListener('click', async () => {
      const nameInput = (this.querySelector('#joinRoomName') as HTMLInputElement)?.value.trim()
      const rawKey = (this.querySelector('#joinRoomKey') as HTMLInputElement)?.value.trim()
      if (!rawKey) return alert('Please enter an invite key')

      // Accept either the raw bootstrapKey:inviteCode, or a full linda-pear://room?name=&key= link
      // pasted whole into the key field (e.g. shared from mobile) — auto-split it instead of
      // making the user manually copy just the key= portion out.
      const pastedInvite = decodeInvite(rawKey)
      const name = pastedInvite?.name || nameInput || 'Joined Room'
      const key = pastedInvite?.key || rawKey

      try {
        const room = await this.session!.joinRoomByKey(name, key)
        this.activeModal = 'none'
        this.openRoom(room.id, name)
      } catch {
        alert('Invalid room key or invite')
      }
    })

    this.querySelector('#joinQrInput')?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const invite = await decodeInviteFromImageFile(file)
      if (!invite) return alert('Could not read QR code')
      const nameInput = this.querySelector('#joinRoomName') as HTMLInputElement
      const keyInput = this.querySelector('#joinRoomKey') as HTMLInputElement
      if (nameInput) nameInput.value = invite.name
      if (keyInput) keyInput.value = invite.key
    })
  }

  // --- Center Chat Room View ------------------------------------------------

  private roomHtml(): string {
    const room = this.activeRoom!
    const bookmark = this.session?.listBookmarks().find((b) => b.id === room.id)
    const contact = this.session?.listContacts().find((c) => c.roomId === room.id)
    // Same DM-vs-group priority as renderRoomListItem — live avatar wins over the stale
    // creation-time snapshot for a DM.
    const roomAvatar = contact
      ? (this.avatars.get(contact.userId) || this.session?.getPeerAvatar(contact.userId) || contact.avatar || bookmark?.avatar || room.avatar)
      : (bookmark?.avatar || room.avatar)
    const roomDesc = bookmark?.description || room.description || ''
    const muted = room.isMuted(this.identity!.id)
    // `canPost` folds in the mute and the broadcast gate — the two cases where `apply()` would drop
    // the message; `writable`/`hasKey` are the local ones where it could not be sent at all.
    const canPost = room.canPost(this.identity!.id)
    const writable = room.writable && room.hasKey && canPost
    const composerBlockedReason = muted
      ? 'You are muted in this room'
      : !canPost
        ? 'Only admins can send messages in this broadcast room'
        : 'You do not have write access to this room yet'
    const memberCount = room.listMembers().length || 1
    const isFavorite = this.session!.isRoomFavorite(room.id)

    return `
      <!-- Header -->
      <header class="room-header">
        <div class="room-header-left">
          <div class="room-header-avatar" id="editRoomAvatarTrigger" title="Room settings">
            ${avatarHtml(room.id, 'md', this.activeRoomName, roomAvatar)}
          </div>
          <div class="room-header-meta">
            <div class="room-header-title-row">
              <span class="room-header-title">${escapeHtml(this.activeRoomName)}</span>
              <span class="verified-badge">${ICONS.verified}</span>
            </div>
            <div class="room-header-subtitle" id="roomMembersSubtitleTrigger" style="cursor:pointer;" title="View and manage room members">
              <span class="member-count-text">${ICONS.users} ${memberCount} member(s)</span>
              <span>•</span>
              <span style="color:var(--success);">${this.onlineUsers.size} online</span>
            </div>
          </div>
        </div>

        ${room.isVaultEnabled ? `
          <div class="room-header-tabs" style="display:inline-flex;align-items:center;gap:0.3rem;background:var(--bg-subtle);border:1px solid var(--border);border-radius:20px;padding:2px 4px;margin-left:auto;margin-right:0.75rem;">
            <button class="room-tab-pill ${this.activeRoomTab === 'chat' ? 'active' : ''}" id="roomTabChat" style="background:${this.activeRoomTab === 'chat' ? 'var(--accent)' : 'transparent'};color:${this.activeRoomTab === 'chat' ? '#fff' : 'var(--text-dim)'};border:none;padding:0.25rem 0.65rem;border-radius:16px;font-size:0.75rem;font-weight:600;cursor:pointer;">${ICONS.chatSmall} Chat</button>
            <button class="room-tab-pill ${this.activeRoomTab === 'vault' ? 'active' : ''}" id="roomTabVault" style="background:${this.activeRoomTab === 'vault' ? 'var(--accent)' : 'transparent'};color:${this.activeRoomTab === 'vault' ? '#fff' : 'var(--text-dim)'};border:none;padding:0.25rem 0.65rem;border-radius:16px;font-size:0.75rem;font-weight:600;cursor:pointer;">${ICONS.folder} Vault</button>
          </div>
        ` : ''}

        <div class="room-header-tools">
          <button class="room-header-btn" id="inviteHeaderBtn" title="Invite QR">${ICONS.qr}</button>
          <button class="room-header-btn" id="roomMembersBtn" title="Members & Administration">${ICONS.users}</button>
          <button class="room-header-btn ${isFavorite ? 'active' : ''}" id="toggleFavoriteBtn" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">${isFavorite ? ICONS.starFilled : ICONS.star}</button>
          <button class="room-header-btn" id="roomSettingsBtn" title="Room Settings">${ICONS.settings}</button>
          <button class="room-header-btn" id="openDrawerFromRoomBtn" title="Open Profile Drawer">${ICONS.user}</button>
        </div>
      </header>

      ${roomDesc ? `
        <!-- Announcement Banner -->
        <div class="pinned-banner" id="pinnedBanner">
          <div class="pinned-banner-content">
            <span class="pinned-badge">${ICONS.starFilled} Topic</span>
            <span class="pinned-text">${escapeHtml(roomDesc)}</span>
          </div>
        </div>
      ` : ''}

      ${room.isVaultEnabled && this.activeRoomTab === 'vault' ? `
        <!-- Vault View Canvas -->
        <div id="vaultContainer" class="vault-container" style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);">
          <!-- Vault Toolbar -->
          <div class="vault-toolbar" style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1.25rem;border-bottom:1px solid var(--border);background:var(--bg-subtle);">
            <div style="display:flex;align-items:center;gap:0.5rem;flex:1;max-width:320px;">
              <input type="text" id="vaultSearchInput" placeholder="Search vault files..." value="${escapeHtml(this.vaultSearchQuery)}" class="keet-input" style="padding:0.35rem 0.65rem;font-size:0.8rem;width:100%;" />
            </div>
            <div style="display:flex;align-items:center;gap:0.6rem;">
              ${writable ? `
                <label class="primary" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.45rem 0.85rem;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;">
                  <span>${ICONS.upload} Upload to Vault</span>
                  <input type="file" id="vaultFileInput" style="display:none;" />
                </label>
              ` : `<span style="font-size:0.75rem;color:var(--text-muted);">Read-only vault</span>`}
            </div>
          </div>

          <!-- Vault Files Stream -->
          <div id="vaultFilesList" style="flex:1;overflow-y:auto;padding:1.25rem;display:flex;flex-direction:column;gap:0.75rem;">
            <div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.85rem;">Loading vault files…</div>
          </div>
        </div>
      ` : `
        <!-- Hashtag notes: one pill per tag used in this room, filtering the stream below.
             Populated by renderHashtagBar, and stays empty when nobody has tagged anything. -->
        <div id="hashtagBar" class="hashtag-bar"></div>

        <!-- Messages Stream Canvas -->
        <div id="messages" class="messages"></div>
        <button id="scrollToBottomBtn" class="scroll-to-bottom-btn" title="Scroll to latest">↓</button>

        <div id="seenBy" class="status-bar"></div>
        <div id="typing" class="status-bar"></div>

        ${this.selectionMode ? `
          <div class="reply-bar">
            <div class="reply-bar-text">
              <span>${this.selectedMessageIds.size} selected</span>
            </div>
            <button class="ghost icon-sm" id="batchDeleteBtn" style="color:var(--danger);" ${this.selectedMessageIds.size === 0 ? 'disabled' : ''}>${ICONS.trash} Delete</button>
            <button class="cancel" id="cancelSelection" title="Cancel selection">✕</button>
          </div>
        ` : this.editingMessage ? `
          <div class="reply-bar">
            <div class="reply-bar-text">
              <span>Editing message</span>
            </div>
            <button class="cancel" id="cancelEdit" title="Cancel edit">✕</button>
          </div>
        ` : this.replyingTo ? `
          <div class="reply-bar">
            <div class="reply-bar-text">
              <span>Replying to <strong class="quote-author">${escapeHtml(this.displayName(this.replyingTo.authorId))}</strong>:</span>
              <span class="reply-snippet">${escapeHtml(this.replyingTo.body.slice(0, 60))}</span>
            </div>
            <button class="cancel" id="cancelReply" title="Cancel reply">✕</button>
          </div>
        ` : ''}

        <!-- Composer Bar -->
        <footer class="composer">
          ${writable ? `
            <div class="composer-capsule">
              <button class="composer-plus-btn" id="attachBtn" title="Attach file or image via Hyperdrive">+</button>
              <input id="file" type="file" style="display:none" />
              <input id="body" placeholder="Message" autofocus value="${this.editingMessage ? escapeHtml(this.editingMessage.body) : ''}" />
              <div class="composer-tools-group">
                <button class="composer-tool-btn" id="emojiQuickBtn" title="Emojis">${ICONS.smile}</button>
                <button class="composer-tool-btn" id="recordVoiceBtn" title="Record a voice message">${ICONS.mic}</button>
                <button class="composer-send-btn" id="send" title="Send">${ICONS.send}</button>
              </div>
            </div>
          ` : `
            <div class="broadcast-disabled-bar">${composerBlockedReason}</div>
          `}
        </footer>
      `}
    `
  }

  private wireRoom(): void {
    const room = this.activeRoom
    if (!room) return

    this.querySelector('#roomTabChat')?.addEventListener('click', () => {
      this.activeRoomTab = 'chat'
    this.activeHashtag = null
      this.renderApp()
    })
    this.querySelector('#roomTabVault')?.addEventListener('click', () => {
      this.activeRoomTab = 'vault'
      this.renderApp()
    })

    if (this.activeRoomTab === 'vault' && room.isVaultEnabled) {
      void this.renderVaultFiles()
      const searchInput = this.querySelector('#vaultSearchInput') as HTMLInputElement
      searchInput?.addEventListener('input', () => {
        this.vaultSearchQuery = searchInput.value
        void this.renderVaultFiles()
      })
      const vaultFileInput = this.querySelector('#vaultFileInput') as HTMLInputElement
      vaultFileInput?.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        try {
          const buffer = Buffer.from(await file.arrayBuffer())
          await this.session!.uploadToVault(room.id, file.name, buffer, file.type)
          void this.renderVaultFiles()
        } catch (err) {
          alert(`Upload error: ${(err as Error).message}`)
        }
      })
    }

    void this.renderMessages()

    // Direct DOM toggling, not scheduleRenderApp() — this fires on every scroll tick, and routing
    // that through a full DOM rebuild would fight the very scrolling it's reacting to.
    this.querySelector('#messages')?.addEventListener('scroll', () => this.updateScrollToBottomBtn())
    this.updateScrollToBottomBtn()
    this.querySelector('#scrollToBottomBtn')?.addEventListener('click', () => {
      this.querySelector('#messages')?.scrollTo({ top: this.querySelector('#messages')!.scrollHeight, behavior: 'smooth' })
    })

    this.querySelector('#editRoomAvatarTrigger')?.addEventListener('click', () => this.openRoomSettingsPage(room))
    this.querySelector('#roomSettingsBtn')?.addEventListener('click', () => this.openRoomSettingsPage(room))
    this.querySelector('#roomMembersBtn')?.addEventListener('click', () => this.openMembersPage(room))
    this.querySelector('#roomMembersSubtitleTrigger')?.addEventListener('click', () => this.openMembersPage(room))
    this.querySelector('#inviteHeaderBtn')?.addEventListener('click', () => void this.openInvitePage(room))
    this.querySelector('#openDrawerFromRoomBtn')?.addEventListener('click', () => {
      this.isProfileDrawerOpen = !this.isProfileDrawerOpen
      this.renderApp()
    })

    // Toggle favorite room
    this.querySelector('#toggleFavoriteBtn')?.addEventListener('click', () => {
      const next = !this.session!.isRoomFavorite(room.id)
      void this.session!.setRoomFavorite(room.id, next).then(() => this.renderApp())
    })

    // Composer interactions
    this.querySelector('#send')?.addEventListener('click', () => void this.sendMessage())
    const bodyInput = this.querySelector('#body') as HTMLInputElement
    bodyInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.sendMessage()
    })
    bodyInput?.addEventListener('input', () => {
      const sendBtn = this.querySelector('#send')
      if (sendBtn) {
        if (bodyInput.value.trim()) sendBtn.classList.add('active')
        else sendBtn.classList.remove('active')
      }
      this.notifyTyping()
    })

    this.querySelector('#attachBtn')?.addEventListener('click', () => {
      ;(this.querySelector('#file') as HTMLInputElement)?.click()
    })
    this.querySelector('#file')?.addEventListener('change', () => void this.sendFile())

    this.querySelector('#recordVoiceBtn')?.addEventListener('click', () => void this.toggleVoiceRecording())

    this.querySelector('#cancelReply')?.addEventListener('click', () => {
      this.replyingTo = null
      this.renderApp()
    })

    this.querySelector('#cancelEdit')?.addEventListener('click', () => {
      this.editingMessage = null
      this.renderApp()
    })

    this.querySelector('#cancelSelection')?.addEventListener('click', () => {
      this.selectionMode = false
      this.selectedMessageIds = new Set()
      this.renderApp()
    })

    this.querySelector('#batchDeleteBtn')?.addEventListener('click', () => {
      if (this.selectedMessageIds.size === 0) return
      if (!confirm(`Delete ${this.selectedMessageIds.size} message(s)? This cannot be undone.`)) return
      void (async () => {
        for (const id of this.selectedMessageIds) await room.deleteMessage(id)
        this.selectionMode = false
        this.selectedMessageIds = new Set()
        this.renderApp()
      })()
    })
  }

  private openRoom(roomId: string, name: string): void {
    const room = this.session!.getRoom(roomId)
    if (!room) return
    // Switching rooms mid-recording would otherwise leave the mic open with nowhere to send to.
    if (this.voiceRecorder) void this.stopVoiceRecording(false)
    this.view = 'app'
    this.activeRoom = room
    this.activeRoomName = name
    this.activeRoomTab = 'chat'
    this.vaultSearchQuery = ''
    this.typingPeers.clear()
    this.readBy.clear()
    this.lastReadSent = null
    this.selectionMode = false
    this.selectedMessageIds = new Set()
    this.replyingTo = null
    this.editingMessage = null
    this.session!.markRoomRead(roomId)
    for (const unsubscribe of this.activeRoomUnsubscribes) unsubscribe()
    this.activeRoomUnsubscribes = [
      room.onMessage(() => {
        this.session!.markRoomRead(roomId)
        this.scheduleRenderApp()
      }),
      room.onWritableChange(() => this.scheduleRenderApp()),
      room.onKeyChange(() => this.scheduleRenderApp()),
      room.onVaultChange(() => {
        if (this.activeRoomTab === 'vault') void this.renderVaultFiles()
        this.scheduleRenderApp()
      })
    ]
    this.renderApp()
  }

  private updateScrollToBottomBtn(): void {
    const container = this.querySelector('#messages')
    const btn = this.querySelector('#scrollToBottomBtn')
    if (!container || !btn) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    btn.classList.toggle('visible', distanceFromBottom > 200)
  }

  /**
   * One pill per hashtag used anywhere in the room, newest tag first, so a chat doubles as a
   * scratch notes board: "buy milk #todo" becomes reachable later by tapping #todo. Selecting a
   * pill narrows the stream to that tag; selecting it again clears the filter.
   */
  private renderHashtagBar(all: ChatMessage[]): void {
    const bar = this.querySelector('#hashtagBar') as HTMLElement | null
    if (!bar) return

    const counts = new Map<string, number>()
    for (const message of all) {
      if (message.deleted) continue
      for (const tag of extractHashtags(message.body)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    // A tag the room no longer contains (its only message was deleted or cleared) must not stay
    // selected, or the stream would sit empty with no pill to switch off.
    if (this.activeHashtag && !counts.has(this.activeHashtag)) this.activeHashtag = null

    if (counts.size === 0) {
      bar.innerHTML = ''
      bar.classList.remove('has-tags')
      return
    }
    bar.classList.add('has-tags')

    const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    bar.innerHTML = `
      <span class="hashtag-bar-label" title="Messages tagged with a hashtag">${ICONS.hash}</span>
      ${tags.map(([tag, count]) => `
        <button class="hashtag-pill ${this.activeHashtag === tag ? 'active' : ''}" data-hashtag-pill="${escapeHtml(tag)}">
          #${escapeHtml(tag)}<span class="hashtag-count">${count}</span>
        </button>
      `).join('')}
      ${this.activeHashtag ? `<button class="hashtag-clear" id="clearHashtag" title="Show all messages">Clear</button>` : ''}
    `

    for (const btn of bar.querySelectorAll<HTMLButtonElement>('[data-hashtag-pill]')) {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.hashtagPill!
        this.activeHashtag = this.activeHashtag === tag ? null : tag
        this.forceScrollOnNextRender = this.activeHashtag === null
        void this.renderMessages()
      })
    }
    bar.querySelector('#clearHashtag')?.addEventListener('click', () => {
      this.activeHashtag = null
      this.forceScrollOnNextRender = true
      void this.renderMessages()
    })
  }

  private async renderMessages(): Promise<void> {
    const room = this.activeRoom
    if (!room) return
    const container = this.querySelector('#messages')
    if (!container) return

    // Preserves reading position: force-scrolling on every redraw (any message, anyone's, any
    // edit/reaction) would otherwise yank someone back to the tail while they're reading history.
    // A negative distance (container not yet scrollable, e.g. this room's first render) still
    // counts as "near the bottom", so a fresh open still lands there.
    const wasNearBottom = this.forceScrollOnNextRender || container.scrollHeight - container.scrollTop - container.clientHeight < 100
    this.forceScrollOnNextRender = false

    const clearedAt = this.session!.listBookmarks().find((b) => b.id === room.id)?.clearedAt ?? 0
    const all: ChatMessage[] = []
    for await (const message of room.messages()) if (message.timestamp > clearedAt) all.push(message)
    const byId = new Map(all.map((m) => [m.id, m]))

    const filter = this.messageFilter.trim().toLowerCase()
    let visible = filter ? all.filter((m) => !m.deleted && m.body.toLowerCase().includes(filter)) : all
    if (this.activeHashtag) {
      visible = visible.filter((m) => !m.deleted && hasHashtag(m.body, this.activeHashtag!))
    }
    this.renderHashtagBar(all)

    const htmlChunks: string[] = []

    for (let i = 0; i < visible.length; i++) {
      const msg = visible[i]!
      const prev = visible[i - 1]
      const next = visible[i + 1]
      htmlChunks.push(this.renderMessageRow(msg, prev, next, byId))
    }

    container.innerHTML = htmlChunks.join('')
    if (wasNearBottom) container.scrollTop = container.scrollHeight
    this.updateScrollToBottomBtn()

    const lastVisible = visible[visible.length - 1]
    if (lastVisible) this.notifyRead(room, lastVisible.id)

    container.querySelectorAll<HTMLButtonElement>('[data-play-audio]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slot = this.querySelector(`[data-audio-slot="${btn.dataset.playAudio}"]`) as HTMLElement | null
        if (slot) void this.playAudio(btn.dataset.driveKey!, btn.dataset.path!, slot)
      })
    })

    container.querySelectorAll<HTMLButtonElement>('[data-download]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return
        // A P2P fetch from a peer that isn't already connected can take tens of seconds — without
        // this the button just sits there looking inert the whole time.
        const original = btn.textContent
        btn.disabled = true
        btn.textContent = 'Downloading…'
        void this.downloadFile(btn.dataset.download!, btn.dataset.name!, btn.dataset.path!).finally(() => {
          btn.disabled = false
          btn.textContent = original
        })
      })
    })

    // Tapping a tag inside a message is the same action as tapping its pill above.
    container.querySelectorAll<HTMLElement>('[data-hashtag]').forEach((el) => {
      el.addEventListener('click', () => {
        const tag = el.dataset.hashtag!
        this.activeHashtag = this.activeHashtag === tag ? null : tag
        this.forceScrollOnNextRender = this.activeHashtag === null
        void this.renderMessages()
      })
    })

    container.querySelectorAll<HTMLButtonElement>('[data-copy-msg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const msg = byId.get(btn.dataset.copyMsg!)
        if (msg) copyToClipboard(msg.body)
      })
    })

    container.querySelectorAll<HTMLButtonElement>('[data-reply]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.editingMessage = null
        this.replyingTo = byId.get(btn.dataset.reply!) ?? null
        this.renderApp()
      })
    })

    container.querySelectorAll<HTMLButtonElement>('[data-edit-msg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.replyingTo = null
        this.editingMessage = byId.get(btn.dataset.editMsg!) ?? null
        this.renderApp()
      })
    })

    container.querySelectorAll<HTMLButtonElement>('[data-delete-msg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this message? This cannot be undone.')) return
        void room.deleteMessage(btn.dataset.deleteMsg!)
      })
    })

    container.querySelectorAll<HTMLButtonElement>('[data-select-msg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectionMode = true
        this.selectedMessageIds = new Set([btn.dataset.selectMsg!])
        this.renderApp()
      })
    })

    container.querySelectorAll<HTMLButtonElement>('[data-toggle-select]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toggleSelect!
        if (this.selectedMessageIds.has(id)) this.selectedMessageIds.delete(id)
        else this.selectedMessageIds.add(id)
        this.renderApp()
      })
    })

    container.querySelectorAll<HTMLButtonElement>('[data-react]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void room.toggleReaction(this.identity!.id, btn.dataset.messageId!, btn.dataset.react!)
      })
    })

    container.querySelectorAll<HTMLButtonElement>('[data-reaction-pill]').forEach((btn) => {
      btn.addEventListener('click', () => {
        void room.toggleReaction(this.identity!.id, btn.dataset.messageId!, btn.dataset.reactionPill!)
      })
    })
  }

  private renderMessageRow(
    message: ChatMessage,
    prev: ChatMessage | undefined,
    next: ChatMessage | undefined,
    byId: Map<string, ChatMessage>
  ): string {
    const mine = message.authorId === this.identity!.id
    const isSameAuthor = prev !== undefined && prev.authorId === message.authorId && (Math.abs(message.timestamp - prev.timestamp) < 5 * 60 * 1000)

    let fileHtml = ''
    if (message.file) {
      const isImg = message.file.thumbnail || message.file.mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(message.file.name)
      const isAudio = !isImg && (message.file.mimeType?.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(message.file.name))
      if (isAudio) {
        // A voice message has no filename worth showing — it's a recording, not a file the
        // sender chose. An actual audio file someone attached still shows its name.
        const isVoice = /^voice-\d{4}-/.test(message.file.name)
        fileHtml = isVoice ? `
          <div class="voice-chip" data-audio-slot="${message.id}">
            <button class="voice-play-btn" data-play-audio="${message.id}" data-drive-key="${message.file.driveKey}" data-path="${message.file.path}" title="Play voice message">${ICONS.play}</button>
            <span class="voice-wave" aria-hidden="true">${'<i></i>'.repeat(14)}</span>
            <span class="voice-label">Voice message</span>
          </div>
        ` : `
          <div class="file-chip" style="display:flex;flex-direction:column;gap:0.4rem;padding:0.5rem;background:var(--bg-panel);border:1px solid var(--border-card);border-radius:4px;margin-top:0.3rem;min-width:220px;">
            <div style="font-weight:600;font-size:0.8rem;">${escapeHtml(message.file.name)}</div>
            <div data-audio-slot="${message.id}">
              <button class="primary" style="padding:0.25rem 0.6rem;font-size:0.75rem;" data-play-audio="${message.id}" data-drive-key="${message.file.driveKey}" data-path="${message.file.path}">${ICONS.play} Play</button>
            </div>
          </div>
        `
      } else if (isImg) {
        const thumbSrc = message.file.thumbnail || this.remoteImageCache.get(`${message.file.driveKey}:${message.file.path}`) || ''
        fileHtml = `
          <div class="msg-image-card">
            <div class="msg-image-thumb-wrap">
              <img src="${thumbSrc || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\' fill=\'%231f293d\'><rect width=\'100\' height=\'100\'/><text x=\'50\' y=\'55\' fill=\'%2364748b\' font-size=\'14\' text-anchor=\'middle\'>Loading…</text></svg>'}" alt="${escapeHtml(message.file.name)}" class="msg-image-thumb" />
            </div>
            <div class="msg-image-footer">
              <span class="file-name" style="font-size:0.75rem;color:var(--text-dim);">${escapeHtml(message.file.name)}</span>
              <button class="primary" style="padding:0.25rem 0.55rem;font-size:0.7rem;" data-download="${message.file.driveKey}" data-name="${message.file.name}" data-path="${message.file.path}">Download</button>
            </div>
          </div>
        `
      } else {
        fileHtml = `
          <div class="file-chip" style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;background:var(--bg-panel);border:1px solid var(--border-card);border-radius:4px;margin-top:0.3rem;">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:0.8rem;">${escapeHtml(message.file.name)}</div>
              <div style="color:var(--text-muted);font-size:0.7rem;">${formatBytes(message.file.size)} • P2P</div>
            </div>
            <button class="primary" style="padding:0.25rem 0.6rem;font-size:0.75rem;" data-download="${message.file.driveKey}" data-name="${message.file.name}" data-path="${message.file.path}">Download</button>
          </div>
        `
      }
    }

    const senderAvatar = this.avatars.get(message.authorId) || this.session?.getPeerAvatar(message.authorId) || (mine ? this.avatar : '')
    const avatar = !mine && !isSameAuthor ? avatarHtml(message.authorId, 'sm', this.displayName(message.authorId), senderAvatar) : '<div style="width:32px;flex-shrink:0;"></div>'
    const authorName = this.displayName(message.authorId)
    const timeFormatted = formatMessageTime(message.timestamp)

    const replyQuote = message.replyTo && byId.get(message.replyTo)
      ? (() => {
          const repliedMsg = byId.get(message.replyTo)!
          return `
            <div class="keet-quote-card" title="Click to view quoted message">
              <span class="quote-title">${escapeHtml(this.displayName(repliedMsg.authorId))}</span>
              <span class="quote-body">${escapeHtml(repliedMsg.body.slice(0, 60) || (repliedMsg.file ? `${ICONS.attach} ${repliedMsg.file.name}` : 'Message'))}</span>
            </div>
          `
        })()
      : ''

    const reactions = message.reactions
      ? `<div class="reactions-row">${Object.entries(message.reactions).map(([emoji, users]) => `
          <button class="reaction-pill ${users.includes(this.identity!.id) ? 'mine' : ''}" data-reaction-pill="${emoji}" data-message-id="${message.id}">${emoji} ${users.length}</button>
        `).join('')}</div>`
      : ''

    const quickEmojis = ['👍', '❤️', '🔥', '😂', '🤩', '🚀']
    const actions = message.deleted ? '' : `
      <div class="msg-actions">
        ${message.body ? `<button data-copy-msg="${message.id}" title="Copy">${ICONS.copy}</button>` : ''}
        <button data-reply="${message.id}" title="Reply">${ICONS.reply}</button>
        ${mine ? `
          <button data-edit-msg="${message.id}" title="Edit">${ICONS.edit}</button>
          <button data-delete-msg="${message.id}" title="Delete">${ICONS.trash}</button>
          <button data-select-msg="${message.id}" title="Select">${ICONS.check}</button>
        ` : ''}
        ${quickEmojis.map((e) => `<button data-react="${e}" data-message-id="${message.id}">${e}</button>`).join('')}
      </div>
    `

    const bodyText = message.body ? linkifyHashtags(linkify(escapeHtml(message.body))) : ''
    const room = this.activeRoom
    const authorIsOwner = room?.isOwner(message.authorId)
    const authorIsMod = room?.isModerator(message.authorId)
    const authorRoleBadge = authorIsOwner 
      ? `<span class="member-role-badge owner" style="font-size:0.6rem;padding:0.05rem 0.35rem;" title="Room Owner">${ICONS.crown} Owner</span>`
      : (authorIsMod ? `<span class="member-role-badge mod" style="font-size:0.6rem;padding:0.05rem 0.35rem;" title="Moderator">${ICONS.shieldSmall} Mod</span>` : '')

    const selected = this.selectedMessageIds.has(message.id)
    const selectCheckbox = this.selectionMode && mine
      ? `<button class="icon ghost icon-sm" data-toggle-select="${message.id}" title="${selected ? 'Deselect' : 'Select'}" style="align-self:center;color:${selected ? 'var(--accent)' : 'var(--text-dim)'};">${selected ? ICONS.check : '○'}</button>`
      : ''

    return `
      <div class="msg-row ${mine ? 'mine' : ''}" style="${selected ? 'opacity:0.7;' : ''}">
        ${selectCheckbox}
        ${!mine ? `<div class="msg-row-avatar">${avatar}</div>` : ''}
        <div class="msg-group">
          ${!mine && !isSameAuthor ? `
            <div class="msg-header-line">
              <span class="msg-author">${escapeHtml(authorName)}</span>
              ${authorRoleBadge}
              <span class="msg-time">${timeFormatted}</span>
            </div>
          ` : ''}
          ${actions}
          ${replyQuote}
          ${bodyText ? `<div class="bubble"><span class="bubble-text">${bodyText}</span></div>` : ''}
          ${fileHtml}
          ${reactions}
        </div>
      </div>
    `
  }

  private async sendMessage(): Promise<void> {
    const room = this.activeRoom
    if (!room) return
    const input = this.querySelector('#body') as HTMLInputElement
    const body = input?.value.trim()
    if (!body) return
    // Cleared up front, before the await: the send itself triggers a re-render (via onMessage),
    // which can land while we're still waiting and replace #body with a fresh node — clearing
    // `input` afterward would then be silently clearing a node no longer in the document, while
    // the fresh one keeps showing what was typed.
    input.value = ''
    this.notifyTyping(false)
    this.forceScrollOnNextRender = true
    try {
      if (this.editingMessage) {
        await room.editMessage(this.editingMessage.id, body)
        this.editingMessage = null
      } else {
        await room.send(this.identity!.id, body, this.replyingTo?.id)
        this.replyingTo = null
      }
    } catch (err) {
      const current = this.querySelector('#body') as HTMLInputElement | null
      if (current) current.value = body
      throw err
    }
  }

  /** Voice messages are sent as an ordinary audio attachment — the receiving side already
   * recognises audio by extension and renders a player, on both desktop and mobile. */
  private voiceRecorder: { recorder: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null = null

  private async toggleVoiceRecording(): Promise<void> {
    if (this.voiceRecorder) return this.stopVoiceRecording(true)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      alert(`Could not access the microphone: ${(err as Error).message}`)
      return
    }
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.addEventListener('dataavailable', (e) => { if (e.data.size > 0) chunks.push(e.data) })
    this.voiceRecorder = { recorder, chunks, stream }
    recorder.start()
    this.setVoiceRecordingUi(true)
  }

  private async stopVoiceRecording(send: boolean): Promise<void> {
    const active = this.voiceRecorder
    if (!active) return
    this.voiceRecorder = null
    this.setVoiceRecordingUi(false)

    const finished = new Promise<void>((resolve) => active.recorder.addEventListener('stop', () => resolve(), { once: true }))
    active.recorder.stop()
    await finished
    // Releases the OS mic indicator; without it the tab keeps holding the device open.
    for (const track of active.stream.getTracks()) track.stop()
    if (!send || active.chunks.length === 0) return

    const type = active.recorder.mimeType || 'audio/webm'
    const blob = new Blob(active.chunks, { type })
    const room = this.activeRoom
    if (!room || !this.session) return
    try {
      const buffer = b4a.from(new Uint8Array(await blob.arrayBuffer()))
      const fileStore = await this.session.fileStore()
      // The extension has to match what the players sniff for, and MediaRecorder's mimeType
      // carries a codecs= suffix that would otherwise end up in the filename.
      const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'
      const name = `voice-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`
      const drivePath = `/${room.id}/${Date.now()}-${name}`
      const shared = await fileStore.addBuffer(drivePath, buffer)
      this.forceScrollOnNextRender = true
      await room.sendFile(this.identity!.id, {
        driveKey: b4a.toString(fileStore.key, 'hex'),
        path: shared.path,
        size: shared.size,
        name,
        mimeType: type.split(';')[0]
      })
    } catch (err) {
      alert(`Could not send the voice message: ${(err as Error).message}`)
    }
  }

  private setVoiceRecordingUi(active: boolean): void {
    const btn = this.querySelector('#recordVoiceBtn') as HTMLButtonElement | null
    if (!btn) return
    btn.innerHTML = active ? ICONS.stopCircle : ICONS.mic
    btn.title = active ? 'Stop and send voice message' : 'Record a voice message'
    btn.classList.toggle('recording', active)
    const input = this.querySelector('#body') as HTMLInputElement | null
    if (input) input.placeholder = active ? 'Recording… click again to send' : 'Message'
  }

  private async sendFile(): Promise<void> {
    const room = this.activeRoom
    if (!room || !this.session) return
    const input = this.querySelector('#file') as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    const buffer = b4a.from(new Uint8Array(await file.arrayBuffer()))
    const fileStore = await this.session.fileStore()
    const drivePath = `/${room.id}/${Date.now()}-${file.name}`
    const shared = await fileStore.addBuffer(drivePath, buffer)

    let thumbnail: string | undefined = undefined
    if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name)) {
      try { thumbnail = await resizeImageToDataUrl(file, 360) } catch { /* ignore */ }
    }

    this.forceScrollOnNextRender = true
    await room.sendFile(this.identity!.id, {
      driveKey: b4a.toString(fileStore.key, 'hex'),
      path: shared.path,
      size: shared.size,
      name: file.name,
      mimeType: file.type,
      thumbnail
    })
    input.value = ''
  }

  /** Swallows the reason a fetch failed — only for callers with nowhere useful to show it
   * (inline image previews, audio slots). Anything the user explicitly asked for should call
   * `session.downloadFile` directly so the diagnostic in the error survives. */
  private async fetchFileBlob(driveKeyHex: string, drivePath: string): Promise<Blob | null> {
    if (!this.session) return null
    try {
      const buffer = await this.session.downloadFile(driveKeyHex, drivePath)
      return buffer ? new Blob([new Uint8Array(buffer)]) : null
    } catch {
      return null
    }
  }

  private async downloadFile(driveKeyHex: string, name: string, drivePath: string): Promise<void> {
    if (!this.session) return
    try {
      const buffer = await this.session.downloadFile(driveKeyHex, drivePath)
      if (!buffer) return alert('File not found on peer')
      triggerBlobDownload(new Blob([new Uint8Array(buffer)]), name)
    } catch (err) {
      alert(`Download failed: ${(err as Error).message}`)
    }
  }

  private async downloadVaultFile(filePath: string, name: string, driveKey?: string): Promise<void> {
    if (!this.activeRoom || !this.session) return
    try {
      const buffer = await this.session.downloadFromVault(this.activeRoom.id, filePath, driveKey)
      if (!buffer) return alert('File not yet available on connected peers')
      triggerBlobDownload(new Blob([new Uint8Array(buffer)]), name)
    } catch (err) {
      alert(`Download error: ${(err as Error).message}`)
    }
  }

  private async renderVaultFiles(): Promise<void> {
    const room = this.activeRoom
    if (!room || !this.session) return
    const container = this.querySelector('#vaultFilesList')
    if (!container) return

    const files = await room.listVaultFiles()
    const filter = this.vaultSearchQuery.trim().toLowerCase()
    const visible = filter ? files.filter((f) => f.name.toLowerCase().includes(filter)) : files

    if (visible.length === 0) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem 1rem;color:var(--text-muted);text-align:center;">
          <div style="margin-bottom:0.75rem;color:var(--text-muted);">${ICONS.folderLarge}</div>
          <div style="font-size:1.05rem;font-weight:600;color:var(--text);margin-bottom:0.25rem;">${filter ? 'No matching files found' : 'P2P Room Vault is Empty'}</div>
          <div style="font-size:0.8rem;max-width:340px;">${filter ? 'Try a different search query.' : 'Upload documents, videos, audio, or archives to share directly with the swarm.'}</div>
        </div>
      `
      return
    }

    const html = visible.map((f) => {
      const isMine = f.authorId === this.identity!.id
      const canDelete = isMine || room.isOwner(this.identity!.id) || room.isModerator(this.identity!.id)
      const isImg = f.mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name)
      const isAudio = f.mimeType?.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(f.name)
      const isVideo = f.mimeType?.startsWith('video/') || /\.(mp4|webm|mkv|mov)$/i.test(f.name)
      const isZip = /\.(zip|tar|gz|7z|rar)$/i.test(f.name)
      const isPdf = /\.pdf$/i.test(f.name) || f.mimeType === 'application/pdf'
      const icon = isImg ? ICONS.image : isAudio ? ICONS.music : isVideo ? ICONS.video : isZip ? ICONS.archive : isPdf ? ICONS.file : ICONS.file
      const timeStr = new Date(f.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

      return `
        <div class="vault-file-card" style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 1rem;background:var(--bg-panel);border:1px solid var(--border-card);border-radius:8px;gap:1rem;">
          <div style="display:flex;align-items:center;gap:0.75rem;min-width:0;flex:1;">
            <div style="flex-shrink:0;display:flex;color:var(--text-muted);">${icon}</div>
            <div style="min-width:0;flex:1;">
              <div style="font-weight:600;font-size:0.85rem;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
              <div style="font-size:0.7rem;color:var(--text-muted);display:flex;gap:0.6rem;align-items:center;margin-top:0.15rem;">
                <span>${formatBytes(f.size)}</span>
                <span>•</span>
                <span>By ${escapeHtml(this.displayName(f.authorId))}</span>
                <span>•</span>
                <span>${timeStr}</span>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
            <button class="primary" style="padding:0.3rem 0.65rem;font-size:0.75rem;display:inline-flex;align-items:center;gap:0.3rem;" data-vault-download="${escapeHtml(f.path)}" data-vault-name="${escapeHtml(f.name)}" data-vault-drive-key="${escapeHtml(f.driveKey ?? '')}">${ICONS.download} Download</button>
            ${canDelete ? `
              <button class="ghost" style="color:var(--danger);padding:0.3rem 0.5rem;font-size:0.75rem;" data-vault-delete="${escapeHtml(f.path)}" data-vault-name="${escapeHtml(f.name)}" title="Delete file from vault">${ICONS.trash}</button>
            ` : ''}
          </div>
        </div>
      `
    }).join('')

    container.innerHTML = html

    container.querySelectorAll<HTMLButtonElement>('[data-vault-download]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return
        const original = btn.textContent
        btn.disabled = true
        btn.textContent = 'Downloading…'
        void this.downloadVaultFile(btn.dataset.vaultDownload!, btn.dataset.vaultName!, btn.dataset.vaultDriveKey || undefined).finally(() => {
          btn.disabled = false
          btn.textContent = original
        })
      })
    })

    container.querySelectorAll<HTMLButtonElement>('[data-vault-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Delete "${btn.dataset.vaultName || 'this file'}" from Room Vault?`)) return
        try {
          await this.session!.deleteFromVault(room.id, btn.dataset.vaultDelete!)
          void this.renderVaultFiles()
        } catch (err) {
          alert(`Delete error: ${(err as Error).message}`)
        }
      })
    })
  }

  private async playAudio(driveKeyHex: string, drivePath: string, slot: HTMLElement): Promise<void> {
    slot.innerHTML = `<span style="font-size:0.7rem;color:var(--text-muted);">Loading…</span>`
    const blob = await this.fetchFileBlob(driveKeyHex, drivePath)
    if (!blob) { slot.innerHTML = `<span style="font-size:0.7rem;color:var(--danger);">Unavailable</span>`; return }
    const url = URL.createObjectURL(blob)
    slot.innerHTML = ''
    const audio = document.createElement('audio')
    audio.controls = true
    audio.autoplay = true
    audio.src = url
    audio.style.height = '32px'
    audio.addEventListener('emptied', () => URL.revokeObjectURL(url))
    slot.appendChild(audio)
  }

  // --- calls & presence ----------------------------------------------------

  private typingTimer: ReturnType<typeof setTimeout> | null = null

  private notifyTyping(typing = true): void {
    const room = this.activeRoom
    if (!room || !this.session) return
    for (const peer of this.session.peers.values()) peer.rpc.sendTyping({ roomId: room.id, userId: this.identity!.id, typing })
    if (this.typingTimer) clearTimeout(this.typingTimer)
    if (typing) this.typingTimer = setTimeout(() => this.notifyTyping(false), 3000)
  }

  private onTyping(roomId: string, userId: string, typing: boolean): void {
    if (!this.activeRoom || this.activeRoom.id !== roomId) return
    if (typing) this.typingPeers.add(userId)
    else this.typingPeers.delete(userId)
    const el = this.querySelector('#typing')
    if (el) el.textContent = this.typingPeers.size > 0 ? `${[...this.typingPeers].map((id) => this.displayName(id)).join(', ')} typing…` : ''
  }

  /** Broadcasts "I've read up to this message" to every connected peer — called after each render with the newest visible message id. Idempotent per message id so re-renders (reactions, edits) don't resend. */
  private notifyRead(room: Room, messageId: string): void {
    if (!this.session || this.lastReadSent === messageId) return
    this.lastReadSent = messageId
    for (const peer of this.session.peers.values()) peer.rpc.sendReadReceipt({ roomId: room.id, userId: this.identity!.id, messageId })
  }

  private onReadReceipt(roomId: string, userId: string): void {
    if (!this.activeRoom || this.activeRoom.id !== roomId) return
    this.readBy.add(userId)
    const el = this.querySelector('#seenBy')
    if (el) el.textContent = this.readBy.size > 0 ? `Seen by ${[...this.readBy].map((id) => this.displayName(id)).join(', ')}` : ''
  }

  private onPresence(userId: string, online: boolean, nickname: string, avatar?: string): void {
    if (online) this.onlineUsers.add(userId)
    else this.onlineUsers.delete(userId)
    if (nickname) this.nicknames.set(userId, nickname)
    if (avatar) this.avatars.set(userId, avatar)
    this.scheduleRenderApp()
  }

  private displayName(userId: string): string {
    return this.nicknames.get(userId) || userId.slice(0, 8)
  }

  // --- Sub-Pages (Profile, Room Settings, Contacts, Discover, Pair) --------

  private pageTopbarHtml(title: string): string {
    return `
      <div class="page-view-topbar">
        <button class="win-ctrl-btn" id="pageBack" title="Back" style="font-size:1.1rem;">←</button>
        <h1>${escapeHtml(title)}</h1>
      </div>
    `
  }

  private wirePageBack(): void {
    this.querySelector('#pageBack')?.addEventListener('click', () => { this.view = 'app'; this.render() })
  }

  private openProfilePage(): void {
    if (!this.identity || !this.session) return
    this.profileWorkingAvatar = this.avatar
    this.profileWorkingNickname = this.nickname
    this.profileShowSecretKey = false
    this.profileMnemonicWords = null
    this.profileMnemonicError = ''
    this.view = 'profile'
    this.render()
  }

  private renderProfilePage(): void {
    if (!this.identity || !this.session) { this.view = 'app'; return this.render() }
    const workingAvatar = this.profileWorkingAvatar
    const workingNickname = this.profileWorkingNickname
    const showSecretKey = this.profileShowSecretKey

    this.innerHTML = `
      <div class="page-view">
        ${this.pageTopbarHtml('Profile & Avatar Gallery')}
        <div class="page-view-body">
          <div class="modal">
            <div style="display:flex;align-items:center;gap:1.25rem;padding:1.15rem;background:var(--bg-subtle);border-radius:12px;border:1px solid var(--border);">
              ${avatarHtml(this.identity.id, 'xl', workingNickname, workingAvatar)}
              <div style="min-width:0;">
                <div style="font-size:1.2rem;font-weight:700;color:var(--text);">${escapeHtml(workingNickname) || 'Sovereign Peer'}</div>
                <div style="font-size:0.75rem;color:var(--accent);font-family:var(--font-mono);">${this.identity.id.slice(0, 16)}…</div>
              </div>
            </div>

            <div class="form-group">
              <label>Display Nickname</label>
              <input id="profileNicknameInput" value="${escapeHtml(workingNickname)}" placeholder="Your nickname..." maxlength="32" class="keet-input" />
            </div>

            <div class="form-group">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <label>Profile Picture</label>
                ${workingAvatar ? `<button id="resetAvatarBtn" class="ghost" style="color:var(--danger);font-size:0.75rem;padding:0.2rem 0.5rem;">${ICONS.trash} Reset</button>` : ''}
              </div>
              <label class="upload-avatar-trigger" style="margin-top:0.25rem;">
                ${ICONS.camera}
                <span>Upload Custom Picture</span>
                <input id="avatarFileInput" type="file" accept="image/*" style="display:none;" />
              </label>
            </div>

            <div class="form-group">
              <label>Curated Avatar Gallery</label>
              <div class="preset-avatars-grid">
                ${PRESET_AVATARS.map((p) => `
                  <button class="preset-avatar-card ${workingAvatar === p.svg ? 'active' : ''}" data-preset-id="${p.id}" title="${p.name}">
                    <img src="${p.svg}" alt="${p.name}" />
                    <span class="preset-title">${p.name}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="form-group">
              <label>Sovereign Keys</label>
              <div class="key-display-row">
                <code>${this.identity.id}</code>
                <button class="icon ghost icon-sm" id="copyPublicKey" title="Copy public key">${ICONS.copy}</button>
              </div>
              <div class="key-display-row" style="margin-top:0.3rem;">
                <code>${showSecretKey ? b4a.toString(this.identity.secretKey, 'hex') : '•'.repeat(64)}</code>
                <button class="icon ghost icon-sm" id="toggleSecretKey" title="${showSecretKey ? 'Hide' : 'Reveal'} secret key">${showSecretKey ? ICONS.eyeOff : ICONS.eye}</button>
                ${showSecretKey ? `<button class="icon ghost icon-sm" id="copySecretKey" title="Copy secret key">${ICONS.copy}</button>` : ''}
              </div>
            </div>

            <div class="form-group">
              <label>Recovery Phrase</label>
              ${this.profileMnemonicWords ? `
                <div class="mnemonic-container">
                  <div class="mnemonic-grid">
                    ${this.profileMnemonicWords.split(' ').map((w, i) => `<div class="mnemonic-word"><span>${i + 1}</span>${escapeHtml(w)}</div>`).join('')}
                  </div>
                </div>
                <button class="icon ghost icon-sm" id="hideMnemonicBtn" style="margin-top:0.3rem;">${ICONS.eyeOff} Hide</button>
              ` : `
                <div style="display:flex;gap:0.4rem;">
                  <input id="mnemonicPassInput" type="password" placeholder="Passphrase to reveal" style="flex:1;" />
                  <button class="ghost icon-sm" id="revealMnemonicBtn">${ICONS.eye} Reveal</button>
                </div>
                ${this.profileMnemonicError ? `<p style="color:var(--danger);font-size:0.75rem;margin-top:0.25rem;">${escapeHtml(this.profileMnemonicError)}</p>` : ''}
              `}
            </div>

            <div class="form-group">
              <label>Network</label>
              <button id="openNetworkStatus" class="ghost" style="display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;">
                <span>Network Status</span>
                <span>›</span>
              </button>
            </div>

            <div class="form-group">
              <label>About</label>
              <a href="https://github.com/scobru/linda" target="_blank" rel="noopener" class="ghost" style="display:block;width:fit-content;font-size:0.8rem;text-decoration:none;color:var(--text);padding:0.25rem 0.5rem;">
                linda-pear is open source — view on GitHub ${ICONS.externalLink}
              </a>
            </div>

            <div style="border:1px solid var(--danger-dim);border-radius:8px;padding:0.75rem;display:flex;flex-direction:column;gap:0.4rem;">
              <span style="font-size:0.75rem;color:var(--danger);font-weight:600;">Danger Zone</span>
              <p style="font-size:0.75rem;color:var(--text-dim);">Permanently wipe local keys and storage on this machine.</p>
              <button id="resetDeviceBtn" class="ghost" style="color:var(--danger);width:fit-content;font-size:0.75rem;padding:0.25rem 0.5rem;">${ICONS.trash} Reset This Device</button>
            </div>

            <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
              <button id="cancelProfileBtn" class="ghost" style="flex:1;">Cancel</button>
              <button id="saveProfileBtn" class="primary" style="flex:1;">Save Changes</button>
            </div>
          </div>
        </div>
      </div>
    `
    this.wirePageBack()
    this.querySelector('#cancelProfileBtn')?.addEventListener('click', () => { this.view = 'app'; this.render() })
    this.querySelector('#resetDeviceBtn')?.addEventListener('click', () => void this.resetDevice())

    this.querySelector('#openNetworkStatus')?.addEventListener('click', () => { this.view = 'network-status'; this.render() })
    this.querySelector('#copyPublicKey')?.addEventListener('click', () => copyToClipboard(this.identity!.id))
    this.querySelector('#copySecretKey')?.addEventListener('click', () => copyToClipboard(b4a.toString(this.identity!.secretKey, 'hex')))
    this.querySelector('#toggleSecretKey')?.addEventListener('click', () => {
      this.profileShowSecretKey = !this.profileShowSecretKey
      this.renderProfilePage()
    })

    this.querySelector('#revealMnemonicBtn')?.addEventListener('click', () => {
      const pass = (this.querySelector('#mnemonicPassInput') as HTMLInputElement)?.value ?? ''
      try {
        const mnemonic = revealMnemonic(pass, storageDir())
        this.profileMnemonicWords = mnemonic
        this.profileMnemonicError = mnemonic ? '' : 'No recovery phrase for this identity (added via device pairing)'
      } catch {
        this.profileMnemonicError = 'Wrong passphrase'
      }
      this.renderProfilePage()
    })
    this.querySelector('#hideMnemonicBtn')?.addEventListener('click', () => {
      this.profileMnemonicWords = null
      this.renderProfilePage()
    })

    this.querySelector('#resetAvatarBtn')?.addEventListener('click', () => {
      this.profileWorkingAvatar = ''
      this.renderProfilePage()
    })

    const fileInput = this.querySelector('#avatarFileInput') as HTMLInputElement
    fileInput?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        this.profileWorkingAvatar = await resizeImageToDataUrl(file, 128)
        this.renderProfilePage()
      } catch {
        alert('Could not load or resize image')
      }
    })

    this.querySelectorAll<HTMLButtonElement>('.preset-avatar-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = PRESET_AVATARS.find((p) => p.id === btn.dataset.presetId)
        if (preset) {
          this.profileWorkingAvatar = preset.svg
          this.renderProfilePage()
        }
      })
    })

    this.querySelector('#saveProfileBtn')?.addEventListener('click', async () => {
      const finalNick = (this.querySelector('#profileNicknameInput') as HTMLInputElement).value.trim()
      this.nickname = finalNick
      this.avatar = this.profileWorkingAvatar
      await this.session!.setNickname(finalNick)
      await this.session!.setAvatar(this.profileWorkingAvatar)
      this.view = 'app'
      this.render()
    })
  }

  private renderNetworkStatusPage(): void {
    if (!this.session) { this.view = 'app'; return this.render() }
    const status = this.session.getNetworkStatus()
    this.innerHTML = `
      <div class="page-view">
        ${this.pageTopbarHtml('Network Status')}
        <div class="page-view-body">
          <div class="modal">
            ${status.firewalled ? `
              <div style="border:1px solid var(--warning-dim, var(--danger-dim));border-radius:8px;padding:0.75rem;font-size:0.8rem;color:var(--text-dim);">
                Heads up! You're behind a restrictive network (firewall/NAT) — this can prevent direct connections to peers on similarly restrictive networks, e.g. some mobile carriers.
              </div>
            ` : ''}
            <div class="form-group">
              <label>Total Connections</label>
              <div class="key-display-row"><code>${status.connections}</code></div>
            </div>
            <div class="form-group">
              <label>External Address</label>
              <div class="key-display-row">
                <code>${escapeHtml(status.host ?? 'unknown')}:${status.port}</code>
              </div>
            </div>
            <div class="form-group">
              <label>Public Key</label>
              <div class="key-display-row">
                <code>${status.publicKey}</code>
                <button class="icon ghost icon-sm" id="copyNetPublicKey" title="Copy public key">${ICONS.copy}</button>
              </div>
            </div>
            <button id="copyNetworkInfo" class="ghost" style="width:100%;">${ICONS.copy} Copy info for troubleshooting</button>
          </div>
        </div>
      </div>
    `
    this.wirePageBack()
    this.querySelector('#copyNetPublicKey')?.addEventListener('click', () => copyToClipboard(status.publicKey))
    this.querySelector('#copyNetworkInfo')?.addEventListener('click', () => copyToClipboard(
      `connections: ${status.connections}\naddress: ${status.host ?? 'unknown'}:${status.port}\nfirewalled: ${status.firewalled}\npublicKey: ${status.publicKey}`
    ))
  }

  private openRoomSettingsPage(room: Room): void {
    if (!this.session) return
    const currentBookmark = this.session.listBookmarks().find((b) => b.id === room.id)
    this.roomSettingsWorkingName = currentBookmark?.name || this.activeRoomName
    this.roomSettingsWorkingAvatar = currentBookmark?.avatar || room.avatar || ''
    this.roomSettingsWorkingDesc = currentBookmark?.description || room.description || ''
    this.view = 'room-settings'
    this.render()
  }

  private renderRoomSettingsPage(): void {
    const room = this.activeRoom
    if (!room || !this.session) { this.view = 'app'; return this.render() }

    this.innerHTML = `
      <div class="page-view">
        ${this.pageTopbarHtml('Room Customization')}
        <div class="page-view-body">
          <div class="modal">
            <div class="form-group">
              <label>Room Name</label>
              <input id="roomNameInput" value="${escapeHtml(this.roomSettingsWorkingName)}" class="keet-input" />
            </div>
            <div class="form-group">
              <label>Room Topic / Description</label>
              <input id="roomDescInput" value="${escapeHtml(this.roomSettingsWorkingDesc)}" class="keet-input" />
            </div>

            <div class="form-group">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <label>Room Icon</label>
                ${this.roomSettingsWorkingAvatar ? `<button id="resetRoomAvatarBtn" class="ghost" style="color:var(--danger);font-size:0.75rem;padding:0.2rem 0.5rem;">${ICONS.trash} Reset</button>` : ''}
              </div>
              <label class="upload-avatar-trigger" style="margin-top:0.25rem;">
                ${ICONS.camera}
                <span>Upload Custom Room Picture</span>
                <input id="roomAvatarFileInput" type="file" accept="image/*" style="display:none;" />
              </label>
            </div>

            <div class="form-group">
              <label>Room Preset Gallery</label>
              <div class="preset-avatars-grid">
                ${ROOM_PRESETS.map((p) => `
                  <button class="preset-avatar-card ${this.roomSettingsWorkingAvatar === p.svg ? 'active' : ''}" data-preset-id="${p.id}" title="${p.name}">
                    <img src="${p.svg}" alt="${p.name}" />
                    <span class="preset-title">${p.name}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            ${room.isOwner(this.identity!.id) ? `
              <div class="keet-switch-row">
                <div class="switch-label-wrap">
                  <span>Broadcast Feed (Read-only)</span>
                  <span class="info-tooltip-icon" title="Only administrators can send messages in a broadcast feed">&#9432;</span>
                </div>
                <label class="keet-switch">
                  <input type="checkbox" id="roomBroadcastToggle" ${room.isBroadcast ? 'checked' : ''} />
                  <span class="keet-slider"></span>
                </label>
              </div>
            ` : ''}

            ${room.isOwner(this.identity!.id) || room.isModerator(this.identity!.id) ? `
              <div class="keet-switch-row" style="margin-top:0.5rem;">
                <div class="switch-label-wrap">
                  <span>P2P Room Vault (Shared Drive)</span>
                  <span class="info-tooltip-icon" title="Enables a decentralized collaborative drive for all room members">&#9432;</span>
                </div>
                <label class="keet-switch">
                  <input type="checkbox" id="roomVaultToggle" ${room.isVaultEnabled ? 'checked' : ''} />
                  <span class="keet-slider"></span>
                </label>
              </div>
            ` : ''}

            <div class="form-group" style="margin-top:0.25rem;">
              <button id="manageMembersFromSettingsBtn" class="ghost" type="button" style="width:100%;padding:0.65rem 0.85rem;border:1px solid var(--border);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:space-between;background:var(--bg-subtle);">
                <span style="display:flex;align-items:center;gap:0.5rem;font-weight:600;color:var(--text);font-size:0.85rem;">
                  ${ICONS.users} Room Members &amp; Administration
                </span>
                <span style="color:var(--accent);font-weight:700;font-size:0.8rem;">${room.listMembers().length} members &rarr;</span>
              </button>
            </div>

            <div class="form-group" style="margin-top:0.25rem;">
              <button id="clearHistoryBtn" class="ghost" type="button" style="width:100%;padding:0.65rem 0.85rem;border:1px solid var(--danger);border-radius:var(--radius-md);color:var(--danger);">
                ${ICONS.trash} Clear Chat History
              </button>
            </div>

            <div class="form-group" style="margin-top:0.25rem;">
              <button id="leaveRoomBtn" class="ghost" type="button" style="width:100%;padding:0.65rem 0.85rem;border:1px solid var(--danger);border-radius:var(--radius-md);color:var(--danger);">
                ${ICONS.trash} Leave Room
              </button>
            </div>

            <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
              <button id="cancelRoomBtn" class="ghost" style="flex:1;">Cancel</button>
              <button id="saveRoomBtn" class="primary" style="flex:1;">Save Settings</button>
            </div>
          </div>
        </div>
      </div>
    `
    this.wirePageBack()
    this.querySelector('#manageMembersFromSettingsBtn')?.addEventListener('click', () => this.openMembersPage(room))
    this.querySelector('#cancelRoomBtn')?.addEventListener('click', () => { this.view = 'app'; this.render() })

    this.querySelector('#clearHistoryBtn')?.addEventListener('click', () => {
      if (!confirm(`Clear all messages in "${this.activeRoomName}"? This only clears your own view — other members keep their copy, and history reappears if you rejoin from a backup.`)) return
      this.session!.clearRoomHistory(room.id)
      this.view = 'app'
      this.forceScrollOnNextRender = true
      this.render()
    })

    this.querySelector('#leaveRoomBtn')?.addEventListener('click', () => {
      if (!confirm(`Leave "${this.activeRoomName}"? You'll need a new invite to rejoin.`)) return
      void (async () => {
        await this.session!.deleteRoom(room.id)
        for (const unsubscribe of this.activeRoomUnsubscribes) unsubscribe()
        this.activeRoomUnsubscribes = []
        this.activeRoom = null
        this.view = 'app'
        this.render()
      })()
    })

    this.querySelector('#resetRoomAvatarBtn')?.addEventListener('click', () => {
      this.roomSettingsWorkingAvatar = ''
      this.renderRoomSettingsPage()
    })

    const fileInput = this.querySelector('#roomAvatarFileInput') as HTMLInputElement
    fileInput?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        this.roomSettingsWorkingAvatar = await resizeImageToDataUrl(file, 128)
        this.renderRoomSettingsPage()
      } catch {
        alert('Could not load room image')
      }
    })

    this.querySelectorAll<HTMLButtonElement>('.preset-avatar-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = ROOM_PRESETS.find((p) => p.id === btn.dataset.presetId)
        if (preset) {
          this.roomSettingsWorkingAvatar = preset.svg
          this.renderRoomSettingsPage()
        }
      })
    })

    const broadcastToggle = this.querySelector('#roomBroadcastToggle') as HTMLInputElement | null
    broadcastToggle?.addEventListener('change', async () => {
      try {
        await this.session!.setRoomBroadcast(room.id, broadcastToggle.checked)
      } catch (err) {
        broadcastToggle.checked = !broadcastToggle.checked
        alert((err as Error).message || 'Could not change broadcast mode')
      }
    })

    const vaultToggle = this.querySelector('#roomVaultToggle') as HTMLInputElement | null
    vaultToggle?.addEventListener('change', async () => {
      try {
        await this.session!.setRoomVault(room.id, vaultToggle.checked)
      } catch (err) {
        vaultToggle.checked = !vaultToggle.checked
        alert((err as Error).message || 'Could not toggle room vault')
      }
    })

    this.querySelector('#saveRoomBtn')?.addEventListener('click', async () => {
      const finalName = (this.querySelector('#roomNameInput') as HTMLInputElement).value.trim() || this.activeRoomName
      const finalDesc = (this.querySelector('#roomDescInput') as HTMLInputElement).value.trim()
      this.activeRoomName = finalName
      await this.session!.updateRoomMeta(room.id, {
        name: finalName,
        avatar: this.roomSettingsWorkingAvatar,
        description: finalDesc
      })
      this.view = 'app'
      this.render()
    })
  }

  private renderDiscoverPage(): void {
    if (!this.session) return
    const rooms = this.session.listDirectory()
    this.innerHTML = `
      <div class="page-view">
        ${this.pageTopbarHtml('Discover Public Rooms')}
        <div class="page-view-body wide">
          <div class="modal">
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              ${rooms.map((r) => `
                <div class="room-item" style="padding:0.6rem;background:var(--bg-subtle);border-radius:10px;border:1px solid var(--border);">
                  ${avatarHtml(r.roomId, 'md', r.name, r.avatar)}
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;color:var(--text);">${escapeHtml(r.name)}</div>
                    <div style="color:var(--text-dim);font-size:0.75rem;">${escapeHtml(r.description || 'Public P2P space')}</div>
                  </div>
                  <button data-join-dir-key="${r.bootstrapKey}:${r.inviteCode}" data-join-dir-name="${escapeHtml(r.name)}" class="primary" style="padding:0.3rem 0.75rem;font-size:0.8rem;">Join</button>
                  <button data-hide-dir-id="${r.roomId}" class="ghost" style="padding:0.3rem 0.5rem;font-size:0.8rem;color:var(--text-muted);" title="Hide from this device">${ICONS.trash}</button>
                </div>
              `).join('') || '<p style="text-align:center;color:var(--text-muted);padding:1.5rem;">No public rooms discovered yet on local swarm.</p>'}
            </div>
          </div>
        </div>
      </div>
    `
    this.wirePageBack()
    this.querySelectorAll<HTMLButtonElement>('[data-join-dir-key]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const room = await this.session!.joinRoomByKey(btn.dataset.joinDirName!, btn.dataset.joinDirKey!)
        this.openRoom(room.id, btn.dataset.joinDirName!)
      })
    })
    this.querySelectorAll<HTMLButtonElement>('[data-hide-dir-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.session!.removeFromDirectory(btn.dataset.hideDirId!)
        this.renderDiscoverPage()
      })
    })
  }

  private renderPeoplePage(): void {
    if (!this.session) return
    const contacts = this.session.listContacts()
    this.innerHTML = `
      <div class="page-view">
        ${this.pageTopbarHtml('Contacts & Peers')}
        <div class="page-view-body wide">
          <div class="modal">
            <h3 style="font-size:0.9rem;color:var(--text-dim);margin-bottom:0.5rem;">Contacts (${contacts.length})</h3>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              ${contacts.map((c) => {
                // `c.nickname` is a one-time snapshot from when the contact request was sent/accepted
                // — blank if the other side hadn't set one yet, and never updated after. Live
                // presence wins once it's known (same fallback chain as the sidebar's DM rooms).
                const name = this.nicknames.get(c.userId) || c.nickname || c.userId.slice(0, 8)
                return `
                <div class="room-item" style="padding:0.6rem;background:var(--bg-subtle);border-radius:10px;border:1px solid var(--border);">
                  ${avatarHtml(c.userId, 'md', name, c.avatar)}
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;color:var(--text);">${escapeHtml(name)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">${c.status === 'incoming' ? 'wants to connect' : c.status === 'outgoing' ? 'request sent' : ''}</div>
                  </div>
                  ${c.status === 'incoming' ? `
                    <button data-accept-contact-id="${c.userId}" class="ghost" style="color:var(--success);">✓ Accept</button>
                    <button data-decline-contact-id="${c.userId}" class="ghost" style="color:var(--danger);">✕ Decline</button>
                  ` : ''}
                  ${c.status === 'outgoing' ? '<span style="font-size:0.75rem;color:var(--text-muted);padding:0.25rem 0.5rem;">pending</span>' : ''}
                  ${c.roomId ? `<button data-open-contact-room="${c.roomId}" data-open-contact-name="${escapeHtml(name)}" class="ghost">Chat</button>` : ''}
                  <button data-remove-contact-id="${c.userId}" data-remove-contact-name="${escapeHtml(name)}" class="ghost" style="color:var(--danger);" title="Remove contact">${ICONS.trash}</button>
                </div>
              `
              }).join('') || '<p style="text-align:center;color:var(--text-muted);padding:1rem;">No contacts yet.</p>'}
            </div>
          </div>
        </div>
      </div>
    `
    this.wirePageBack()
    this.querySelectorAll<HTMLButtonElement>('[data-open-contact-room]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openRoom(btn.dataset.openContactRoom!, btn.dataset.openContactName!)
      })
    })
    this.querySelectorAll<HTMLButtonElement>('[data-accept-contact-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await this.session!.respondToContact(btn.dataset.acceptContactId!, true)
        } catch (err) {
          alert(`Could not accept request: ${(err as Error).message}`)
        }
        this.renderPeoplePage()
      })
    })
    this.querySelectorAll<HTMLButtonElement>('[data-decline-contact-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await this.session!.respondToContact(btn.dataset.declineContactId!, false)
        } catch (err) {
          alert(`Could not decline request: ${(err as Error).message}`)
        }
        this.renderPeoplePage()
      })
    })
    this.querySelectorAll<HTMLButtonElement>('[data-remove-contact-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Remove ${btn.dataset.removeContactName} from contacts?`)) return
        await this.session!.deleteContact(btn.dataset.removeContactId!)
        this.renderPeoplePage()
      })
    })
  }

  private openPairPage(): void {
    this.pairStep = 'starting'
    this.pairDataUrl = ''
    this.pairStop = null
    this.view = 'pair-device'
    this.render()

    this.pairStop = hostPairing(
      this.identity!,
      async (code) => {
        this.pairDataUrl = await textToDataUrl(code)
        this.pairStep = 'code'
        if (this.view === 'pair-device') this.renderPairDevicePage()
      },
      () => {
        this.pairStep = 'done'
        if (this.view === 'pair-device') this.renderPairDevicePage()
      }
    )
  }

  private renderPairDevicePage(): void {
    const closeAndStop = () => { this.pairStop?.(); this.pairStop = null; this.view = 'app'; this.render() }

    this.innerHTML = `
      <div class="page-view">
        ${this.pageTopbarHtml('Device Pairing')}
        <div class="page-view-body">
          <div class="modal" style="text-align:center;">
            ${this.pairDataUrl ? `<img src="${this.pairDataUrl}" width="220" height="220" style="margin:0 auto;background:#fff;padding:8px;border-radius:12px;" />` : '<p>Generating code…</p>'}
            <p style="font-size:0.85rem;color:var(--text-dim);">Scan this QR on your secondary device to link your sovereign account.</p>
            <button id="closePairBtn" class="primary" style="margin-top:1rem;">Done</button>
          </div>
        </div>
      </div>
    `
    this.wirePageBack()
    this.querySelector('#closePairBtn')?.addEventListener('click', closeAndStop)
  }

  private openMembersPage(room: Room): void {
    if (!this.session) return
    this.activeRoom = room
    this.view = 'members'
    this.render()
  }

  private renderMembersPage(): void {
    const room = this.activeRoom
    if (!room || !this.session) { this.view = 'app'; return this.render() }
    const members = room.listMembers()
    const myId = this.identity!.id
    const iAmOwner = room.isOwner(myId)
    const iCanModerate = room.canModerate(myId)
    const currentBookmark = this.session.listBookmarks().find((b) => b.id === room.id)
    const roomAvatar = currentBookmark?.avatar || room.avatar || ''
    const contactIds = new Set(this.session.listContacts().map((c) => c.userId))

    this.innerHTML = `
      <div class="page-view">
        ${this.pageTopbarHtml('Members & Administration')}
        <div class="page-view-body wide">
          <div class="modal" style="max-width:680px;margin:0 auto;display:flex;flex-direction:column;gap:1rem;">
            <!-- Room Overview Card -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:var(--bg-subtle);border:1px solid var(--border);border-radius:var(--radius-md);">
              <div style="display:flex;align-items:center;gap:0.75rem;">
                ${avatarHtml(room.id, 'md', this.activeRoomName, roomAvatar)}
                <div>
                  <div style="font-weight:700;font-size:0.95rem;color:var(--text);">${escapeHtml(this.activeRoomName)}</div>
                  <div style="font-size:0.75rem;color:var(--text-dim);">
                    <span>${ICONS.users} ${members.length} Member${members.length !== 1 ? 's' : ''}</span>
                    <span> • </span>
                    <span style="color:var(--success);">${this.onlineUsers.size} Online</span>
                  </div>
                </div>
              </div>
              <button id="inviteFromMembersBtn" class="primary" style="padding:0.35rem 0.75rem;font-size:0.8rem;display:inline-flex;align-items:center;gap:0.35rem;">
                ${ICONS.qr} Invite Link
              </button>
            </div>

            <!-- Moderation notice banner -->
            ${iAmOwner ? `
              <div style="padding:0.5rem 0.75rem;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:var(--radius-sm);font-size:0.75rem;color:#f59e0b;display:flex;align-items:center;gap:0.4rem;">
                <span>${ICONS.crown}</span>
                <span>You are the <strong>Owner</strong> of this room. You have full control over roles, membership, and encryption keys.</span>
              </div>
            ` : (iCanModerate ? `
              <div style="padding:0.5rem 0.75rem;background:rgba(2,132,199,0.1);border:1px solid rgba(2,132,199,0.3);border-radius:var(--radius-sm);font-size:0.75rem;color:#38bdf8;display:flex;align-items:center;gap:0.4rem;">
                <span>${ICONS.shieldSmall}</span>
                <span>You are a <strong>Moderator</strong>. You can kick, ban, and mute members in this room.</span>
              </div>
            ` : '')}

            <!-- Members List Header -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.25rem;">
              <h3 style="font-size:0.85rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;">Members List (${members.length})</h3>
            </div>

            <!-- Member Cards -->
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              ${members.map((m) => {
                const isMe = m.identityId === myId
                const isOwner = room.isOwner(m.identityId)
                const isMod = room.isModerator(m.identityId)
                const isMuted = room.isMuted(m.identityId)
                const isBanned = room.isBanned(m.identityId)
                const name = this.displayName(m.identityId)
                const userAvatar = this.avatars.get(m.identityId) || this.session?.getPeerAvatar(m.identityId) || (isMe ? this.avatar : '')
                const canModerateThis = !isMe && (iAmOwner || (iCanModerate && !isOwner && !isMod))

                return `
                  <div class="member-card">
                    ${avatarHtml(m.identityId, 'md', name, userAvatar)}
                    <div class="member-card-info">
                      <div class="member-card-title-row">
                        <span class="member-card-name">${escapeHtml(name)}</span>
                        ${isMe ? '<span style="color:var(--accent);font-size:0.75rem;font-weight:600;">(you)</span>' : ''}
                        ${isOwner ? `<span class="member-role-badge owner">${ICONS.crown} Owner</span>` : (isMod ? `<span class="member-role-badge mod">${ICONS.shieldSmall} Mod</span>` : '<span class="member-role-badge member">Member</span>')}
                        ${isMuted ? `<span class="member-role-badge muted">${ICONS.volumeOff} Muted</span>` : ''}
                        ${isBanned ? `<span class="member-role-badge banned">${ICONS.ban} Banned</span>` : ''}
                      </div>
                      <div class="member-card-id" title="${m.identityId}">${m.identityId.slice(0, 16)}…${m.identityId.slice(-6)}</div>
                    </div>

                    ${!isMe && !contactIds.has(m.identityId) ? `
                      <button class="ghost" style="font-size:0.75rem;padding:0.25rem 0.5rem;color:var(--accent);" data-add-contact-id="${m.identityId}" data-add-contact-name="${escapeHtml(name)}" title="Send contact request">${ICONS.userPlus} Add contact</button>
                    ` : ''}

                    ${canModerateThis ? `
                      <div class="member-actions-row">
                        ${iAmOwner ? (isMod ? `
                          <button class="ghost" style="font-size:0.75rem;padding:0.25rem 0.5rem;color:var(--warning);" data-demote-id="${m.identityId}" title="Demote from Moderator">Demote</button>
                        ` : `
                          <button class="ghost" style="font-size:0.75rem;padding:0.25rem 0.5rem;color:var(--success);" data-promote-id="${m.identityId}" title="Promote to Moderator">${ICONS.shieldSmall} Promote</button>
                        `) : ''}

                        ${isMuted ? `
                          <button class="ghost" style="font-size:0.75rem;padding:0.25rem 0.5rem;color:var(--success);" data-unmute-id="${m.identityId}" title="Unmute user in this room">${ICONS.volumeOn} Unmute</button>
                        ` : `
                          <button class="ghost" style="font-size:0.75rem;padding:0.25rem 0.5rem;color:var(--warning);" data-mute-id="${m.identityId}" title="Mute user in this room">${ICONS.volumeOff} Mute</button>
                        `}

                        <button class="ghost" style="font-size:0.75rem;padding:0.25rem 0.5rem;color:var(--danger);" data-kick-writer="${m.writerKey}" data-kick-name="${escapeHtml(name)}" title="Kick member and rotate room encryption keys">${ICONS.kick} Kick</button>

                        ${isBanned ? `
                          <button class="ghost" style="font-size:0.75rem;padding:0.25rem 0.5rem;color:var(--success);" data-unban-id="${m.identityId}" title="Unban member">Unban</button>
                        ` : `
                          <button class="ghost" style="font-size:0.75rem;padding:0.25rem 0.5rem;color:var(--danger);" data-ban-writer="${m.writerKey}" data-ban-id="${m.identityId}" data-ban-name="${escapeHtml(name)}" title="Kick and ban user permanently">${ICONS.ban} Ban</button>
                        `}
                      </div>
                    ` : ''}
                  </div>
                `
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `
    this.wirePageBack()

    this.querySelector('#inviteFromMembersBtn')?.addEventListener('click', () => {
      void this.openInvitePage(room)
    })

    this.querySelectorAll<HTMLButtonElement>('[data-add-contact-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const ok = await this.session!.sendContactRequest(btn.dataset.addContactId!, btn.dataset.addContactName!)
          if (!ok) alert('Could not send request: member is not currently connected.')
        } catch (err) {
          alert(`Could not send request: ${(err as Error).message}`)
        }
        this.renderMembersPage()
      })
    })

    this.querySelectorAll<HTMLButtonElement>('[data-promote-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await this.session!.promoteToModerator(room.id, btn.dataset.promoteId!)
        this.renderMembersPage()
      })
    })

    this.querySelectorAll<HTMLButtonElement>('[data-demote-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await this.session!.demoteModerator(room.id, btn.dataset.demoteId!)
        this.renderMembersPage()
      })
    })

    this.querySelectorAll<HTMLButtonElement>('[data-mute-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await this.session!.muteMember(room.id, btn.dataset.muteId!)
        this.renderMembersPage()
      })
    })

    this.querySelectorAll<HTMLButtonElement>('[data-unmute-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await this.session!.unmuteMember(room.id, btn.dataset.unmuteId!)
        this.renderMembersPage()
      })
    })

    this.querySelectorAll<HTMLButtonElement>('[data-kick-writer]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.kickName || 'this member'
        if (confirm(`Kick ${name} from the room? Their write access will be revoked and content keys rotated.`)) {
          await this.session!.kickMember(room.id, btn.dataset.kickWriter!)
          this.renderMembersPage()
        }
      })
    })

    this.querySelectorAll<HTMLButtonElement>('[data-ban-writer]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.banName || 'this member'
        if (confirm(`Ban ${name} from the room? They will be kicked and blocked from rejoining.`)) {
          await this.session!.banMember(room.id, btn.dataset.banWriter!, btn.dataset.banId!)
          this.renderMembersPage()
        }
      })
    })

    this.querySelectorAll<HTMLButtonElement>('[data-unban-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await this.session!.unbanMember(room.id, btn.dataset.unbanId!)
        this.renderMembersPage()
      })
    })
  }

  private async openInvitePage(room: Room): Promise<void> {
    this.inviteQrDataUrl = await inviteToDataUrl({ name: this.activeRoomName, key: this.session!.inviteLinkFor(room.id) })
    this.view = 'invite'
    this.render()
  }

  private renderInvitePage(): void {
    const room = this.activeRoom
    if (!room || !this.session) { this.view = 'app'; return this.render() }

    this.innerHTML = `
      <div class="page-view">
        ${this.pageTopbarHtml('Invite to Room')}
        <div class="page-view-body">
          <div class="modal" style="text-align:center;">
            <img src="${this.inviteQrDataUrl}" width="220" height="220" style="margin:0 auto;background:#fff;padding:8px;border-radius:12px;" />
            <p style="font-size:0.85rem;color:var(--text-dim);margin:0.5rem 0;">Share this QR code or copy the invite link below</p>
            <button id="copyInviteBtn" class="primary" style="margin:0.5rem auto;">${ICONS.copy} Copy Link</button>
          </div>
        </div>
      </div>
    `
    this.wirePageBack()
    this.querySelector('#copyInviteBtn')?.addEventListener('click', () => {
      // Same linda-pear://room?... format the QR code and mobile's share sheet use — both are
      // parsed identically by decodeInvite either way, but matching formats avoids the "these
      // look like two different links" confusion when comparing a copied link across devices.
      copyToClipboard(encodeInvite({ name: this.activeRoomName, key: this.session!.inviteLinkFor(room.id) }))
      alert('Invite link copied to clipboard!')
    })
  }

  private async resetDevice(): Promise<void> {
    if (!confirm('Reset this device? This permanently deletes your local identity, rooms and contacts here.')) return
    try { await this.session?.close() } catch { /* ignore */ }
    const fs = require('node:fs')
    fs.rmSync(storageDir(), { recursive: true, force: true })
    location.reload()
  }

  private setError(message: string): void {
    const el = this.querySelector('#error')
    if (el) el.textContent = message
  }
}

/** Revoking the blob: URL right after `a.click()` (the previous code) races Electron/Chromium's
 * async download pipeline — for anything but a tiny file the URL can go dead before the browser
 * has actually read it, silently dropping the download with no error anywhere. Delaying the
 * revoke gives it time to finish; appending the anchor to the DOM matches what triggers reliably
 * across Chromium versions (a detached anchor's click is not guaranteed to be honored). */
function triggerBlobDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * `navigator.clipboard` is the wrong tool inside Electron: it is gated on a permission grant
 * *and* refuses outright with "Document is not focused" whenever the window isn't the focused
 * one — which includes the common case of DevTools holding focus. Electron's clipboard has
 * neither restriction and is bridged in as `window.lindaClipboard` by the preload script.
 * Falls back to the web API so the UI still works if this is ever run in a plain browser.
 */
function copyToClipboard(text: string): void {
  const bridged = (window as unknown as { lindaClipboard?: { writeText(t: string): void } }).lindaClipboard
  if (bridged) return bridged.writeText(text)
  void navigator.clipboard?.writeText(text).catch(() => { /* nothing better to offer */ })
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

function linkify(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;">${url}</a>`)
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatMessageTime(timestamp: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return ''
  const diffSec = Math.floor((Date.now() - timestamp) / 1000)
  if (diffSec < 60) return 'now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d`
  const diffMonths = Math.floor(diffDays / 30)
  return `${diffMonths}mo`
}

customElements.define('app-shell', AppShell)
