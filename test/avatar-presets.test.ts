import test from 'node:test'
import assert from 'node:assert/strict'
import { AVATAR_PRESETS, matchesPreset } from '../src/ui/avatar-presets.js'
import { avatarColor, avatarInitials } from '../src/util/avatar.js'
import { codeOf, sourceFiles } from './source-scan.js'

// ---------------------------------------------------------------------------
// Both shells had a preset gallery and they were different galleries — nine illustrations on the
// desktop, six coloured letter-circles on mobile. The avatar is not a local preference: `setAvatar`
// stores the whole data URL and presence broadcasts it, so whatever one shell offers is rendered by
// peers on the other. Two galleries meant the two ends were never drawing from the same set.
// ---------------------------------------------------------------------------

test('there are nine presets and every one is a distinct, self-contained SVG', () => {
  assert.equal(AVATAR_PRESETS.length, 9)

  const ids = new Set(AVATAR_PRESETS.map((p) => p.id))
  const svgs = new Set(AVATAR_PRESETS.map((p) => p.svg))
  assert.equal(ids.size, 9, 'two presets share an id')
  assert.equal(svgs.size, 9, 'two presets draw the same picture')

  for (const preset of AVATAR_PRESETS) {
    assert.ok(preset.name.length > 0, `${preset.id} has no name`)
    // Both shells route on this exact prefix: mobile's Avatar hands it to react-native-svg, and
    // anything else goes to RN's Image, which cannot decode SVG at all.
    assert.ok(preset.svg.startsWith('data:image/svg+xml;utf8,'), `${preset.id} is not an SVG data URI`)
    const svg = decodeURIComponent(preset.svg.slice('data:image/svg+xml;utf8,'.length))
    assert.match(svg, /^<svg /, `${preset.id} does not start with an <svg> element`)
    assert.match(svg, /<\/svg>$/, `${preset.id} is truncated`)
    assert.ok(svg.length < 1500, `${preset.id} is ${svg.length} bytes — it rides on every presence message`)
  }
})

test('no preset asks for an effect with the CSS shorthand react-native-svg will not read', () => {
  // `filter="drop-shadow(…)"` is a browser thing. react-native-svg ships `feDropShadow` as an
  // element and parses the shorthand only for `FilterImage`, which is not the path `SvgXml` takes —
  // so the shorthand renders on the desktop and silently does nothing on the phone.
  for (const preset of AVATAR_PRESETS) {
    const svg = decodeURIComponent(preset.svg.slice('data:image/svg+xml;utf8,'.length))
    assert.doesNotMatch(svg, /filter="(?!url\()/, `${preset.id} uses a filter shorthand instead of url(#…)`)
  }
})

test('the cyberpunk glow survived the move to a portable filter', () => {
  const preset = AVATAR_PRESETS.find((p) => p.id === 'cyberpunk')!
  const svg = decodeURIComponent(preset.svg.slice('data:image/svg+xml;utf8,'.length))

  // Still a glow, asked for the way both renderers understand.
  assert.match(svg, /<filter id="visorGlow"/)
  assert.match(svg, /<feDropShadow[^>]*flood-color="#00c2cb"/)
  assert.match(svg, /filter="url\(#visorGlow\)"/)
  // A filter that is defined and never referenced would be the easy mistake here.
  assert.ok(svg.indexOf('url(#visorGlow)') > svg.indexOf('<filter id="visorGlow"'))
})

test('a profile holding the old cyberpunk drawing still lights up its tile', () => {
  // The shells decide which preset is selected by comparing the stored value to the preset's
  // picture — there is no id on the profile. So redrawing a preset unselects it for everyone who
  // had chosen it: their avatar still renders, being self-contained, but the gallery stops
  // admitting where it came from. This is the only reason `legacy` exists.
  const cyberpunk = AVATAR_PRESETS.find((p) => p.id === 'cyberpunk')!
  assert.ok(cyberpunk.legacy && cyberpunk.legacy.length === 1, 'cyberpunk lost its legacy drawing')

  assert.ok(matchesPreset(cyberpunk, cyberpunk.svg), 'the current drawing must match')
  assert.ok(matchesPreset(cyberpunk, cyberpunk.legacy![0]), 'the drawing it replaced must match too')
  assert.ok(cyberpunk.legacy![0] !== cyberpunk.svg, 'the legacy entry is not actually the old one')
  assert.match(
    decodeURIComponent(cyberpunk.legacy![0].slice('data:image/svg+xml;utf8,'.length)),
    /filter="drop-shadow/,
    'the legacy entry should be the shorthand version that shipped'
  )
})

test('matchesPreset says no to everything else', () => {
  const preset = AVATAR_PRESETS[0]!
  assert.equal(matchesPreset(preset, null), false)
  assert.equal(matchesPreset(preset, undefined), false)
  assert.equal(matchesPreset(preset, ''), false)
  assert.equal(matchesPreset(preset, 'data:image/png;base64,iVBORw0KGgo='), false)
  // A different preset is not this one.
  assert.equal(matchesPreset(preset, AVATAR_PRESETS[1]!.svg), false)
})

test('no preset is the generated fallback wearing a costume', () => {
  // This is what mobile's six were: `<circle fill=colour/><text>letter</text>`, pixel for pixel what
  // avatarColor + avatarInitials already draw for a peer with no avatar at all. Offering that as a
  // choice hands someone the picture they already had.
  const generated = (id: string) => ({ colour: avatarColor(id), initials: avatarInitials(id) })
  assert.ok(generated('x').colour, 'the fallback still generates a colour')

  for (const preset of AVATAR_PRESETS) {
    const svg = decodeURIComponent(preset.svg.slice('data:image/svg+xml;utf8,'.length))
    const shapes = (svg.match(/<(circle|rect|path|polygon|ellipse|line|text)\b/g) ?? []).length
    assert.ok(shapes >= 4, `${preset.id} has ${shapes} shapes — that is a letter on a circle, not an illustration`)
  }
})

test('neither shell keeps its own gallery', () => {
  const rivals = sourceFiles().filter((file) => {
    if (file === 'src/ui/avatar-presets.ts') return false
    return /PRESET_AVATARS|function presetSvg/.test(codeOf(file))
  })
  assert.deepEqual(rivals, [])
})
