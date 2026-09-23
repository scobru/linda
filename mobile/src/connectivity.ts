import type { NetworkResyncCause } from '@core/app/session'

// ---------------------------------------------------------------------------
// What the phone does about its connection when the network or the app's place on screen changes.
//
// Two decisions hang off those changes, and both have already cost a release:
//
// - When to resync the swarm, and why. A resync closes every connection, the call's included,
//   so the core skips a foreground one while a call is up (`Session.resumeNetwork`, v1.14.78) —
//   which only works if the cause it is handed is the right one.
// - When to hold the process up with the background-connection service. A stop that overtook its
//   start killed the app (`ForegroundServiceDidNotStartInTimeException`, v1.14.82); the native side
//   now queues the stop behind the start, and this side sends them strictly alternating.
//
// This lived in a closure inside `useSession`, reachable only with React Native running. Here it is
// one module with the platform behind adapters.
// ---------------------------------------------------------------------------

export interface ConnectivityPorts {
  /** AppState's current value when watching starts. */
  initialAppState: string | null
  onAppStateChange(listener: (state: string) => void): () => void
  /** NetInfo's network type (`wifi`, `cellular`, `none`, ...) on every report. */
  onNetworkType(listener: (type: string) => void): () => void
  /** Whether there is a session — something to resync, and something worth staying connected for. */
  hasSession(): boolean
  resumeNetwork(cause: NetworkResyncCause): void
  startBackgroundConnection(): void
  stopBackgroundConnection(): void
}

/**
 * How long network reports have to settle before the resync goes out.
 *
 * Turning wifi off fires several type changes in quick succession (wifi → none → cellular as the
 * radio actually switches over); resyncing on each would rebind against the momentary `none`.
 */
export const RESYNC_DEBOUNCE_MS = 800

/**
 * Starts watching; returns the function that stops.
 *
 * The rules:
 * - A network type different from the last one reported schedules a `network-change` resync. The
 *   first report is only a baseline: the app did not move networks by starting.
 * - A return to the foreground schedules a `foreground` resync. A phone left in the background can
 *   have its NAT's UDP mapping expire without any type change, and a fresh hole-punch to anyone new
 *   then fails silently until the socket rebinds.
 * - Resyncs within `RESYNC_DEBOUNCE_MS` of each other are one, and it is a `network-change` if any
 *   of them was: that is the cause that says the old socket routes nowhere, and the one the core
 *   will not skip for a call.
 * - Leaving the foreground with a session starts the background connection; the next return stops
 *   it. Start and stop alternate, a start first, however fast the app flips.
 */
export function watchConnectivity(ports: ConnectivityPorts): () => void {
  let resyncTimer: ReturnType<typeof setTimeout> | null = null
  let resyncCause: NetworkResyncCause | null = null

  const scheduleResync = (cause: NetworkResyncCause) => {
    if (resyncCause !== 'network-change') resyncCause = cause
    if (resyncTimer) clearTimeout(resyncTimer)
    resyncTimer = setTimeout(() => {
      const settled = resyncCause ?? cause
      resyncTimer = null
      resyncCause = null
      if (ports.hasSession()) ports.resumeNetwork(settled)
    }, RESYNC_DEBOUNCE_MS)
  }

  let lastNetworkType: string | null = null
  const stopNetwork = ports.onNetworkType((type) => {
    if (lastNetworkType === null) {
      lastNetworkType = type
      return
    }
    if (type === lastNetworkType) return
    lastNetworkType = type
    scheduleResync('network-change')
  })

  let lastAppState = ports.initialAppState
  // Whether a start has gone out that no stop has followed. A start skipped for want of a session
  // leaves nothing to stop on the way back.
  let backgroundStarted = false
  const stopAppState = ports.onAppStateChange((next) => {
    if (next === 'active' && lastAppState !== 'active') {
      scheduleResync('foreground')
      if (backgroundStarted) {
        backgroundStarted = false
        ports.stopBackgroundConnection()
      }
    } else if (next !== 'active' && lastAppState === 'active') {
      if (ports.hasSession()) {
        backgroundStarted = true
        ports.startBackgroundConnection()
      }
    }
    lastAppState = next
  })

  return () => {
    stopNetwork()
    stopAppState()
    if (resyncTimer) clearTimeout(resyncTimer)
    resyncTimer = null
  }
}
