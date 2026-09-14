// ---------------------------------------------------------------------------
// What kind of thing an attachment is, decided once.
//
// This lived in five places — the desktop chat card, the desktop files tab, the mobile chat
// bubble, the mobile files tab, and the desktop upload path — as five regular expressions that
// had drifted apart. The chat views accepted `.aac` and `.opus` as audio and the files tabs did
// not, so the same file offered a play button in one tab and a generic document icon in the
// other; `.m4v` and `.avi` disagreed the same way for video, and `.bmp` for images.
//
// The lists here are the union of what those five sites accepted, which is why adopting this
// module widens what the files tabs recognise rather than narrowing anything.
// ---------------------------------------------------------------------------

export type AttachmentKind = 'image' | 'audio' | 'video' | 'archive' | 'pdf' | 'other'

export interface AttachmentLike {
  name: string
  mimeType?: string
  /** Present on images and on videos the sender could poster — never decides `video` vs `image`. */
  thumbnail?: string
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp)$/i
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi)$/i
const ARCHIVE_EXT = /\.(zip|tar|gz|7z|rar)$/i
const PDF_EXT = /\.pdf$/i

/**
 * Classifies an attachment by MIME type first, falling back to its extension.
 *
 * Video is tested before image because a video may carry a poster `thumbnail`, and the poster must
 * not turn the clip into a picture — that ordering was already what the desktop chat card did, and
 * is the one behaviour of the five sites that mattered and agreed.
 */
export function attachmentKind(file: AttachmentLike): AttachmentKind {
  const { name, mimeType } = file

  if (mimeType?.startsWith('video/') || VIDEO_EXT.test(name)) return 'video'
  if (mimeType?.startsWith('image/') || IMAGE_EXT.test(name)) return 'image'
  if (mimeType?.startsWith('audio/') || AUDIO_EXT.test(name)) return 'audio'
  if (mimeType === 'application/pdf' || PDF_EXT.test(name)) return 'pdf'
  if (ARCHIVE_EXT.test(name)) return 'archive'

  // A thumbnail with nothing else to go on means the sender produced a picture of it, which only
  // the image and video paths do — and video has already been ruled out above.
  if (file.thumbnail) return 'image'

  return 'other'
}

export function isImage(file: AttachmentLike): boolean {
  return attachmentKind(file) === 'image'
}

export function isAudio(file: AttachmentLike): boolean {
  return attachmentKind(file) === 'audio'
}

export function isVideo(file: AttachmentLike): boolean {
  return attachmentKind(file) === 'video'
}

// ── Voice messages ──────────────────────────────────────────────────────────
//
// A voice message is an ordinary audio attachment; what marks it is the name both composers
// generate. The producers and the detector were four uncoordinated sites held together by a
// comment, so the convention lives here with the function that writes it.

const VOICE_NAME = /^voice-\d{4}-/

/** True for a recording made by either composer. Assumes the attachment is already audio. */
export function isVoiceMessage(file: { name: string }): boolean {
  return VOICE_NAME.test(file.name)
}

/**
 * The name a composer gives a recording: `voice-<ISO timestamp with : and . replaced>.<ext>`.
 * `isVoiceMessage` is the reader of exactly this, so the two cannot drift apart.
 */
export function voiceMessageName(extension: string, at: Date = new Date()): string {
  return `voice-${at.toISOString().replace(/[:.]/g, '-')}.${extension}`
}
