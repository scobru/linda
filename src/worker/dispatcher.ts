import RPC from 'bare-rpc'
import type { Duplex } from 'streamx'
import { Session, type SessionEvents, type RoomBookmark } from '../app/session.js'
import type { Room, ChatMessage, FileAttachment, MemberInfo, RoomFile } from '../rooms/room.js'
import { LocalMediaServer } from '../files/media-server-node.js'
import b4a from 'b4a'
import { packFrame, unpackFrame } from '../transport/frame.js'
import type { RemoteRoomState } from '../transport/remote-room-view.js'
import type { RemoteSessionInitialState, RemoteSessionOpenOptions, WireIdentity } from '../transport/remote-session-view.js'
import { FORWARDED, FORWARDED_METHODS, type Effect, type ForwardedMethod } from '../app/session-contract.js'

export function extractRoomState(room: Room): RemoteRoomState & { roomId: string } {
  return {
    roomId: room.id,
    avatar: room.avatar,
    description: room.description,
    writable: room.writable,
    hasKey: room.hasKey,
    isBroadcast: room.isBroadcast,
    messageCount: room.messageCount,
    ownerId: room.ownerId,
    admins: room.listAdmins(),
    moderators: room.listModerators(),
    muted: room.listMuted(),
    banned: room.listBanned(),
    members: room.listMembers()
  }
}

export async function extractSessionState(session: Session): Promise<RemoteSessionInitialState> {
  const inviteLinks: [string, string][] = []
  for (const bookmark of session.listBookmarks()) {
    try {
      const link = session.inviteLinkFor(bookmark.id)
      if (link) inviteLinks.push([bookmark.id, link])
    } catch {
      // Room might not be open or device is not owner
    }
  }

  let fileStoreKeyHex: string | undefined
  try {
    const fsInst = await session.fileStore()
    if (fsInst?.key) {
      fileStoreKeyHex = b4a.toString(fsInst.key, 'hex')
    }
  } catch {}

  return {
    nickname: session.getNickname(),
    avatar: session.getAvatar(),
    wallpaper: session.getWallpaper(),
    appBackground: session.getAppBackground(),
    bookmarks: session.listBookmarks(),
    contacts: session.listContacts(),
    directory: session.listDirectory(),
    peerAvatars: [...session.listPeerAvatars().entries()],
    networkStatus: session.getNetworkStatus(),
    inviteLinks,
    fileStoreKeyHex
  }
}

/**
 * Handles incoming RPC requests from the desktop UI and dispatches them
 * to the underlying `Session` and `Room` instances.
 * Also pushes state change events back over the RPC stream.
 */
export class WorkerDispatcher {
  readonly rpc: RPC
  private session: Session | null = null
  private wiredRooms = new WeakSet<Room>()
  private mediaServer: Promise<LocalMediaServer> | null = null

  constructor(stream: Duplex, session?: Session) {
    if (session) {
      this.attachSession(session)
    }

    this.rpc = new RPC(stream as any, (req: any) => {
      if (!req.reply) return // incoming event, not request
      void this.handleRequest(req)
    })
  }

