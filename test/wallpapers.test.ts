import test from 'node:test'
import assert from 'node:assert/strict'
import { WALLPAPERS, wallpaperById, wallpaperDataUrl, DEFAULT_WALLPAPER } from '../src/ui/wallpapers.js'

test('the default wallpaper exists and draws nothing', () => {
  const plain = wallpaperById(DEFAULT_WALLPAPER)
  assert.equal(plain.id, DEFAULT_WALLPAPER)
  assert.equal(plain.svg, null)
  assert.equal(wallpaperDataUrl(DEFAULT_WALLPAPER, 'red'), null)
})

test('an unknown id falls back rather than throwing', () => {
  // Ids are persisted per device, so a downgrade or a removed pattern must not break the chat.
  assert.equal(wallpaperById('no-such-wallpaper').id, WALLPAPERS[0]!.id)
  assert.equal(wallpaperDataUrl('no-such-wallpaper', 'red'), null)
})

test('every pattern renders a data URL carrying the ink colour', () => {
  for (const w of WALLPAPERS.filter((w) => w.svg)) {
    const url = wallpaperDataUrl(w.id, 'rgba(1,2,3,0.5)')
    assert.ok(url, `${w.id} produced no url`)
    assert.ok(url.startsWith('data:image/svg+xml;utf8,'), `${w.id} is not an svg data url`)
    assert.ok(decodeURIComponent(url).includes('rgba(1,2,3,0.5)'), `${w.id} ignored the ink colour`)
  }
})

test('patterns are tiles, so they repeat seamlessly at any size', () => {
  for (const w of WALLPAPERS.filter((w) => w.svg)) {
    const svg = decodeURIComponent(wallpaperDataUrl(w.id, 'red')!)
    assert.ok(/width="\d+" height="\d+"/.test(svg), `${w.id} has no fixed tile size`)
    assert.ok(svg.includes('viewBox='), `${w.id} has no viewBox`)
  }
})

test('ids are unique', () => {
  const ids = WALLPAPERS.map((w) => w.id)
  assert.equal(new Set(ids).size, ids.length)
})
