/**
 * How an avatar is prepared, wherever it is picked.
 *
 * Both shells crop the middle out, scale that square down and never upscale — a 40px icon blown up
 * to 128 is a bigger, blurrier copy of itself. What they did not share were the numbers: the
 * dimension was a default parameter here and a named constant there, and the JPEG quality was 0.85
 * on the desktop against 0.7 on the phone, so the same picture became a different file depending
 * on which device you chose it from.
 *
 * Both have to stay comfortably under `ProfileStore.MAX_AVATAR_BYTES` (64 KB), because a copy of
 * this rides along in every presence message and sits in every member's bookmark. At 128px square
 * they do, with room to spare — the cap is there to stop someone pasting a photo in, not to price
 * these two settings.
 */
export const AVATAR_MAX_DIM = 128
export const AVATAR_JPEG_QUALITY = 0.85

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
