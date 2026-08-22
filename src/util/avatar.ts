export const AVATAR_COLORS = [
  '#22c55e', '#00c2cb', '#3b82f6', '#8b5cf6',
  '#f59e0b', '#ec4899', '#10b981', '#06b6d4'
]

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
