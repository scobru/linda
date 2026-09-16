/**
 * How long a call has been up, in whole seconds.
 *
 * Derived from the moment it connected rather than counted, which is the difference between the
 * two shells. Mobile computed `Date.now() - startedAt`; the desktop incremented a counter inside a
 * one-second `setInterval`. A counter is not a clock: timers fire late under load, and a
 * backgrounded window throttles them to a fraction of their rate — so a ten-minute call showed
 * eight minutes on a desktop that had been behind another window, while the phone on the other end
 * of the same call showed ten.
 *
 * `startedAt` is null until the call connects, which is the same thing as zero here: a call that is
 * still ringing has not been up for any length of time.
 */
export function callDurationSeconds(startedAt: number | null, now: number): number {
  if (!startedAt) return 0
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

/**
 * `mm:ss`, zero-padded — the same thing both shells were formatting separately.
 *
 * Minutes are not wrapped into hours: a call that runs past an hour reads `61:14`, which both
 * shells already did and which is unambiguous in a space this small.
 */
export function formatCallDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`
}
