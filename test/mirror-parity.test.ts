import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Duplex } from 'streamx'
import b4a from 'b4a'
import createTestnet from 'hyperdht/testnet.js'
import { RpcClient } from '../src/transport/rpc-client.js'
import { RemoteRoomView } from '../src/transport/remote-room-view.js'
import { RemoteSessionView } from '../src/transport/remote-session-view.js'
import { WorkerDispatcher, extractSessionState } from '../src/worker/dispatcher.js'
import { Session } from '../src/app/session.js'
import { generateKeypair } from '../src/identity/keypair.js'
import type { Identity } from '../src/identity/index.js'
import type { SwarmTransport } from '../src/network/swarm.js'
import type { SessionView, RoomView } from '../src/app/session-view.js'

let testnetPromise: Promise<{ bootstrap: unknown[]; destroy(): Promise<void> } | null> | null = null

function transport(): Promise<SwarmTransport> {
  testnetPromise ??= createTestnet(4)
  return testnetPromise.then((net) => ({ bootstrap: (net as { bootstrap: never }).bootstrap }))
}

after(async () => {
  const net = await testnetPromise
  if (net) await net.destroy()
})

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'linda-parity-test-'))
}

function makeIdentity(): Identity {
  const kp = generateKeypair()
  return { ...kp, id: b4a.toString(kp.publicKey, 'hex') }
}

function createDuplexPair(): [Duplex, Duplex] {
  let streamA!: Duplex
  let streamB!: Duplex

  streamA = new Duplex({
    write(chunk, cb) {
      streamB.push(chunk)
      cb(null)
    },
    final(cb) {
      streamB.push(null)
      cb(null)
    }
  })

  streamB = new Duplex({
    write(chunk, cb) {
      streamA.push(chunk)
      cb(null)
    },
    final(cb) {
      streamA.push(null)
      cb(null)
    }
  })

  return [streamA, streamB]
}

