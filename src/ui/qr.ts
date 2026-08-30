import QRCode from 'qrcode'
import jsQR from 'jsqr'

// Re-export platform-agnostic invite logic from shared module
export { encodeInvite, decodeInvite, DEFAULT_CHANNEL, DEFAULT_WELCOME_CHANNEL, DEFAULT_CHANNELS, type RoomInvite } from './qr-core.js'
import { encodeInvite, type RoomInvite } from './qr-core.js'

export async function textToDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 240 })
}

export async function decodeTextFromImageFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const code = jsQR(imageData.data, imageData.width, imageData.height)
  return code?.data ?? null
}

export async function inviteToDataUrl(invite: RoomInvite): Promise<string> {
  return textToDataUrl(encodeInvite(invite))
}

export async function decodeInviteFromImageFile(file: File): Promise<RoomInvite | null> {
  const text = await decodeTextFromImageFile(file)
  return text ? (await import('./qr-core.js')).decodeInvite(text) : null
}
