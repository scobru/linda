// ---------------------------------------------------------------------------
// How long a call to the backend may go unanswered before the UI gives up on it.
//
// Mobile worked this out and the desktop never did. The reasoning is mobile's and it is right, so
// it moves here rather than being written a second time: almost every call must stay unbounded,
// because a join waits on the DHT and a download waits on a peer, and putting a clock on those
// invents failures that the network was going to resolve on its own.
//
// The exception is the login path. Those are the calls a screen blocks on with nothing else to
// offer, so if the backend is gone or wedged the alternative to a deadline is "Unlocking..."
// forever, with no error and no way back. That was mobile's situation and it fixed it; it is still
// the desktop's, where `RpcClient.call` awaits `req.reply()` with no clock at all. A dead worker is
// covered on both — bare-rpc rejects in-flight calls when the pipe closes — but a worker that is
// alive and not answering is not.
// ---------------------------------------------------------------------------

/** Long enough that a slow phone deriving a passphrase key still fits inside it. */
const UNLOCK_MS = 60_000

/** Opening a session touches the network and the store, so it gets twice as long. */
const SESSION_MS = 120_000

/**
 * The login-path methods, under both names each bridge gave them.
 *
 * The desktop calls this `session.open` and mobile calls it `session.create` — one operation, two
 * names, because the two bridges were written separately. They are not renamed here: the name is on
 * the wire, and changing it is a change to both protocols rather than to a policy. Listing both is
 * the honest version of that, and it keeps this table correct for whichever client is asking.
 *
 * The desktop has no `identity.*` entries of its own: it unlocks in-process and only the session
 * crosses to the worker. They are listed anyway, because the table describes the policy rather than
 * one client's surface.
 */
const DEADLINES: Record<string, number> = {
  'identity.unlock': UNLOCK_MS,
  'identity.create': UNLOCK_MS,
  'identity.recover': UNLOCK_MS,
  'session.create': SESSION_MS,
  'session.open': SESSION_MS
}

/** How long this method may take, or undefined for the calls that are deliberately unbounded. */
export function rpcDeadlineMs(method: string): number | undefined {
  return DEADLINES[method]
}

/**
 * The message a missed deadline raises.
 *
 * Shared wording, and load-bearing: `classifySessionError` reads it as `runtime-stopped`, which is
 * how either shell turns this into a sentence telling the user to restart. Until now only mobile
 * could produce it, so the desktop half of that rule was unreachable.
 */
export function rpcTimeoutMessage(method: string): string {
  return `the background runtime did not answer ${method} in time`
}

/**
 * Rejects if `work` has not settled by this method's deadline; returns it untouched when the method
 * has none, so an unbounded call does not pay for a timer it will never use.
 */
export function withRpcDeadline<T>(work: Promise<T>, method: string): Promise<T> {
  const ms = rpcDeadlineMs(method)
  if (ms === undefined) return work

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(rpcTimeoutMessage(method))), ms)
    // A pending deadline is not a reason to keep a runtime alive. Node's timer has `unref`; the
    // browser's and React Native's are numbers and simply do not, which the optional call handles.
    ;(timer as unknown as { unref?: () => void }).unref?.()
    work.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (err) => { clearTimeout(timer); reject(err) }
    )
  })
}
