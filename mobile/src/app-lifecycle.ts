// ---------------------------------------------------------------------------
// What the app does when it enters or leaves the foreground, kept apart from React Native so it
// can be tested on its own.
//
// Two things hang off these transitions: the network resync on a foreground return (see
// `Session.resumeNetwork`) and the background-connection service (see `P2pForegroundService`),
// started when the app leaves the foreground and stopped when it returns. The service is the
// part with teeth: in v1.14.81 a stop that overtook its start was a crash
// (`ForegroundServiceDidNotStartInTimeException`). The native side now queues the stop behind
// the start. What this side guarantees is that the calls themselves alternate: a start before
// any stop, and never two of either in a row, however fast the app flips.
// ---------------------------------------------------------------------------

export interface AppLifecycleHooks {
  /** Whether there is a session worth keeping connected while backgrounded. */
  hasSession(): boolean
  /** The app has come back to the foreground. */
  onForeground(): void
  startBackgroundConnection(): void
  stopBackgroundConnection(): void
}

/**
 * Returns the handler for React Native's AppState `change` events.
 *
 * `initial` is `AppState.currentState` when the handler is made. Anything other than `active`
 * counts as away: Android reports `background`, iOS passes through `inactive` on the way.
 */
export function createAppStateHandler(initial: string | null, hooks: AppLifecycleHooks): (next: string) => void {
  let last = initial
  // Whether a start has gone out that no stop has followed. A start skipped for want of a session
  // leaves nothing to stop on the way back.
  let backgroundStarted = false
  return (next) => {
    if (next === 'active' && last !== 'active') {
      hooks.onForeground()
      if (backgroundStarted) {
        backgroundStarted = false
        hooks.stopBackgroundConnection()
      }
    } else if (next !== 'active' && last === 'active') {
      if (hooks.hasSession()) {
        backgroundStarted = true
        hooks.startBackgroundConnection()
      }
    }
    last = next
  }
}
