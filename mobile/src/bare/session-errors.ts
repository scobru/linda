/**
 * Turns the worklet's raw failure text into something a person can act on. The strings matched here
 * come from the storage layer (`fd-lock`, `device-file`) and from client.ts's own deadlines, and on
 * their own they say nothing about what the user should do — "File descriptor could not be locked"
 * on the unlock screen reads as "the app is broken", which is how "clear the app's storage" became
 * the folk remedy for a storage lock that only needed the old process to go away.
 */
export function describeSessionError(err: unknown): string {
  const raw = (err as Error)?.message || String(err)

  if (/could not be locked|already held|Resource temporarily unavailable/i.test(raw)) {
    return 'Linda’s storage is still held by a previous run. Close it from the recent-apps list, then open it again.'
  }
  if (/device file/i.test(raw)) {
    return 'This device’s storage was copied or restored from a backup, which Linda cannot reuse safely. Recover your identity from your recovery phrase to start a fresh store.'
  }
  if (/did not answer|runtime has stopped/i.test(raw)) {
    return 'The background runtime stopped responding. Close Linda from the recent-apps list, then open it again.'
  }
  return raw
}