test('anti-drift: full parity test between in-process Session and RemoteSessionView mirrors', async () => {
  const dir = tmpDir()
  const identity = makeIdentity()
  const localSession = await Session.create(identity, dir, { transport: await transport() })

  const [streamWorker, streamClient] = createDuplexPair()
  const dispatcher = new WorkerDispatcher(streamWorker, localSession)
  const client = new RpcClient(streamClient)

  const initialState = await extractSessionState(localSession)
  const remoteSession = new RemoteSessionView(client, initialState)

  try {
    // Typecheck contract compliance
    const _sView: SessionView = remoteSession
    assert.ok(_sView)

    // 1. Initial State Parity across all synchronous getters
    assert.equal(remoteSession.getNickname(), localSession.getNickname())
    assert.equal(remoteSession.getAvatar(), localSession.getAvatar())
    assert.equal(remoteSession.getWallpaper(), localSession.getWallpaper())
    assert.equal(remoteSession.getAppBackground(), localSession.getAppBackground())
    assert.deepEqual(remoteSession.listBookmarks(), localSession.listBookmarks())
    assert.deepEqual(remoteSession.listContacts(), localSession.listContacts())
    assert.deepEqual(remoteSession.listDirectory(), localSession.listDirectory())
    assert.deepEqual([...remoteSession.listPeerAvatars().entries()], [...localSession.listPeerAvatars().entries()])
    assert.equal(remoteSession.getPeerAvatar(identity.id), localSession.getPeerAvatar(identity.id))
    assert.equal(remoteSession.getNetworkStatus().connections, localSession.getNetworkStatus().connections)

    // 2. Profile mutations parity
    await remoteSession.setNickname('AliceParity')
    assert.equal(remoteSession.getNickname(), 'AliceParity')
    assert.equal(localSession.getNickname(), 'AliceParity')

    await remoteSession.setAvatar('matrix-neon')
    assert.equal(remoteSession.getAvatar(), 'matrix-neon')
    assert.equal(localSession.getAvatar(), 'matrix-neon')

    await remoteSession.setWallpaper('synthwave-grid')
    assert.equal(remoteSession.getWallpaper(), 'synthwave-grid')
    assert.equal(localSession.getWallpaper(), 'synthwave-grid')

    await remoteSession.setAppBackground('stars')
    assert.equal(remoteSession.getAppBackground(), 'stars')
    assert.equal(localSession.getAppBackground(), 'stars')

    // 3. Room creation & RoomView synchronous getters parity
    const remoteRoom = await remoteSession.createRoom('Parity Test Room', false, 'room-ico', 'Description of room')
    const localRoom = localSession.getRoom(remoteRoom.id)!
    assert.ok(localRoom, 'Local session should hold room instance')

    const _rView: RoomView = remoteRoom
    assert.ok(_rView)

    assert.equal(remoteRoom.id, localRoom.id)
    assert.equal(remoteRoom.avatar, localRoom.avatar)
    assert.equal(remoteRoom.description, localRoom.description)
    assert.equal(remoteRoom.writable, localRoom.writable)
    assert.equal(remoteRoom.hasKey, localRoom.hasKey)
    assert.equal(remoteRoom.isBroadcast, localRoom.isBroadcast)
    assert.equal(remoteRoom.messageCount, localRoom.messageCount)
    assert.equal(remoteRoom.isOwner(identity.id), localRoom.isOwner(identity.id))
    assert.equal(remoteRoom.canPost(identity.id), localRoom.canPost(identity.id))
    assert.equal(remoteRoom.canModerate(identity.id), localRoom.canModerate(identity.id))
    assert.equal(remoteRoom.listMembers().length, localRoom.listMembers().length)
    assert.deepEqual(remoteRoom.listBanned(), localRoom.listBanned())

    // 4. Invite link parity
    const localInvite = localSession.inviteLinkFor(localRoom.id)
    const remoteInvite = remoteSession.inviteLinkFor(remoteRoom.id)
    assert.equal(remoteInvite, localInvite)
    assert.ok(remoteInvite.includes(':'))

    // 5. Bookmarks and Favorites parity
    assert.equal(remoteSession.isRoomFavorite(remoteRoom.id), localSession.isRoomFavorite(localRoom.id))
    assert.equal(remoteSession.isRoomFavorite(remoteRoom.id), false)

    await remoteSession.setRoomFavorite(remoteRoom.id, true)
    assert.equal(remoteSession.isRoomFavorite(remoteRoom.id), true)
    assert.equal(localSession.isRoomFavorite(localRoom.id), true)

    // Mark room read
    remoteSession.markRoomRead(remoteRoom.id)
    await new Promise((resolve) => setTimeout(resolve, 50))
    const localBm = localSession.listBookmarks().find((b) => b.id === remoteRoom.id)!
    const remoteBm = remoteSession.listBookmarks().find((b) => b.id === remoteRoom.id)!
    assert.ok(remoteBm.lastReadAt! > 0)
    assert.ok(localBm.lastReadAt! > 0)

    // Clear room history
    remoteSession.clearRoomHistory(remoteRoom.id)
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.ok(remoteBm.clearedAt! > 0)

    // 6. Messages and reactions parity
    let onMessageCalled = false
    remoteRoom.onMessage((index) => {
      onMessageCalled = true
      assert.equal(index, 0)
    })

    const msg = await remoteRoom.send(identity.id, 'Testing parity message')
    assert.equal(msg.body, 'Testing parity message')
    assert.equal(msg.authorId, identity.id)

    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(onMessageCalled, true)
    assert.equal(remoteRoom.messageCount, localRoom.messageCount)
    assert.equal(remoteRoom.messageCount, 1)

    const remoteMsg = await remoteRoom.getMessage(0)
    const localMsg = await localRoom.getMessage(0)
    assert.equal(remoteMsg.body, localMsg.body)
    assert.equal(remoteMsg.authorId, localMsg.authorId)

    await remoteRoom.editMessage(remoteMsg.id, 'Testing parity message (edited)')
    const editedRemoteMsg = await remoteRoom.getMessage(0)
    const editedLocalMsg = await localRoom.getMessage(0)
    assert.equal(editedRemoteMsg.body, 'Testing parity message (edited)')
    assert.equal(editedRemoteMsg.body, editedLocalMsg.body)

    await remoteRoom.toggleReaction(identity.id, remoteMsg.id, '🔥')

    // 7. Room metadata update parity
    await remoteSession.updateRoomMeta(remoteRoom.id, {
      name: 'Renamed Room',
      avatar: 'new-avatar',
      description: 'New Description'
    })

    assert.equal(remoteRoom.avatar, 'new-avatar')
    assert.equal(remoteRoom.description, 'New Description')

    const updatedRemoteBm = remoteSession.listBookmarks().find((b) => b.id === remoteRoom.id)!
    const updatedLocalBm = localSession.listBookmarks().find((b) => b.id === localRoom.id)!
    assert.equal(updatedRemoteBm.name, 'Renamed Room')
    assert.equal(updatedLocalBm.name, 'Renamed Room')

    // 8. Broadcast mode parity
    assert.equal(remoteRoom.isBroadcast, false)
    await remoteSession.setRoomBroadcast(remoteRoom.id, true)
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(remoteRoom.isBroadcast, true)
    assert.equal(localRoom.isBroadcast, true)

    // 9. Moderation state parity (mutes, bans, roles)
    const targetUser = 'dummy-member-id-1234'
    assert.equal(remoteRoom.isMuted(targetUser), false)
    assert.equal(localRoom.isMuted(targetUser), false)

    await remoteSession.muteMember(remoteRoom.id, targetUser)
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(remoteRoom.isMuted(targetUser), true)
    assert.equal(localRoom.isMuted(targetUser), true)
    assert.equal(remoteRoom.canPost(targetUser), false)

    await remoteSession.unmuteMember(remoteRoom.id, targetUser)
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(remoteRoom.isMuted(targetUser), false)
    assert.equal(localRoom.isMuted(targetUser), false)

    // Promote / Demote
    await remoteSession.promoteToModerator(remoteRoom.id, targetUser)
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(remoteRoom.isModerator(targetUser), true)
    assert.equal(localRoom.isModerator(targetUser), true)
    assert.equal(remoteRoom.canModerate(targetUser), true)

    await remoteSession.demoteModerator(remoteRoom.id, targetUser)
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(remoteRoom.isModerator(targetUser), false)
    assert.equal(localRoom.isModerator(targetUser), false)

    // 10. Directory parity
    assert.deepEqual(remoteSession.listDirectory(), localSession.listDirectory())
    remoteSession.removeFromDirectory(remoteRoom.id)
    assert.equal(remoteSession.listDirectory().length, 0)
  } catch (err) {
    console.error('PARITY TEST FAILURE:', err)
    throw err
  } finally {
    try {
      await localSession.close()
    } catch {}
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {}
  }
})
