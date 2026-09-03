import { Session } from './session.js'
import type { Identity } from '../identity/index.js'
import type { SessionView } from './session-view.js'
import type { RemoteSessionEvents } from '../transport/remote-session-view.js'
import type { SwarmTransport } from '../network/swarm.js'

/**
 * How the UI asks for a session without knowing where it runs.
 *
 * This is the in-process one: the core lives in the same process as the renderer, which is what
 * Electron does and has always done. The Pear build swaps this module for `open-session-worker.ts`
 * at bundle time (see `bareRemap` in build.js), the same way it swaps `lan-discovery`.
 *
 * A swap rather than a runtime branch on purpose: the worker path imports `pear-run` and, through
 * it, `bare-rpc` — Bare-only modules. A single module importing both would drag them into
 * `dist/app.js`, which is CommonJS-on-Node for the Electron renderer, where requiring a Bare module
 * is not something to find out about at startup.
 */
export interface OpenSessionOptions {
  events?: RemoteSessionEvents
  dhtPort?: number
  /** Absent wherever the core runs on Bare: mDNS needs `dgram`, which Bare has no equivalent for. */
  createLanDiscovery?: SwarmTransport['createLanDiscovery']
  /** Test seam, the same one `SwarmTransport` has: it lets a test point a session at an in-process
   * testnet instead of the public DHT. Both launchers honour it, so either can be exercised the
   * way `test/session.test.ts` already exercises the core. */
  bootstrap?: SwarmTransport['bootstrap']
}

export async function openSession(
  identity: Identity,
  storageDir: string,
  options: OpenSessionOptions = {}
): Promise<SessionView> {
  return Session.create(identity, storageDir, {
    events: options.events,
    transport: {
      dhtPort: options.dhtPort,
      bootstrap: options.bootstrap,
      createLanDiscovery: options.createLanDiscovery
    }
  })
}
