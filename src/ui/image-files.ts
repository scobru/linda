// Image and video helpers that need a browser: a square avatar from a picked image, and a poster
// frame from a picked video.
import { AVATAR_JPEG_QUALITY, AVATAR_MAX_DIM } from '../util/avatar.js'

export function resizeImageToDataUrl(file: File, maxDim = AVATAR_MAX_DIM): Promise<string> {
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
        resolve(canvas.toDataURL('image/jpeg', AVATAR_JPEG_QUALITY))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/**
 * First frame of a video as a JPEG data URL, for the poster shown in chat.
 *
 * Seeks a little way in rather than using frame zero: the opening frame of a phone recording is
 * very often black, which makes every video look like a broken image.
 */
export function videoPosterDataUrl(file: File, maxWidth = 360): Promise<string | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    const done = (poster?: string) => {
      URL.revokeObjectURL(url)
      resolve(poster)
    }
    video.preload = 'metadata'
    video.muted = true
    video.onerror = () => done()
    video.onloadeddata = () => {
      // A codec the browser cannot decode still fires loadeddata with no dimensions.
      if (!video.videoWidth) return done()
      video.currentTime = Math.min(1, (video.duration || 1) / 2)
    }
    video.onseeked = () => {
      const scale = Math.min(1, maxWidth / video.videoWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return done()
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      done(canvas.toDataURL('image/jpeg', 0.7))
    }
    video.src = url
  })
}
