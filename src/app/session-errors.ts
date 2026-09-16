// ---------------------------------------------------------------------------
// What went wrong opening a session, said in a way a person can act on.
//
// Both shells did this, over the same storage layer, with matchers neither of them shared. Neither
// was a superset of the other: the desktop tested `includes('locked') || includes('FDLock')`, so a
// store held by another run whose error read "already held" fell straight through to the raw text;
// mobile tested `/could not be locked|already held|Resource temporarily unavailable/i`, so the same
// failure reported as "FDLock" fell through on the phone. And the four ways a store can turn out to
// belong to a different device — which mobile explains and offers a remedy for — had no case at all
// on the desktop, where the raw text reads as "the app is broken" and the folk remedy for that is to
// delete the storage directory, which on the desktop means deleting your identity.
//
// So the classification lives here, once, and each shell words the remedy. The split is deliberate:
// which failure this is must not differ between the two, and the instruction has to — "close it from
// the recent-apps list" is not a thing you can do to a desktop window.
// ---------------------------------------------------------------------------

/** Which shell is asking, because the remedy differs even when the failure does not. */
export type Shell = 'desktop' | 'mobile'

export type SessionFailure =
  /** The store is open in another process — the commonest one, and the one worth getting right. */
  | 'storage-locked'
  /** The store was made on another device, or moved in a way that breaks it. Not recoverable in place. */
  | 'storage-foreign'
  /** The Bare runtime behind the UI stopped answering. Only mobile can currently report this. */
  | 'runtime-stopped'
  /** Anything else — show the raw text rather than guess at a remedy. */
  | 'unknown'

/**
 * `fd-lock` throws plain `Error`s, so this is the one classification that has to read text.
 *
 * The first two are the literals `fd-lock` throws (`node_modules/fd-lock/index.js`, and a test
 * asserts they are still those literals, so an upgrade that rewords them fails there rather than in
 * front of a user). `FDLock` is the class name, which reaches us when the message came out of a
 * stack. The last two came from mobile and match nothing in the current dependency tree — Android
 * runs native `fs-native-extensions` rather than the JS here, and whoever wrote them was presumably
 * reading a real failure, so they stay.
 */
const LOCKED = /could not be locked|already been transferred|FDLock|already held|Resource temporarily unavailable/i

/** The fatal `device-file` messages all start this way; `No device file present` deliberately does not. */
const FOREIGN = /invalid device file/i

/** Raised by `mobile/src/bare/client.ts` when the worklet misses a deadline or has gone. */
const RUNTIME_STOPPED = /did not answer|runtime has stopped/i

/**
 * What kind of failure this is.
 *
 * `device-file` tags its errors with `code` and `fatal`, which is a far better discriminant than its
 * wording — so this reads them when they are there. They are there whenever the error has not
 * crossed an RPC boundary, which is to say on Electron, where the `Session` runs in this process.
 * Both worker bridges serialise an error down to `err.message` and drop everything else, so on Pear
 * and on mobile only the text survives and the patterns are all there is. That is why mobile's
 * describer was matching strings in the first place: by the time it ran, the fields were gone.
 * Carrying the classification across those two wires is worth doing and is not done here.
 */
export function classifySessionError(err: unknown): SessionFailure {
  const tagged = err as { code?: string; fatal?: boolean } | null
  if (tagged?.code === 'DEVICE_FILE') {
    // A non-fatal device-file error means there is no device file yet, which is not a foreign store.
    // Linda never opens a store with `create: false`, so it cannot reach us — and inventing a remedy
    // for a case that cannot happen is how a wrong instruction gets shipped. It stays unknown.
    return tagged.fatal ? 'storage-foreign' : 'unknown'
  }

  const raw = errorText(err)
  if (LOCKED.test(raw)) return 'storage-locked'
  if (FOREIGN.test(raw)) return 'storage-foreign'
  if (RUNTIME_STOPPED.test(raw)) return 'runtime-stopped'
  return 'unknown'
}

/**
 * The sentence to show, for the shell asking.
 *
 * Every failure has a sentence for both shells — a test enforces that, so a new kind cannot be added
 * and worded on one platform only, which is the exact way this drifted apart the first time.
 */
const REMEDY: Record<Exclude<SessionFailure, 'unknown'>, Record<Shell, string>> = {
  'storage-locked': {
    desktop: 'Linda’s storage is already open in another copy of Linda. Close the other one, then try again.',
    mobile: 'Linda’s storage is still held by a previous run. Close it from the recent-apps list, then open it again.'
  },
  'storage-foreign': {
    desktop: 'This storage was made on another device, or was moved or restored in a way Linda cannot reuse safely. Recover your identity from your recovery phrase to start a fresh store.',
    mobile: 'This device’s storage was copied or restored from a backup, which Linda cannot reuse safely. Recover your identity from your recovery phrase to start a fresh store.'
  },
  'runtime-stopped': {
    desktop: 'Linda’s background runtime stopped responding. Quit Linda and open it again.',
    mobile: 'The background runtime stopped responding. Close Linda from the recent-apps list, then open it again.'
  }
}

/**
 * Turns a failure into something a person can act on, or hands back the raw text when there is no
 * honest remedy to offer. The raw text is deliberately not dressed up: an unrecognised failure the
 * user can quote is worth more than a reassuring sentence that fits every one of them, which is what
 * the desktop's "Failed to unlock" was.
 */
export function describeSessionError(err: unknown, shell: Shell): string {
  const failure = classifySessionError(err)
  return failure === 'unknown' ? errorText(err) : REMEDY[failure][shell]
}

function errorText(err: unknown): string {
  return (err as Error | null)?.message || String(err)
}