  attachSession(session: Session): void {
    this.session = session

    // Hook session events to push updates to client
    const events = (session as any).events as SessionEvents || {}

    const originalBookmarks = events.onBookmarksChange
    events.onBookmarksChange = () => {
      originalBookmarks?.()
      this.pushEvent('bookmarksChange', session.listBookmarks())
    }

    const originalContacts = events.onContactsChange
    events.onContactsChange = () => {
      originalContacts?.()
      this.pushEvent('contactsChange', session.listContacts())
    }

    const originalDirectory = events.onDirectoryChange
    events.onDirectoryChange = () => {
      originalDirectory?.()
      this.pushEvent('directoryChange', session.listDirectory())
    }

    const originalPresence = events.onPresence
    events.onPresence = (msg) => {
      originalPresence?.(msg)
      if (msg?.avatar) {
        this.pushEvent('peerAvatar', { userId: msg.userId, avatar: msg.avatar })
      }
      this.pushEvent('presence', msg)
    }

    const originalIncomingMessage = events.onIncomingMessage
    events.onIncomingMessage = (roomId, msg) => {
      originalIncomingMessage?.(roomId, msg)
      this.pushEvent('incomingMessage', { roomId, message: msg })
    }

    const originalTyping = events.onTyping
    events.onTyping = (msg) => {
      originalTyping?.(msg)
      this.pushEvent('typing', msg)
    }

    const originalReadReceipt = events.onReadReceipt
    events.onReadReceipt = (msg) => {
      originalReadReceipt?.(msg)
      this.pushEvent('readReceipt', msg)
    }

    // Both carry payloads that cannot cross — a live `PeerConnection`, a `Buffer` — and neither
    // needs to: the UI ignores the argument and only redraws. So the event travels empty, and
    // the network counters it redraws from ride along as fresh state.
    const originalPeerConnected = events.onPeerConnected
    events.onPeerConnected = (peer) => {
      originalPeerConnected?.(peer)
      this.pushEvent('peerConnected', { networkStatus: session.getNetworkStatus() })
    }

    const originalPeerDisconnected = events.onPeerDisconnected
    events.onPeerDisconnected = (publicKey) => {
      originalPeerDisconnected?.(publicKey)
      this.pushEvent('peerDisconnected', { networkStatus: session.getNetworkStatus() })
    }

    const originalIncomingCall = events.onIncomingCall
    events.onIncomingCall = (info) => {
      originalIncomingCall?.(info)
      this.pushEvent('incomingCall', info)
    }

    const originalCallStateChange = events.onCallStateChange
    events.onCallStateChange = (info) => {
      originalCallStateChange?.(info)
      this.pushEvent('callStateChange', info)
    }

    const originalCallEnded = events.onCallEnded
    events.onCallEnded = (info) => {
      originalCallEnded?.(info)
      this.pushEvent('callEnded', info)
    }

    const originalCallRemoteControl = events.onCallRemoteControl
    events.onCallRemoteControl = (callId, action) => {
      originalCallRemoteControl?.(callId, action)
      this.pushEvent('callRemoteControl', { callId, action })
    }

    const originalCallMediaFrame = events.onCallMediaFrame
    events.onCallMediaFrame = (frame) => {
      originalCallMediaFrame?.(frame)
      const { payload, ...rest } = frame
      this.pushEvent('callMediaFrame', rest, { field: 'payload', bytes: payload })
    }
  }

  /** Pushes an event to the client. `binaryField` names a property of `payload` whose bytes ride
   * the frame's binary tail instead of the JSON header — `JSON.stringify` turns a `Uint8Array`
   * into `{"0":255,…}`, an object with no `.buffer`, which is silent corruption rather than an
   * error. The client puts the tail back on that property before handing the payload to listeners. */
  pushEvent(event: string, payload?: unknown, binary?: { field: string; bytes: Uint8Array }): void {
    this.rpc
      .event(0)
      .send(packFrame({ event, payload, binaryField: binary?.field }, binary?.bytes) as any)
  }

  pushRoomState(room: Room): void {
    this.pushEvent('roomState', extractRoomState(room))
  }

  wireRoom(room: Room): void {
    if (this.wiredRooms.has(room)) return
    this.wiredRooms.add(room)

    room.onMessage((index) => {
      this.pushEvent('roomMessage', { roomId: room.id, index })
    })

    room.onFilesChange(() => {
      this.pushEvent('roomFilesChange', { roomId: room.id })
    })

    room.onKeyChange((epoch, keyHex) => {
      this.pushRoomState(room)
      this.pushEvent('roomKeyChange', { roomId: room.id, epoch, keyHex })
    })

    room.onWritableChange(() => {
      this.pushRoomState(room)
      this.pushEvent('roomWritableChange', { roomId: room.id })
    })

    room.onMetaChange(() => {
      this.pushRoomState(room)
    })

    this.pushRoomState(room)
  }

  private requireSession(): Session {
    if (!this.session) throw new Error('Worker session is not initialized')
    return this.session
  }

  private requireRoom(roomId: string): Room {
    const room = this.requireSession().getRoom(roomId)
    if (!room) throw new Error(`Unknown room ${roomId}`)
    this.wireRoom(room)
    return room
  }

  private async handleRequest(req: any): Promise<void> {
    try {
      // Inside the try, not above it. `unpackFrame` does a `JSON.parse` on bytes off a pipe, so a
      // truncated or corrupt frame throws here — and this method is invoked as `void
      // handleRequest(req)`, so that throw became an unhandled rejection and took the whole worker
      // process down. Answering a bad frame costs one line: `req.reply` belongs to the request, not
      // to anything the frame said, so it still works when nothing in the frame parsed.
      const { header, binary } = unpackFrame(req.data)
      const handler = this.handlers[header.method]
      if (!handler) throw new Error(`Unknown RPC method: ${header.method}`)
      const raw = await handler(...(header.args || []), binary)
      const isBinary = raw && typeof raw === 'object' && raw.__binary === true
      req.reply(
        packFrame(
          { ok: true, result: isBinary ? raw.result : raw },
          isBinary ? raw.binary : undefined
        )
      )
    } catch (err) {
      req.reply(packFrame({ ok: false, error: (err as Error).message || String(err) }))
    }
  }

