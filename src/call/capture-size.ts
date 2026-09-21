// ---------------------------------------------------------------------------
// What resolution a call captures video at, and how a platform picks one.
//
// The desktop has always constrained this: it draws the camera into a 480x360 canvas before the
// encoder ever sees it. The phone never did. `takePictureAsync` with no `pictureSize` set on the
// `CameraView` captures at the sensor's full resolution — twelve megapixels and up on an ordinary
// phone — and then, because the orientation fix-up runs (`skipProcessing` is off, so the image
// comes back the right way round), that full frame is decoded to a bitmap, rotated and re-encoded.
// A 4000x3000 ARGB bitmap is 48 MB. Twice a second, on a default heap, in a process that is also
// holding a Hypercore session and rendering the other side's video.
//
// So the phone's video calls did not crash because of anything in the call: they crashed because
// every frame allocated more than the heap could give back in time. Capturing near the size the
// frame is actually used at makes the same decode cost about a megabyte, and costs nothing in
// quality — the receiving end scales into a phone-sized view either way.
// ---------------------------------------------------------------------------

/** What both platforms capture call video at. The desktop's canvas has used it all along. */
export const CALL_CAPTURE_WIDTH = 480
export const CALL_CAPTURE_HEIGHT = 360

/** Parsed form of one entry in Android's `getAvailablePictureSizesAsync()` list, e.g. `"640x480"`. */
export interface CaptureSize {
  label: string
  width: number
  height: number
}

export function parseCaptureSize(label: string): CaptureSize | null {
  const match = /^(\d+)x(\d+)$/.exec(label.trim())
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return { label, width, height }
}

/**
 * The smallest offered size that still covers what a call frame needs.
 *
 * "Smallest that is big enough" rather than "closest to the target": the cost this exists to
 * control is the decode, which scales with pixel count, so overshooting is what hurts. A device
 * that offers nothing at or above the target gets its largest — that is a device whose sensor is
 * smaller than the target, where nothing is being saved and the best available picture is the
 * right answer.
 *
 * Returns null when the list is empty or unparseable, which means leave `pictureSize` unset and
 * let the platform choose. That is the old behaviour, and it is the only honest answer when the
 * device has told us nothing to choose from.
 */
export function pickCaptureSize(
  available: readonly string[],
  targetWidth = CALL_CAPTURE_WIDTH,
  targetHeight = CALL_CAPTURE_HEIGHT
): string | null {
  const sizes: CaptureSize[] = []
  for (const label of available) {
    const parsed = parseCaptureSize(label)
    if (parsed) sizes.push(parsed)
  }
  if (sizes.length === 0) return null

  const area = (size: CaptureSize): number => size.width * size.height

  // A landscape 640x480 and a portrait 480x640 both cover a 480x360 frame; which orientation the
  // device reports is not something to be picky about, so both dimensions are compared against the
  // target's smaller and larger side rather than against width and height by name.
  const needShort = Math.min(targetWidth, targetHeight)
  const needLong = Math.max(targetWidth, targetHeight)
  const covers = (size: CaptureSize): boolean =>
    Math.min(size.width, size.height) >= needShort && Math.max(size.width, size.height) >= needLong

  const covering = sizes.filter(covers)
  if (covering.length > 0) {
    return covering.reduce((best, size) => (area(size) < area(best) ? size : best)).label
  }
  return sizes.reduce((best, size) => (area(size) > area(best) ? size : best)).label
}
