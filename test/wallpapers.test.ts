import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WALLPAPERS, wallpaperById, wallpaperDataUrl, wallpaperPatternSvg, wallpaperInk, DEFAULT_WALLPAPER
} from '../src/ui/wallpapers.js'

const PATTERNED = WALLPAPERS.filter((w) => w.shapes)

test('the default wallpaper exists and draws nothing', () => {
  const plain = wallpaperById(DEFAULT_WALLPAPER)
  assert.equal(plain.id, DEFAULT_WALLPAPER)
  assert.equal(plain.shapes, null)
  assert.equal(wallpaperDataUrl(DEFAULT_WALLPAPER, 'red'), null)
  assert.equal(wallpaperPatternSvg(DEFAULT_WALLPAPER, 'red'), null)
})

test('an unknown id falls back rather than throwing', () => {
  // Ids are persisted per device, so a downgrade or a removed pattern must not break the chat.
  assert.equal(wallpaperById('no-such-wallpaper').id, WALLPAPERS[0]!.id)
  assert.equal(wallpaperDataUrl('no-such-wallpaper', 'red'), null)
})

test('every pattern renders a tile data URL carrying the ink colour', () => {
  for (const w of PATTERNED) {
    const url = wallpaperDataUrl(w.id, 'rgba(1,2,3,0.5)')
    assert.ok(url, `${w.id} produced no url`)
    assert.ok(url.startsWith('data:image/svg+xml;utf8,'), `${w.id} is not an svg data url`)
    const svg = decodeURIComponent(url)
    assert.ok(svg.includes('rgba(1,2,3,0.5)'), `${w.id} ignored the ink colour`)
    assert.ok(svg.includes(`width="${w.size}" height="${w.size}"`), `${w.id} tile is not its declared size`)
  }
})

test('every pattern also renders as a self-tiling <pattern>, which is what mobile draws', () => {
  // React Native cannot render an SVG through Image, so mobile takes this path instead of the
  // data URL. A pattern that only worked in the CSS form would silently show nothing there.
  for (const w of PATTERNED) {
    const svg = wallpaperPatternSvg(w.id, 'rgba(1,2,3,0.5)')
    assert.ok(svg, `${w.id} produced no pattern svg`)
    assert.ok(svg.includes('patternUnits="userSpaceOnUse"'), `${w.id} tile would not repeat`)
    assert.ok(svg.includes('fill="url(#wp)"'), `${w.id} never paints the pattern`)
    assert.ok(svg.includes('rgba(1,2,3,0.5)'), `${w.id} ignored the ink colour`)
    assert.ok(svg.includes(`width="${w.size}" height="${w.size}"`), `${w.id} tile is not its declared size`)
  }
})

test('ink is visible against both themes', () => {
  // The first version used 0.06/0.07 alpha, which read as no pattern at all on either theme.
  for (const isDark of [true, false]) {
    const alpha = Number(wallpaperInk(isDark).match(/,([\d.]+)\)$/)![1])
    assert.ok(alpha >= 0.1, `alpha ${alpha} is too faint to see`)
    assert.ok(alpha <= 0.3, `alpha ${alpha} would overpower the messages`)
  }
  assert.notEqual(wallpaperInk(true), wallpaperInk(false))
})

test('ink uses rgba, not hex', () => {
  // A `#` inside a CSS `url(...)` data URL would truncate it — encodeURIComponent leaves it alone.
  for (const isDark of [true, false]) {
    assert.ok(!wallpaperInk(isDark).includes('#'))
  }
})

test('ids are unique', () => {
  const ids = WALLPAPERS.map((w) => w.id)
  assert.equal(new Set(ids).size, ids.length)
})
