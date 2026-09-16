import Protomux from 'protomux'
import type { Encoding } from 'compact-encoding'
import type { Duplex } from 'node:stream'

// ---------------------------------------------------------------------------
// A Protomux channel from one ordered declaration.
//
// Both channels were written the same way twice: a handler interface, a sender interface, one
// `addMessage` block per message, one `send` arrow per message, and a `safeSend` wrapper each.
// 195 lines over thirteen messages, and three separate places to remember when adding one.
//
// The order is the part worth protecting. Protomux assigns a message's wire id from its position:
// `addMessage` does `const type = this.messages.length`. Two builds that register the same
// messages in a different order therefore disagree about what every id means — the same silent,
// peer-to-peer-only corruption that `message-encoding.ts` closed inside a frame, one level up.
// A declaration list makes that order a single visible fact instead of the incidental order of
// eight statements.
// ---------------------------------------------------------------------------

/** One message on a channel: how it is encoded, and whether it names its own sender. */
export interface MessageSpec<T> {
  encoding: Encoding<T>
  /**
   * The field carrying the sender's self-declared identity id, for messages that have one.
   *
   * `fromId` and friends are just bytes in a frame, but the connection they arrive on is
   * Noise-authenticated, and a peer's noise key *is* its identity id (`identity/index.ts` derives
   * the id as the hex of the same public key the swarm connects with). So a declared sender that
   * disagrees with the connection is a forgery, and `attach` drops it before any handler sees it.
   *
   * Leaving this out is a statement too: `roomAnnounce.authorId` names the room's author, not the
   * peer that sent it — a peer re-announces its whole directory on connect, including rooms
   * somebody else made — so a guard there would break directory gossip rather than protect it.
   */
  sender?: keyof T & string
}

/** A channel's messages, in registration order. The order is the wire contract — see above. */
export type ChannelMessages = readonly (readonly [string, MessageSpec<any>])[]

type Payload<S> = S extends MessageSpec<infer T> ? T : never
type Named<M extends ChannelMessages> = { [E in M[number] as E[0]]: Payload<E[1]> }

/** `[['typing', …]]` gives `sendTyping(message: TypingMessage): void`. */
export type ChannelSender<M extends ChannelMessages> = {
  [K in keyof Named<M> & string as `send${Capitalize<K>}`]: (message: Named<M>[K]) => void
} & { close(): void }

/** …and `onTyping?(message: TypingMessage, channel): void`. The channel is passed to every handler
 *  so a message can be answered on the connection it arrived on, which is what the write-request
 *  handler does with the room key. */
export type ChannelHandlers<M extends ChannelMessages> = {
  [K in keyof Named<M> & string as `on${Capitalize<K>}`]?: (message: Named<M>[K], channel: ChannelSender<M>) => void
}

export interface ProtocolChannel<M extends ChannelMessages> {
  readonly protocol: string
  readonly messages: M
  /**
   * Opens the channel on an already-authenticated socket.
   *
   * `remoteIdentityId` is the connection's noise key as hex. Pass it to enforce the `sender`
   * declarations above; omit it and nothing is dropped, which is what a test harness or a
   * yet-to-be-authenticated socket wants.
   */
  attach(socket: Duplex, handlers?: ChannelHandlers<M>, remoteIdentityId?: string): ChannelSender<M>
}

const capitalize = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1)

export function protocolChannel<const M extends ChannelMessages>(protocol: string, messages: M): ProtocolChannel<M> {
  const attach = (
    socket: Duplex,
    handlers: ChannelHandlers<M> = {} as ChannelHandlers<M>,
    remoteIdentityId?: string
  ): ChannelSender<M> => {
    const mux = Protomux.from(socket)
    const muxChannel = mux.createChannel({ protocol })
    muxChannel.open()

    // Forward-referenced: assigned before `attach` returns, and the handlers below only run once
    // a message arrives (async), so it is always defined by the time one reads it.
    let channel: ChannelSender<M>
    const sender: Record<string, unknown> = { close: () => muxChannel.close() }
    const table = handlers as Record<string, ((message: unknown, channel: ChannelSender<M>) => void) | undefined>

    for (const [name, spec] of messages) {
      const registered = muxChannel.addMessage({
        encoding: spec.encoding,
        onmessage: (message: Record<string, unknown>) => {
          if (spec.sender && remoteIdentityId !== undefined && message[spec.sender] !== remoteIdentityId) return
          // Read at delivery rather than at attach, so a caller that swaps a handler afterwards
          // still has it called — the worker dispatcher wraps `onPresence` that way.
          table[`on${capitalize(name)}`]?.(message, channel)
        }
      })

      // Every send is fire-and-forget best-effort — no caller awaits a result or checks a return
      // value. The peer's socket can die at any point between an `onConnection` snapshot (e.g. the
      // write-request retry timer iterating `this.peers` every 15s) and the `send` actually
      // running: `.close` only fires once the stream fully finishes, so a channel can already be
      // unusable and still throw synchronously on `send` in that window — a flaky mobile
      // connection hits it far more than a stable desktop one. Uncaught, that took the whole
      // session down instead of losing one message to a peer that was already on its way out.
      sender[`send${capitalize(name)}`] = (message: unknown): void => {
        try {
          registered.send(message)
        } catch (err) {
          console.warn(`[${protocol}] send on a closing peer channel:`, (err as Error).message)
        }
      }
    }

    channel = sender as ChannelSender<M>
    return channel
  }

  return { protocol, messages, attach }
}
