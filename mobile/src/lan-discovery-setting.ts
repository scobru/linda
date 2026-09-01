import * as SecureStore from 'expo-secure-store'

/**
 * Opt-in flag for mDNS-based LAN peer discovery — see `LanDiscovery` in the core and
 * `session.create`'s `lanDiscovery` param. Off by default: it reveals which rooms this device
 * has open to everyone on the local network. Read once at session start; changing it needs an
 * app restart, same as the DHT port setting in `dht-port.ts`.
 */
const KEY = 'linda-lan-discovery'

export async function getLanDiscoveryEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY)) === 'true'
}

export async function setLanDiscoveryEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY, String(enabled))
}
