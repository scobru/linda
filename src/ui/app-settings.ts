// What the shell reads from its host: where to keep data, and the two settings stored in localStorage.
import os from 'node:os'
import path from 'node:path'
import { LAN_DISCOVERY_SUPPORTED } from '../network/lan-discovery.js'

export function storageDir(): string {
  // Pear hands every app its own storage directory, keyed to the app link; under Electron there
  // is nobody to ask, so this picks one. `LINDA_PEAR_STORAGE_DIR` is what `npm run start:a`/`:b`
  // set to get two independent identities out of one checkout.
  if (typeof Pear !== 'undefined') return Pear.config.storage
  if (globalThis.process?.env?.LINDA_PEAR_STORAGE_DIR) return globalThis.process.env.LINDA_PEAR_STORAGE_DIR
  return path.join(os.homedir(), '.linda-pear', 'storage')
}

/** User-set UDP port for the DHT socket, for VPN port forwarding — see `createSwarm`.
 * Out-of-range or unset means hyperdht's default. */
export function dhtPort(): number | undefined {
  const value = Number(localStorage.getItem(DHT_PORT_KEY))
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : undefined
}

export const DHT_PORT_KEY = 'linda-dht-port'

/** Opt-in: announcing a room's topic on the LAN reveals that topic to everyone on the network
 * (see `SwarmTransport.lanDiscovery`), so this defaults to off. */
export function lanDiscoveryEnabled(): boolean {
  return LAN_DISCOVERY_SUPPORTED && localStorage.getItem(LAN_DISCOVERY_KEY) === 'true'
}

export const LAN_DISCOVERY_KEY = 'linda-lan-discovery'
