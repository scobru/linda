// The invariant `Session.openRoomWithRetry` depends on: one `Room.open` per corestore namespace,
// ever.
//
// A join that has to replicate the room from a peer used to be given a 20s ceiling, after which the
// open was abandoned and a fresh one started over the same namespace. That is not a retry. The
// abandoned open holds the namespace's cores and goes on to succeed, and nothing started over that
// namespace afterwards ever resolves — so the join ran out its 45s deadline and reported the room
// unreachable, with the peer connected, serving it, and a private chat with that same peer working
// the whole time. Only a device slow enough to spend 20s on a first open crossed the line, which is
// why it read as a phone-versus-desktop problem. (Starting the second open while the first is still
// in flight is worse still: neither one finishes.)
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Corestore from 'corestore'
import { Room } from '../src/rooms/room.js'

const OWNER_ID = 'a'.repeat(64)
const JOINER_ID = 'b'.repeat(64)

/** What the promise settled as, or 'pending' if it has not settled within `ms`. */
function settledWithin(promise: Promise<unknown>, ms: number): Promise<'resolved' | 'rejected' | 'pending'> {
  return Promise.race([
    promise.then(() => 'resolved' as const, () => 'rejected' as const),
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), ms))
  ])
}

async function waitFor(check: () => boolean, label: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for: ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

test('a namespace that has already been opened once cannot be opened again', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'linda-open-retry-'))
  const storeA = new Corestore(path.join(base, 'a'))
  const storeB = new Corestore(path.join(base, 'b'))
  await storeA.ready()
  await storeB.ready()

  const owner = await Room.open(storeA, null, null, OWNER_ID, undefined, 'ns-a')
  await owner.send(OWNER_ID, 'hello')

  const streamA = storeA.replicate(true)
  const streamB = storeB.replicate(false)
  streamA.pipe(streamB).pipe(streamA)

  const joined = await Room.open(storeB, null, owner.bootstrapKey, JOINER_ID, undefined, 'ns-b')
  await waitFor(() => joined.messageCount === 1, "the owner's message to replicate to the joiner")

  // Exactly what the retry loop used to start once its ceiling had fired on an open that then went
  // on to succeed. The room is right there, fully replicated, and this still never finishes.
  const retry = Room.open(storeB, null, owner.bootstrapKey, JOINER_ID, undefined, 'ns-b')
  const retryRoom = retry.then((room) => room, () => null)

  t.after(async () => {
    await owner.close()
    await joined.close()
    await (await retryRoom)?.close()
    await storeA.close()
    await storeB.close()
    fs.rmSync(base, { recursive: true, force: true })
  })

  assert.equal(
    await settledWithin(retry, 3_000),
    'pending',
    'a second open over a spent namespace hangs, however reachable the peer is'
  )
})
