import * as SecureStore from 'expo-secure-store'

/**
 * User-set UDP port for the DHT socket, so someone behind a VPN can pin it to the port the VPN
 * forwards — see `createSwarm` in the core. Read once at session start and passed into the
 * worklet; changing it needs an app restart, since the swarm binds its socket on creation.
 *
 * SecureStore rather than AsyncStorage only because it is the one key/value store this app
 * already depends on — there is nothing secret about a port number.
 */
const KEY = 'linda-dht-port'

export async function getDhtPort(): Promise<number | undefined> {
  const value = Number(await SecureStore.getItemAsync(KEY))
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : undefined
}

export async function setDhtPort(port: number | undefined): Promise<void> {
  if (port === undefined) await SecureStore.deleteItemAsync(KEY)
  else await SecureStore.setItemAsync(KEY, String(port))
}