  /**
   * Every plain forward, built from `FORWARDED` rather than typed out one by one. The spread is
   * an argument spread — `(...args)` in, `(...args)` on — so a mismatch between what the client
   * sends and what `Session` expects is not expressible here. That is the point: the three defects
   * this replaced were all a hand-written signature drifting from `Session`'s.
   */
  private forwardedHandlers(): Record<string, (...args: any[]) => any> {
    return Object.fromEntries(
      FORWARDED_METHODS.map((name: ForwardedMethod) => [
        `session.${name}`,
        async (...args: any[]) => {
          const session = this.requireSession()
          const result = await (session[name] as (...a: any[]) => any)(...args)
          const extra = this.applyEffect(FORWARDED[name], args)
          if (!extra) return result
          // Every method with a bookmark effect returns void today; if one ever returns a value,
          // the refreshed list still has to reach the client, so merge rather than pick.
          return result === undefined ? extra : { ...extra, ...(result as object) }
        }
      ])
    )
  }

  /**
   * Republishes what the call changed. See `Effect` in session-contract.ts for the four shapes and
   * the two invariants this relies on — the room id comes first, and a bookmark change answers
   * with the refreshed list.
   */
  private applyEffect(effect: Effect, args: any[]): { bookmarks: RoomBookmark[] } | null {
    if (effect === 'none') return null
    const session = this.requireSession()

    if (effect === 'roomState' || effect === 'roomState+bookmarks') {
      const room = session.getRoom(args[0])
      if (room) this.pushRoomState(room)
    }

    if (effect === 'bookmarks' || effect === 'roomState+bookmarks') {
      const bookmarks = session.listBookmarks()
      this.pushEvent('bookmarksChange', bookmarks)
      return { bookmarks }
    }

    return null
  }

