// Runs inside the Bare runtime (react-native-bare-kit Worklet), not the RN/Hermes thread.
// Bundled by scripts/build-worklet.mjs (esbuild -> bare-pack --linked) into worklet/dist/worklet.bundle.cjs.
// Protocol over BareKit.IPC: newline-delimited JSON.
//   request:  {id, method, args}
//   response: {id, ok:true, result} | {id, ok:false, error}
//   push:     {event, payload}
import b4a from 'b4a'
import fs from 'node:fs'
import { identityExists, createIdentity, unlockIdentity, recoverIdentity, pairIdentity, validateMnemonic, revealMnemonic, WrongPassphraseError, type Identity } from '../../src/identity/index.js'
import { joinPairing, decodePairingCode } from '../../src/identity/pairing.js'
import { Session, type SessionEvents } from '../../src/app/session.js'
import type { Room } from '../../src/rooms/room.js'
import { RemoteDrive } from '../../src/files/remote.js'
import type { CallSignalMessage } from '../../src/network/encoding.js'

declare const BareKit: { IPC: { on(event: 'data', cb: (chunk: Uint8Array) => void): void; write(data: Uint8Array): void } }

const { IPC } = BareKit

let identity: Identity | null = null
let session: Session | null = null
let storageDir = ''
const wiredRooms = new Set<string>()

function send(frame: unknown): void {
  IPC.write(b4a.from(JSON.stringify(frame) + '\n', 'utf8'))
}

function pushEvent(event: string, payload?: unknown): void {
  send({ event, payload })
}

function requireIdentity(): Identity {
  if (!identity) throw new Error('no identity loaded')
  return identity
}

function requireSession(): Session {
  if (!session) throw new Error('session not created')
  return session
}

function pushRoomState(room: Room): void {
  pushEvent('roomState', { roomId: room.id, writable: room.writable, hasKey: room.hasKey })
}

function wireRoom(room: Room): void {
  if (wiredRooms.has(room.id)) return
  wiredRooms.add(room.id)
  room.onMessage((index) => pushEvent('roomMessage', { roomId: room.id, index }))
  room.onWritableChange(() => pushRoomState(room))
  room.onKeyChange(() => pushRoomState(room))
  pushRoomState(room)
}

function requireRoom(roomId: string): Room {
  const room = requireSession().getRoom(roomId)
  if (!room) throw new Error(`unknown room ${roomId}`)
  wireRoom(room)
  return room
}

