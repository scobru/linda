import * as ImageManipulator from 'expo-image-manipulator'

/** What both platforms settle on for an avatar: small enough that a copy can ride along in a
 * presence message and sit in every member's bookmark. */
export const AVATAR_MAX_DIM = 128

/**
 * Squares off an avatar the way the desktop's `resizeImageToDataUrl` does: crop the middle out
 * first, then scale that square down.
 *
 * Resizing straight to `{ width, height }` looks like it does the same job and does not — Expo
 * honours both dimensions exactly, so a photo that is not already square arrives squashed into
 * the box. Cropping first is also why nothing here has to trust the picker: `DocumentPicker`
 * assets carry no width or height, so the dimensions come from a no-op manipulation of the file
 * itself.
 *
 * Never upscales, for the same reason the desktop doesn't: a 40px icon blown up to 128 is a
 * bigger, blurrier copy of itself.
 */
export async function squareImageToDataUri(uri: string, maxDim = AVATAR_MAX_DIM): Promise<string> {
  const source = await ImageManipulator.manipulateAsync(uri, [])
  const side = Math.min(source.width, source.height)
  const target = Math.min(side, maxDim)

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [
      {
        crop: {
          originX: Math.round((source.width - side) / 2),
          originY: Math.round((source.height - side) / 2),
          width: side,
          height: side
        }
      },
      { resize: { width: target, height: target } }
    ],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  )
  if (!result.base64) throw new Error('Could not process that image')
  return `data:image/jpeg;base64,${result.base64}`
}
