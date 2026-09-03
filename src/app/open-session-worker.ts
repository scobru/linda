import b4a from 'b4a'
import run from 'pear-run'
import type { Identity } from '../identity/index.js'
import type { SessionView } from './session-view.js'
import { RpcClient } from '../transport/rpc-client.js'
import {
  RemoteSessionView,
  type RemoteSessionInitialState,
  type WireIdentity
} from '../transport/remote-session-view.js'
import type { OpenSessionOptions } from './open-session.js'

export type { OpenSessionOptions }

/** Where `build.js` writes the worker bundle. Relative to the app root, which is what `pear-run`
 * resolves a non-`pear://` link against. */
const WORKER_ENTRY = '/dist/worker.js'

/**
 * The worker one: the core runs in a Bare subprocess and the renderer holds only a proxy.
 *
 * The Pear build swaps this in for `open-session.ts` (see `bareRemap` in build.js), so the UI
 * calls the same function either way and never learns which it got — that is what `SessionView`
 * was extracted for.
 *
 * `pear-run` launches the worker and hands back a `bare-pipe`, which is the duplex `RpcClient`
 * wants; the worker's own end picks it up through `pear-pipe` (see `src/worker/entry.ts`).
 */
export async function openSession(
  identity: Identity,
  storageDir: string,
  options: OpenSessionOptions = {}
): Promise<SessionView> {
  const pipe = run(WORKER_ENTRY)
  const client = new RpcClient(pipe as never)

  const wireIdentity: WireIdentity = {
    id: identity.id,
    publicKey: b4a.toString(identity.publicKey, 'hex'),
    secretKey: b4a.toString(identity.secretKey, 'hex')
  }

  // The worker starts with no session at all, so this call is what makes every other one possible.
  // Its reply is the initial state the proxy's synchronous getters answer from until the first
  // pushed event replaces it.
  const initialState = await client.call<RemoteSessionInitialState>(
    'session.open',
    wireIdentity,
    storageDir,
    { dhtPort: options.dhtPort, bootstrap: options.bootstrap }
  )

  // `createLanDiscovery` is dropped rather than forwarded: it is a function, and a worker runs on
  // Bare, where mDNS has no transport anyway (see lan-discovery-stub.ts). The Pear build already
  // hides the setting, so there is nothing here to warn about.
  return new RemoteSessionView(client, initialState, options.events)
}