const methods: Record<string, (...args: any[]) => any> = {
  'identity.exists': (dir: string) => identityExists(dir),

  'identity.create': (passphrase: string, dir: string) => {
    const { identity: id, mnemonic } = createIdentity(passphrase, dir)
    identity = id
    return { id: id.id, mnemonic }
  },

  'identity.unlock': (passphrase: string, dir: string) => {
    try {
      identity = unlockIdentity(passphrase, dir)
    } catch (err) {
      if (err instanceof WrongPassphraseError) throw new Error('wrong passphrase')
      throw err
    }
    return { id: identity.id }
  },

  'identity.recover': (mnemonic: string, passphrase: string, dir: string) => {
    if (!validateMnemonic(mnemonic)) throw new Error('invalid recovery phrase')
    identity = recoverIdentity(mnemonic, passphrase, dir)
    return { id: identity.id }
  },

  'identity.validateMnemonic': (mnemonic: string) => validateMnemonic(mnemonic),

  'identity.revealSecretKey': () => b4a.toString(requireIdentity().secretKey, 'hex'),

  'identity.revealMnemonic': (passphrase: string, dir: string) => revealMnemonic(passphrase, dir),

  'identity.resetDevice': async (dir: string) => {
    if (session) {
      await session.close()
      session = null
    }
    identity = null
    fs.rmSync(dir, { recursive: true, force: true })
  },

  'identity.pair': async (code: string, passphrase: string, dir: string) => {
    const parsed = decodePairingCode(code)
    if (!parsed) throw new Error('invalid pairing code')
    const keypair = await joinPairing(parsed)
    identity = pairIdentity(keypair, passphrase, dir)
    return { id: identity.id }
  },

  'session.create': async (dir: string) => {
    const events: SessionEvents = {
      onPresence: (m) => pushEvent('presence', m),
      onPeerConnected: () => pushEvent('peerConnected'),
      onPeerDisconnected: (pk) => pushEvent('peerDisconnected', { userId: b4a.toString(pk, 'hex') }),
      onContactsChange: () => pushEvent('contactsChange'),
      onDirectoryChange: () => pushEvent('directoryChange'),
      onIncomingMessage: (roomId, message) => pushEvent('incomingMessage', { roomId, message }),
      onCallSignal: (m) => pushEvent('callSignal', m),
      onTyping: (m) => pushEvent('typing', m),
      onReadReceipt: (m) => pushEvent('readReceipt', m)
    }
    storageDir = dir
    session = await Session.create(requireIdentity(), dir, events)
    return {
      nickname: session.getNickname(),
      avatar: session.getAvatar(),
      bookmarks: session.listBookmarks(),
      contacts: session.listContacts(),
      peerAvatars: [...session.listPeerAvatars()]
    }
  },

  'session.reopenBookmarkedRooms': async () => {
    const rooms = await requireSession().reopenBookmarkedRooms()
    for (const room of rooms) wireRoom(room)
  },

  'session.listBookmarks': () => requireSession().listBookmarks(),

  // Bookmark + latest-message-time per room, for the room list's unread dot/preview/sort.
  // Mirrors desktop's own full-history scan (app-shell.ts notifyIncomingMessage backfill) — same cost, same result.
  'session.listRoomSummaries': async () => {
    const session = requireSession()
    const summaries = []
    for (const bookmark of session.listBookmarks()) {
      const room = session.getRoom(bookmark.id)
      let lastMessageTime: number | null = null
      let lastMessageText: string | null = null
      let lastMessageAuthor: string | null = null
      if (room) {
        for await (const m of room.messages()) {
          if (m.deleted) continue
          lastMessageTime = m.timestamp
          lastMessageText = m.file ? `Shared ${m.file.name}` : m.body
          lastMessageAuthor = m.authorId
        }
      }
      summaries.push({ ...bookmark, lastMessageTime, lastMessageText, lastMessageAuthor })
    }
    return summaries
  },

  'session.markRoomRead': (roomId: string) => requireSession().markRoomRead(roomId),
  'session.listContacts': () => requireSession().listContacts(),
  'session.getNickname': () => requireSession().getNickname(),
  'session.getAvatar': () => requireSession().getAvatar(),
  'session.listPeerAvatars': () => [...requireSession().listPeerAvatars()],
  'session.setNickname': (nickname: string) => requireSession().setNickname(nickname),
  'session.setAvatar': (avatar: string) => requireSession().setAvatar(avatar),

  'session.createRoom': async (name: string, isPublic: boolean, avatar: string, description: string) => {
    const room = await requireSession().createRoom(name, isPublic, avatar, description)
    wireRoom(room)
    return { roomId: room.id }
  },

  'session.joinRoomByKey': async (name: string, key: string) => {
    const room = await requireSession().joinRoomByKey(name, key)
    wireRoom(room)
    return { roomId: room.id }
  },

  'session.sendContactRequest': (userId: string, nickname: string) => requireSession().sendContactRequest(userId, nickname),
  'session.respondToContact': (userId: string, accept: boolean) => requireSession().respondToContact(userId, accept),
  'session.deleteContact': (userId: string) => requireSession().deleteContact(userId),
  'session.deleteRoom': (roomId: string) => requireSession().deleteRoom(roomId),
  'session.listDirectory': () => requireSession().listDirectory(),
  'session.removeFromDirectory': (roomId: string) => requireSession().removeFromDirectory(roomId),
  'session.inviteLinkFor': (roomId: string) => requireSession().inviteLinkFor(roomId),
  'session.regenerateInvite': (roomId: string) => requireSession().regenerateInvite(roomId),
  'session.kickMember': (roomId: string, writerKeyHex: string) => requireSession().kickMember(roomId, writerKeyHex),
  'session.banMember': (roomId: string, writerKeyHex: string, identityId: string) => requireSession().banMember(roomId, writerKeyHex, identityId),
  'session.unbanMember': (roomId: string, identityId: string) => requireSession().unbanMember(roomId, identityId),
  'session.muteMember': (roomId: string, identityId: string) => requireSession().muteMember(roomId, identityId),
  'session.unmuteMember': (roomId: string, identityId: string) => requireSession().unmuteMember(roomId, identityId),
  'session.promoteToModerator': (roomId: string, identityId: string) => requireSession().promoteToModerator(roomId, identityId),
  'session.demoteModerator': (roomId: string, identityId: string) => requireSession().demoteModerator(roomId, identityId),

  'session.listConnectedPeerIds': () => [...requireSession().peers.keys()],

  'session.setZenPub': (zenPub: string) => requireSession().setZenPub(zenPub),
  'session.getPeerZenPub': (userId: string) => requireSession().getPeerZenPub(userId) ?? null,

  'session.sendCallSignal': (targetUserId: string, message: CallSignalMessage) => {
    const peer = requireSession().peers.get(targetUserId)
    if (!peer) throw new Error('peer not connected')
    peer.rpc.sendCallSignal(message)
  },

  // Explicit pull, not just the 'roomState' push from wireRoom — that push fires the instant
  // the room is created/joined, before RN has had a chance to construct the RoomProxy that
  // would listen for it, so it's silently lost. Rooms whose writable/hasKey never change again
  // afterward (e.g. a room you just created, already fully writable) would otherwise be stuck
  // showing as not-writable forever.
  'room.getState': (roomId: string) => {
    const room = requireRoom(roomId)
    return { writable: room.writable, hasKey: room.hasKey }
  },

  'room.listMembers': (roomId: string) => {
    const room = requireRoom(roomId)
    return {
      members: room.listMembers(),
      ownerId: room.ownerId,
      moderators: room.listModerators(),
      muted: room.listMuted(),
      banned: room.listBanned()
    }
  },

  'room.messages': async (roomId: string) => {
    const out = []
    for await (const msg of requireRoom(roomId).messages()) out.push(msg)
    return out
  },
  'room.getMessage': (roomId: string, index: number) => requireRoom(roomId).getMessage(index),
  'room.send': (roomId: string, authorId: string, body: string, replyTo?: string) => requireRoom(roomId).send(authorId, body, replyTo),
  'room.editMessage': (roomId: string, id: string, body: string) => requireRoom(roomId).editMessage(id, body),
  'room.deleteMessage': (roomId: string, id: string) => requireRoom(roomId).deleteMessage(id),
  'room.toggleReaction': (roomId: string, userId: string, messageId: string, emoji: string) => requireRoom(roomId).toggleReaction(userId, messageId, emoji),

  'room.sendFile': async (roomId: string, authorId: string, name: string, mimeType: string, base64: string, thumbnail?: string, body = '') => {
    const room = requireRoom(roomId)
    const fileStore = await requireSession().fileStore()
    const drivePath = `/${roomId}/${Date.now()}-${name}`
    const shared = await fileStore.addBuffer(drivePath, b4a.from(base64, 'base64'))
    return room.sendFile(authorId, { driveKey: b4a.toString(fileStore.key, 'hex'), path: shared.path, size: shared.size, name, mimeType, thumbnail }, body)
  },

  'room.sendTyping': (roomId: string, userId: string, typing: boolean) => {
    for (const peer of requireSession().peers.values()) peer.rpc.sendTyping({ roomId, userId, typing })
  },

  'room.sendReadReceipt': (roomId: string, userId: string, messageId: string) => {
    for (const peer of requireSession().peers.values()) peer.rpc.sendReadReceipt({ roomId, userId, messageId })
  },

  'files.download': async (driveKeyHex: string, drivePath: string) => {
    const drive = await RemoteDrive.connect(storageDir, b4a.from(driveKeyHex, 'hex'))
    try {
      const buffer = await drive.downloadFile(drivePath)
      return buffer ? b4a.toString(buffer, 'base64') : null
    } finally {
      await drive.close()
    }
  }
}

let buf = ''
IPC.on('data', (chunk: Uint8Array) => {
  buf += b4a.toString(chunk, 'utf8')
  let idx: number
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx)
    buf = buf.slice(idx + 1)
    if (!line) continue

    void (async () => {
      let id: number | undefined
      try {
        const req = JSON.parse(line) as { id: number; method: string; args: unknown[] }
        id = req.id
        const handler = methods[req.method]
        if (!handler) throw new Error(`unknown method ${req.method}`)
        const result = await handler(...req.args)
        send({ id, ok: true, result })
      } catch (err) {
        send({ id, ok: false, error: (err as Error).message || String(err) })
      }
    })()
  }
})

pushEvent('ready')
