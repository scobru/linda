import test from 'node:test'
import assert from 'node:assert/strict'
import * as desktop from '../src/app/session-contract.js'
import * as mobile from '../mobile/src/bare/session-contract.js'

// ---------------------------------------------------------------------------
// The two contracts, side by side.
//
// Each platform classifies every `Session` member on its own, and each fails its own build when a
// member is left out. What neither could say is how the two compare: a capability the desktop
// offers and the phone quietly does not — or the reverse — looked exactly like one handled some
// other way. Both now use the same buckets, and the difference between them is a list below,
// reviewed, with a reason per entry. A new gap fails this test until someone writes it down here.
// ---------------------------------------------------------------------------

/** Reachable from the UI on that platform: forwarded, mirrored or written out by hand. */
const desktopExposed = new Set<string>([...desktop.FORWARDED_METHODS, ...desktop.MIRRORED, ...desktop.ADAPTED])
const mobileExposed = new Set<string>([...mobile.FORWARDED_SESSION_METHODS, ...mobile.ADAPTED])

/** On the desktop, not reachable from the phone's UI — and why that is fine. */
const DESKTOP_ONLY: Record<string, string> = {
  close: 'the phone never closes its session from the app; the session lives as long as the worklet',
  fileStore: 'the phone adds files inside the worklet (room.sendFile) and never holds the store',
  getPairingSnapshot: "the phone's pairing runs in the worklet's own login flow",
  importPairingSnapshot: "the phone's pairing runs in the worklet's own login flow",
  getAppBackground: 'the app-wide background picture is a desktop setting',
  setAppBackground: 'the app-wide background picture is a desktop setting'
}

/** On the phone, not reachable from the desktop UI — and why that is fine. */
const MOBILE_ONLY: Record<string, string> = {}

const sorted = (values: Iterable<string>) => [...values].sort()

test('both contracts classify the same set of Session members', () => {
  const desktopAll = [
    ...desktop.FORWARDED_METHODS, ...desktop.MIRRORED, ...desktop.ADAPTED, ...desktop.INTERNAL, ...desktop.NOT_EXPOSED
  ]
  const mobileAll = [
    ...mobile.FORWARDED_SESSION_METHODS, ...mobile.ADAPTED, ...mobile.INTERNAL, ...mobile.NOT_EXPOSED
  ]
  assert.deepEqual(sorted(new Set(desktopAll)), sorted(new Set(mobileAll)))
})

test('no member sits in two buckets on the same side', () => {
  const dupes = (all: readonly string[]) => all.filter((name, i) => all.indexOf(name) !== i)
  assert.deepEqual(dupes([
    ...desktop.FORWARDED_METHODS, ...desktop.MIRRORED, ...desktop.ADAPTED, ...desktop.INTERNAL, ...desktop.NOT_EXPOSED
  ]), [], 'desktop')
  assert.deepEqual(dupes([
    ...mobile.FORWARDED_SESSION_METHODS, ...mobile.ADAPTED, ...mobile.INTERNAL, ...mobile.NOT_EXPOSED
  ]), [], 'mobile')
})

test('what one platform offers and the other does not is exactly the declared list', () => {
  const desktopOnly = sorted([...desktopExposed].filter((name) => !mobileExposed.has(name)))
  const mobileOnly = sorted([...mobileExposed].filter((name) => !desktopExposed.has(name)))
  assert.deepEqual(desktopOnly, sorted(Object.keys(DESKTOP_ONLY)),
    'the desktop offers these and the phone does not — add a reason to DESKTOP_ONLY, or expose them on the phone')
  assert.deepEqual(mobileOnly, sorted(Object.keys(MOBILE_ONLY)),
    'the phone offers these and the desktop does not — add a reason to MOBILE_ONLY, or expose them on the desktop')
})

test('a member declared not exposed on one side is a declared gap, not an oversight on the other', () => {
  for (const name of mobile.NOT_EXPOSED) {
    assert.ok(name in DESKTOP_ONLY || !desktopExposed.has(name), `${name}: not on the phone, but no reason given`)
  }
  for (const name of desktop.NOT_EXPOSED as readonly string[]) {
    assert.ok(name in MOBILE_ONLY || !mobileExposed.has(name), `${name}: not on the desktop, but no reason given`)
  }
})
