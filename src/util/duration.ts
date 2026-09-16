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

/**
 * How long ago something happened, for a row that has one line to say it in: `now`, `5m`, `3h`,
 * `12d`, `4mo`.
 *
 * Both shells had this, and they parted company after a month: the desktop rolled days into
 * months, mobile kept counting days. A room last spoken in at the start of the year read `4mo` on
 * one device and `121d` on the other.
 *
 * Months are approximated as 30 days, which is what the desktop already did. This is a room-list
 * timestamp, not a date: `4mo` means "months ago, not weeks", and a reader who needs the day opens
 * the room.
 *
 * A missing timestamp gives an empty string rather than `NaNd` — the desktop guarded for it and
 * mobile guarded at the call site instead, which works until the next call site.
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  if (!timestamp) return ''
  const seconds = Math.floor((now - timestamp) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}mo`
}
