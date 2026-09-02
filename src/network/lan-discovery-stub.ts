import type { Duplex } from 'node:stream'
import type { Keypair } from '../identity/keypair.js'
import type { LanDiscoveryHandle } from './swarm.js'

/**
 * Stands in for `lan-discovery.ts` in the Pear build (see the `bare-remap` plugin in build.js).
 *
 * mDNS needs UDP multicast, and the `multicast-dns` package reaches for it with a bare
 * `require('dgram')` — a Node builtin with no Bare equivalent, so importing the real module under
 * Pear fails at load time and takes the whole app down with it, over a feature that is off by
 * default. The mobile worklet dodges this by never importing the module at all (swarm.ts's
 * `SwarmTransport.createLanDiscovery` exists for exactly that reason); the desktop UI does import
 * it, so the Pear bundle gets this instead and hides the setting.
 */
export const LAN_DISCOVERY_SUPPORTED = false

export class LanDiscovery implements LanDiscoveryHandle {
  constructor(_identity: Keypair, _onSocket: (socket: Duplex, remotePublicKey: Buffer) => void) {
    // Reachable only if something ignores LAN_DISCOVERY_SUPPORTED — a warning beats a throw,
    // since the caller's session is otherwise perfectly usable over the DHT.
    console.warn('[lan-discovery] not available under Pear: mDNS needs node:dgram, which Bare has no equivalent for')
  }

  join(_topic: Buffer): void {}
  leave(_topic: Buffer): void {}
  async destroy(): Promise<void> {}
}
