import ZEN from '@akaoio/zen'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'

const RELAY_URL = 'wss://relay.scobrudot.dev/zen'
const PAIR_KEY = 'linda-pear-zen-pair'
const WAKE_PATH = 'lindaPearWake'

interface ZenPair {
  pub: string
  priv: string
}

let zenInstance: any = null
let pairCache: ZenPair | null = null

function getZen() {
  if (!zenInstance) zenInstance = new ZEN({ peers: [RELAY_URL], axe: false, radisk: false, localStorage: false })
  return zenInstance
}

/** Persisted in the OS keystore (not tied to biometric lock — this key just needs to survive reinstalls-of-the-JS-bundle, not gate access). */
async function getPair(): Promise<ZenPair> {
  if (pairCache) return pairCache
  const stored = await SecureStore.getItemAsync(PAIR_KEY)
  if (stored) {
    pairCache = JSON.parse(stored)
    return pairCache!
  }
  const pair = await ZEN.pair()
  await SecureStore.setItemAsync(PAIR_KEY, JSON.stringify({ pub: pair.pub, priv: pair.priv }))
  pairCache = { pub: pair.pub, priv: pair.priv }
  return pairCache
}

/** Registers this device's ZEN pub + Expo push token, self-signed under `~<pub>` so nobody else can forge it. Returns the pub to broadcast via presence (see Session.setZenPub), or null if push isn't set up (no EAS project configured, or permission denied). */
export async function registerPushToken(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  if (!projectId) {
    console.warn('[zen-push] no EAS projectId configured — run `eas init` to enable push notifications')
    return null
  }

  const perm = await Notifications.requestPermissionsAsync()
  if (perm.status !== 'granted') return null

  const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId })
  const pair = await getPair()
  const zen = getZen()
  await zen.get('~' + pair.pub).get('lindaPear').put({ pushToken }, null, { authenticator: pair })
  return pair.pub
}

/** Leaves a durable "wake this identity up" note on the open graph — visible to the relay (unlike `zen.push()`, which only reaches the target directly and would skip past an intermediate relay peer). The relay resolves `zenPub`'s registered push token and calls the Expo Push API. */
export async function notifyOffline(zenPub: string, roomId: string): Promise<void> {
  const zen = getZen()
  await zen.get(WAKE_PATH).get(zenPub).put({ roomId, ts: Date.now() })
}
