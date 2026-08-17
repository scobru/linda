// Companion process for relay.scobrudot.dev/zen — turns a linda-pear "wake this device"
// note (written to the open graph at lindaPearWake/<zenPub>) into a real Expo push
// notification, so a backgrounded/killed phone gets woken via APNs/FCM.
//
// Deploy: runs as its own process alongside the ZEN relay (same host or anywhere with
// network access to it). Does NOT need to be the relay itself — just another peer.
//
//   npm install @akaoio/zen
//   node zen-push-relay.mjs
//
// Env vars:
//   ZEN_RELAY_URL   default wss://relay.scobrudot.dev/zen
//   EXPO_ACCESS_TOKEN  optional, only needed if you enabled "Enhanced Security" on the Expo project

import ZEN from '@akaoio/zen'

const RELAY_URL = process.env.ZEN_RELAY_URL || 'wss://relay.scobrudot.dev/zen'
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const WAKE_PATH = 'lindaPearWake'

const zen = new ZEN({ peers: [RELAY_URL], axe: false, radisk: false })

// De-dupes on the wake note's own timestamp so a re-synced/late graph write doesn't
// re-fire a push for something already handled since this process started.
const lastSeenTs = new Map()

async function lookupPushToken(zenPub) {
  const record = await zen.get('~' + zenPub).get('lindaPear')
  return record?.pushToken ?? null
}

async function sendExpoPush(pushToken, roomId) {
  const headers = { 'content-type': 'application/json', accept: 'application/json' }
  if (process.env.EXPO_ACCESS_TOKEN) headers.authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      to: pushToken,
      title: 'linda-pear',
      body: 'New message',
      data: { roomId },
      priority: 'high',
    }),
  })
  if (!res.ok) console.error('[zen-push-relay] Expo push failed', res.status, await res.text())
}

zen.get(WAKE_PATH).map().on(async (note, zenPub) => {
  if (!note || typeof note.ts !== 'number') return
  if (lastSeenTs.get(zenPub) === note.ts) return
  lastSeenTs.set(zenPub, note.ts)

  try {
    const pushToken = await lookupPushToken(zenPub)
    if (!pushToken) return
    await sendExpoPush(pushToken, note.roomId)
    console.log(`[zen-push-relay] woke ${zenPub.slice(0, 12)}… for room ${note.roomId}`)
  } catch (err) {
    console.error('[zen-push-relay] failed to process wake note', err)
  }
})

console.log(`[zen-push-relay] listening on ${WAKE_PATH}/* via ${RELAY_URL}`)
