// Small pure HTML and text helpers for the message and room views.
import { avatarColor, avatarInitials } from '../util/avatar.js'

/** Next to the name of a peer that has announced itself as a bot. A claim it makes about itself, like its nickname. */
export const BOT_BADGE = '<span class="member-role-badge bot" style="font-size:0.6rem;padding:0.05rem 0.35rem;" title="This account says it is a bot">BOT</span>'

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

export function linkify(escaped: string): string {
  // Any `scheme://...`, not just http(s) — chat also carries linda-pear:// contact/room invite
  // links, which were rendered as inert text.
  // color:currentColor (not --accent) — the "mine" bubble background in light mode is the same
  // indigo as --accent, so an accent-colored link on it was invisible.
  return escaped.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s<]+/gi, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:currentColor;text-decoration:underline;">${url}</a>`)
}


export function formatMessageTime(timestamp: number): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function avatarHtml(id: string, size: 'sm' | 'md' | 'lg' | 'xl' | '' = '', label?: string, avatarUrl?: string): string {
  const bg = avatarColor(id || 'default')
  const text = avatarInitials(label || id)
  const escapedLabel = escapeHtml(label || id)
  if (avatarUrl && avatarUrl.trim()) {
    return `<div class="avatar ${size} has-img" title="${escapedLabel}"><img src="${avatarUrl}" alt="${escapedLabel}" /></div>`
  }
  return `<div class="avatar ${size}" style="background:${bg}" title="${escapedLabel}">${text}</div>`
}

// --- SVG Icons -------------------------------------------------------------