  private handlers: Record<string, (...args: any[]) => any> = {
    ...this.forwardedHandlers(),

    /**
     * Opens the session inside the worker. Nothing else could: `entry.ts` starts the dispatcher
     * with no session, and every other handler needs one, so before this existed a worker-backed
     * UI could not get past its first call.
     *
     * Idempotent by design — the renderer re-sends it on reconnect, and a second open would strand
     * the first session holding the storage lock.
     */
    'session.open': async (identity: WireIdentity, storageDir: string, options?: RemoteSessionOpenOptions) => {
      if (this.session) return await extractSessionState(this.session)
      const session = await Session.create(
        {
          id: identity.id,
          publicKey: b4a.from(identity.publicKey, 'hex'),
          secretKey: b4a.from(identity.secretKey, 'hex')
        },
        storageDir,
        { events: {}, transport: { dhtPort: options?.dhtPort, bootstrap: options?.bootstrap } }
      )
      this.attachSession(session)
      for (const room of await session.reopenBookmarkedRooms()) this.wireRoom(room)
      return await extractSessionState(session)
    },

    'session.getState': async () => {
      return await extractSessionState(this.requireSession())
    },

    'session.close': async () => {
      if (this.mediaServer) {
        try { (await this.mediaServer).close() } catch {}
        this.mediaServer = null
      }
      await this.requireSession().close()
    },

    'session.createRoom': async (
      name: string,
      isPublic = false,
      avatar = '',
      description = '',
      broadcast = false
    ) => {
      const room = await this.requireSession().createRoom(name, isPublic, avatar, description, broadcast)
      this.wireRoom(room)
      let inviteLink = ''
      try {
        if (room.isOwner(this.requireSession().identity.id)) {
          inviteLink = this.requireSession().inviteLinkFor(room.id)
        }
      } catch {}
      const bookmarks = this.requireSession().listBookmarks()
      this.pushEvent('bookmarksChange', bookmarks)
      return { roomId: room.id, state: extractRoomState(room), inviteLink, bookmarks }
    },

    'session.ensurePersonalVault': async () => {
      const room = await this.requireSession().ensurePersonalVault()
      this.wireRoom(room)
      let inviteLink = ''
      try {
        if (room.isOwner(this.requireSession().identity.id)) {
          inviteLink = this.requireSession().inviteLinkFor(room.id)
        }
      } catch {}
      const bookmarks = this.requireSession().listBookmarks()
      this.pushEvent('bookmarksChange', bookmarks)
      return { roomId: room.id, state: extractRoomState(room), inviteLink, bookmarks }
    },

    'session.joinRoomByKey': async (
      name: string,
      invite: string,
      avatar?: string,
      description?: string
    ) => {
      const room = await this.requireSession().joinRoomByKey(name, invite, avatar, description)
      this.wireRoom(room)
      let inviteLink = ''
      try {
        if (room.isOwner(this.requireSession().identity.id)) {
          inviteLink = this.requireSession().inviteLinkFor(room.id)
        }
      } catch {}
      const bookmarks = this.requireSession().listBookmarks()
      this.pushEvent('bookmarksChange', bookmarks)
      return { roomId: room.id, state: extractRoomState(room), inviteLink, bookmarks }
    },

    'session.acceptContactInvite': async (invite: { from: string; name: string; key: string }) => {
      const room = await this.requireSession().acceptContactInvite(invite)
      this.wireRoom(room)
      let inviteLink = ''
      try {
        if (room.isOwner(this.requireSession().identity.id)) {
          inviteLink = this.requireSession().inviteLinkFor(room.id)
        }
      } catch {}
      const bookmarks = this.requireSession().listBookmarks()
      this.pushEvent('bookmarksChange', bookmarks)
      return { roomId: room.id, state: extractRoomState(room), inviteLink, bookmarks }
    },

    'session.reopenBookmarkedRooms': async () => {
      const rooms = await this.requireSession().reopenBookmarkedRooms()
      for (const room of rooms) this.wireRoom(room)
      const bookmarks = this.requireSession().listBookmarks()
      return rooms.map((room) => {
        let inviteLink = ''
        try {
          if (room.isOwner(this.requireSession().identity.id)) {
            inviteLink = this.requireSession().inviteLinkFor(room.id)
          }
        } catch {}
        return { roomId: room.id, state: extractRoomState(room), inviteLink, bookmarks }
      })
    },















    'session.regenerateInvite': (roomId: string) => {
      const link = this.requireSession().regenerateInvite(roomId)
      return { inviteLink: link }
    },



















    'files.download': async (driveKeyHex: string, drivePath: string) => {
      const buf = await this.requireSession().downloadFile(driveKeyHex, drivePath)
      if (!buf) {
        return { __binary: true, result: { found: false }, binary: new Uint8Array(0) }
      }
      return {
        __binary: true,
        result: { found: true },
        binary: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
      }
    },

    'files.upload': async (drivePath: string, binary: Uint8Array) => {
      const fileStore = await this.requireSession().fileStore()
      const shared = await fileStore.addBuffer(drivePath, b4a.from(binary))
      return {
        driveKey: b4a.toString(fileStore.key, 'hex'),
        path: shared.path,
        size: shared.size
      }
    },

    'media.url': async (driveKeyHex: string, drivePath: string) => {
      if (!this.mediaServer) {
        this.mediaServer = LocalMediaServer.start(this.requireSession())
      }
      return (await this.mediaServer).url(driveKeyHex, drivePath)
    },

    // Room methods
    'room.getState': (roomId: string) => {
      return extractRoomState(this.requireRoom(roomId))
    },

    'room.getMessage': async (roomId: string, index: number) => {
      return this.requireRoom(roomId).getMessage(index)
    },

    'room.messages': async (roomId: string, start?: number, end?: number) => {
      const room = this.requireRoom(roomId)
      const list: ChatMessage[] = []
      for await (const msg of room.messages(start, end)) {
        list.push(msg)
      }
      return list
    },

    'room.send': async (roomId: string, authorId: string, body: string, replyTo?: string) => {
      return this.requireRoom(roomId).send(authorId, body, replyTo)
    },

    'room.sendFile': async (
      roomId: string,
      authorId: string,
      file: FileAttachment,
      body = ''
    ) => {
      return this.requireRoom(roomId).sendFile(authorId, file, body)
    },

    'room.editMessage': async (roomId: string, messageId: string, body: string) => {
      await this.requireRoom(roomId).editMessage(messageId, body)
    },

    'room.toggleReaction': async (
      roomId: string,
      userId: string,
      messageId: string,
      emoji: string
    ) => {
      await this.requireRoom(roomId).toggleReaction(userId, messageId, emoji)
    },

    'room.listFiles': async (roomId: string) => {
      return this.requireRoom(roomId).listFiles()
    },

    // Call signaling & control methods



    'session.getActiveCall': async () => {
      return this.requireSession().getActiveCall()
    },


    'session.sendCallFrame': async (frame: any, binary?: Uint8Array) => {
      this.requireSession().sendCallFrame({ ...frame, payload: binary ?? new Uint8Array(0) })
    }
  }
}
