/**
 * Watchdog for the Zen websocket transport.
 *
 * Zen already reconnects sockets whose `onclose` fires and re-sends every
 * active subscription on the resulting "hi" handshake (mesh.js), but two
 * real-world failures slip through and leave the app silently detached from
 * the relays until the user refreshes the page — which is why messages can
 * appear "all at once" only after a refresh:
 *
 * 1. Half-open sockets. After laptop sleep, a mobile network switch or a
 *    NAT/proxy idle timeout, the TCP connection is dead but the browser
 *    never fires `onclose`. The wire stays at readyState OPEN and will
 *    never deliver another message, while the relay side has already
 *    dropped our subscriptions.
 * 2. Retry exhaustion. Zen's reconnect budget (`peer.retry`) decrements on
 *    rapid failures, and once it reaches 0 — or the peer gets tombstoned /
 *    flagged `_noReconnect` — Zen never dials that relay again.
 *
 * The watchdog runs on an interval and on tab-visible / network-online /
 * page-show / wake-from-sleep signals. It relies on `peer.SH`, which Zen's
 * mesh stamps on every inbound message (the 30s keepalive ping/pong keeps
 * it fresh on a healthy wire): a wire that is OPEN but silent past the
 * threshold is force-closed so Zen's own onclose → reconnect → "hi"
 * resubscribe path takes over. Dead peers with no pending reconnect are
 * revived by clearing the give-up flags and redialing.
 */

// Capacitor native app lifecycle — fires reliably on Android unlike the web
// visibility/pageshow events which the WebView may swallow after a long sleep.
let _capacitorAppPlugin: any = null;
async function getCapacitorApp() {
  if (_capacitorAppPlugin) return _capacitorAppPlugin;
  try {
    if (typeof window !== "undefined" && (window as any).Capacitor) {
      const mod = await import("@capacitor/app");
      _capacitorAppPlugin = mod.App;
    }
  } catch { /* not on Capacitor */ }
  return _capacitorAppPlugin;
}

const CHECK_INTERVAL_MS = 30_000;
// Zen keepalives ping every 30s; an OPEN wire silent for 75s (two missed
// pongs plus margin) is considered half-open.
const SILENT_WIRE_MS = 75_000;

interface ZenPeer {
  url?: string;
  wire?: { readyState: number; close: () => void } | null;
  retry?: number;
  defer?: ReturnType<typeof setTimeout> | null;
  met?: number;
  SH?: number; // stamped by mesh.hear on every inbound message
  _openAt?: number;
  _noReconnect?: boolean;
}

function tombVariants(url: string): string[] {
  return [
    url,
    url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://"),
    url.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://"),
  ];
}

// The packaged Zen export is a wrapper object (`_opt`, `_graphInstance`), not
// the graph chain, so `zen._` is undefined on it and the watchdog disabled
// itself on every start. The root — and its `opt.peers` table — is reachable
// through `back(-1)`.
function resolveRootOpt(zen: any): any {
  const candidates = [
    () => zen?._?.opt,
    () => zen?.back?.(-1)?._?.opt,
    () => zen?._graphInstance?.back?.(-1)?._?.opt,
    () => zen?._graphInstance?._?.opt,
  ];
  for (const get of candidates) {
    try {
      const opt = get();
      if (opt && typeof opt === "object") return opt;
    } catch {
      /* try the next accessor */
    }
  }
  return null;
}

export function startConnectionWatchdog(zen: any): () => void {
  const opt = resolveRootOpt(zen);
  if (!opt) {
    console.warn("[ConnHealth] Zen root opt not reachable, watchdog disabled");
    return () => {};
  }

  const revive = (peer: ZenPeer, reason: string) => {
    console.log(`[ConnHealth] Reviving relay ${peer.url} (${reason})`);
    peer._noReconnect = false;
    peer.retry = opt.retry + 1 || 60; // restore Zen's default reconnect budget
    if (peer.defer) {
      clearTimeout(peer.defer);
      peer.defer = null;
    }
    if (opt.tomb && peer.url) {
      for (const variant of tombVariants(peer.url)) opt.tomb.delete(variant);
    }
    try {
      opt.wire?.(peer);
    } catch (e) {
      console.warn(`[ConnHealth] Redial failed for ${peer.url}:`, e);
    }
  };

  const checkNow = () => {
    const peers: Record<string, ZenPeer> = opt.peers || {};
    const now = Date.now();
    for (const url of Object.keys(peers)) {
      const peer = peers[url];
      if (!peer || !peer.url) continue;
      const wire = peer.wire;

      // CONNECTING (0) or CLOSING (2): in transition, let the next tick judge.
      if (wire && (wire.readyState === 0 || wire.readyState === 2)) continue;

      if (!wire || wire.readyState === 3) {
        // Dead socket. If Zen has a reconnect already scheduled, trust it;
        // otherwise it has given up on this peer and we bring it back.
        if (!peer.defer) revive(peer, wire ? "socket closed" : "no socket");
        continue;
      }

      // OPEN: check for a half-open (silent) connection.
      const lastAlive = Math.max(peer.SH || 0, peer._openAt || 0);
      if (lastAlive && now - lastAlive > SILENT_WIRE_MS) {
        console.warn(
          `[ConnHealth] Relay ${url} silent for ${Math.round((now - lastAlive) / 1000)}s, forcing reconnect`,
        );
        try {
          wire.close(); // funnels into Zen's onclose → reconnect → resubscribe
        } catch {
          // a wire that can't even close gets redialed on the next tick
          peer.wire = null;
        }
      }
    }
  };

  let lastTick = Date.now();
  const interval = setInterval(() => {
    const now = Date.now();
    // A big gap between ticks means the machine slept — sockets are suspect.
    if (now - lastTick > CHECK_INTERVAL_MS * 2) {
      console.log("[ConnHealth] Timer jump detected (sleep/wake), checking relays");
    }
    lastTick = now;
    checkNow();
  }, CHECK_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState === "visible") checkNow();
  };
  const onWake = () => checkNow();

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onWake);
  window.addEventListener("pageshow", onWake);

  // Capacitor native resume — the single most reliable signal on Android.
  // The dynamic import above may not have resolved yet, so we set up the
  // listener asynchronously and store the handle for cleanup.
  let capacitorListenerHandle: { remove: () => Promise<void> } | null = null;
  getCapacitorApp().then((CapApp: any) => {
    if (!CapApp) return;
    CapApp.addListener("appStateChange", (state: { isActive: boolean }) => {
      if (state.isActive) {
        console.log("[ConnHealth] Capacitor appStateChange → active, checking relays");
        checkNow();
      }
    }).then((handle: any) => {
      capacitorListenerHandle = handle;
    });
  });

  return () => {
    clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onWake);
    window.removeEventListener("pageshow", onWake);
    capacitorListenerHandle?.remove();
  };
}
