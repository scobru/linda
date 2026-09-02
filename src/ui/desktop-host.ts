/**
 * The one place that knows which desktop runtime the UI is running inside.
 *
 * There are two, and they are not the same shape:
 *
 * - **Electron** (`electron/main.cjs`) — window controls go over IPC to the main process, the
 *   clipboard is bridged in by the preload script, and `linda-pear://` links are intercepted by
 *   `setWindowOpenHandler` and forwarded back here.
 * - **Pear** (`pear run .`) — there is no main process and no preload. Window controls are
 *   methods on `Pear.Window.self`, and they are *asynchronous*, which the rendering code cannot
 *   be (see `isMaximized` below). Nothing intercepts link clicks, so this does it in the page.
 *
 * A third case, a plain browser, exists only for `dist/app.js` opened outside either runtime; it
 * draws no titlebar and falls back to the web clipboard. Keeping the three behind one interface
 * is what stops runtime checks from spreading back through `app-shell.ts`, where every `if
 * (electron)` was also, silently, an "and therefore no titlebar under Pear".
 */
export interface DesktopHost {
  readonly kind: 'electron' | 'pear' | 'web'
  /**
   * Whether the host gives us a frameless window, and so whether the app has to draw its own
   * minimize/maximize/close buttons. Both Electron (`frame: false`) and Pear (frameless by
   * default, which is why Pear ships its own `<pear-ctrl>` element) do.
   */
  readonly ownsTitlebar: boolean
  /**
   * Synchronous by necessity: the maximize button's icon is chosen inside `innerHTML = ...`
   * string building, which cannot await. Hosts whose real API is async keep a cached value
   * refreshed by `onMaximizedChange`.
   */
  isMaximized(): boolean
  minimize(): void
  toggleMaximize(): void
  close(): void
  /** Fires when the window is maximized or restored, including by the OS (double-click, snap). */
  onMaximizedChange(listener: (maximized: boolean) => void): void
  /** A `linda-pear://` link the user clicked, which opens a room in-app rather than in a browser. */
  onInviteLink(listener: (url: string) => void): void
  copyToClipboard(text: string): void
}

/**
 * `navigator.clipboard` is gated on a permission grant and refuses outright with "Document is not
 * focused" whenever the window isn't the focused one — which includes the common case of DevTools
 * holding focus. Every host that has something better uses it; this is the floor, and the
 * `execCommand` fallback covers the not-focused case that the async API rejects.
 */
function webClipboardWrite(text: string): void {
  if (!navigator.clipboard) return legacyClipboardWrite(text)
  void navigator.clipboard.writeText(text).catch(() => legacyClipboardWrite(text))
}

function legacyClipboardWrite(text: string): void {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try { document.execCommand('copy') } catch { /* nothing better to offer */ }
  area.remove()
}

/**
 * Shared by the Pear and browser hosts: neither has anything upstream of the page intercepting
 * link clicks, so a `linda-pear://` link would either be handed to the OS (which has no handler
 * registered for the scheme) or, under Pear, opened in the default browser by `window.open`.
 */
function interceptInviteLinkClicks(listener: (url: string) => void): void {
  document.addEventListener('click', (event) => {
    const anchor = (event.target as Element | null)?.closest?.('a[href^="linda-pear://"]')
    if (!anchor) return
    event.preventDefault()
    listener(anchor.getAttribute('href') as string)
  }, true)
}

class ElectronHost implements DesktopHost {
  readonly kind = 'electron' as const
  readonly ownsTitlebar = true

  constructor(private readonly ipc: ElectronIpc) {}

  isMaximized(): boolean { return this.ipc.sendSync('window:is-maximized') === true }
  minimize(): void { this.ipc.send('window:minimize') }
  toggleMaximize(): void { this.ipc.send('window:maximize-toggle') }
  close(): void { this.ipc.send('window:close') }

  onMaximizedChange(listener: (maximized: boolean) => void): void {
    this.ipc.on('window:maximized-change', (_event: unknown, maximized: boolean) => listener(maximized))
  }

  onInviteLink(listener: (url: string) => void): void {
    this.ipc.on('open-invite-link', (_event: unknown, url: string) => listener(url))
  }

  /**
   * The renderer's own clipboard is deprecated in Electron and slated for removal, and with
   * `contextIsolation` off the preload shares this context, so reaching it here counts the same.
   * The preload hands the write to the main process over IPC instead, which is the supported path.
   */
  copyToClipboard(text: string): void {
    const bridged = (window as unknown as { lindaClipboard?: { writeText(t: string): void } }).lindaClipboard
    if (bridged) bridged.writeText(text)
    else webClipboardWrite(text)
  }
}

class PearHost implements DesktopHost {
  readonly kind = 'pear' as const
  readonly ownsTitlebar = true

  /**
   * `Pear.Window.self.isMaximized()` returns a promise and the render path cannot await one, so
   * the answer is cached and re-read whenever it could have changed. Starting from `false` is
   * safe: `pear.gui` in package.json opens the window at a fixed size, not maximized.
   */
  private maximized = false
  private readonly listeners: Array<(maximized: boolean) => void> = []

  constructor(private readonly win: PearWindowSelf) {
    // A maximize or restore always changes the window size, and there is no dedicated event for
    // it in the Pear API — so a resize is the cue to go ask. Ordinary drag-resizes also land
    // here, which is why the refresh only notifies on an actual change.
    window.addEventListener('resize', () => { void this.refresh() })
    void this.refresh()
  }

  private async refresh(): Promise<void> {
    const maximized = (await this.win.isMaximized()) === true
    if (maximized === this.maximized) return
    this.maximized = maximized
    for (const listener of this.listeners) listener(maximized)
  }

  isMaximized(): boolean { return this.maximized }
  minimize(): void { void this.win.minimize() }
  close(): void { void this.win.close() }

  toggleMaximize(): void {
    // Reads the cache rather than asking, so the click acts on what the button was showing.
    void (this.maximized ? this.win.restore() : this.win.maximize()).then(() => this.refresh())
  }

  onMaximizedChange(listener: (maximized: boolean) => void): void { this.listeners.push(listener) }
  onInviteLink(listener: (url: string) => void): void { interceptInviteLinkClicks(listener) }
  copyToClipboard(text: string): void { webClipboardWrite(text) }
}

class WebHost implements DesktopHost {
  readonly kind = 'web' as const
  readonly ownsTitlebar = false

  isMaximized(): boolean { return false }
  minimize(): void {}
  toggleMaximize(): void {}
  close(): void {}
  onMaximizedChange(): void {}
  onInviteLink(listener: (url: string) => void): void { interceptInviteLinkClicks(listener) }
  copyToClipboard(text: string): void { webClipboardWrite(text) }
}

type ElectronIpc = {
  send(channel: string, ...args: unknown[]): void
  sendSync(channel: string, ...args: unknown[]): unknown
  on(channel: string, listener: (...args: any[]) => void): void
}

type PearWindowSelf = {
  isMaximized(): Promise<boolean>
  minimize(): Promise<boolean>
  maximize(): Promise<boolean>
  restore(): Promise<boolean>
  close(): Promise<boolean>
}

let host: DesktopHost | null = null

export function desktopHost(): DesktopHost {
  if (host) return host
  // `require` exists only in the Electron renderer: Pear resolves modules through Bare's ESM
  // loader and has no CommonJS at all, so this must stay an optional call rather than an import.
  const ipc: ElectronIpc | undefined = (globalThis as any).require?.('electron')?.ipcRenderer
  if (ipc) host = new ElectronHost(ipc)
  else {
    // Feature-detected rather than assumed from `typeof Pear`: the window API moved out of the
    // `Pear` global in Pear v2 (it lives on the `pear-electron` UI library now), and losing the
    // titlebar buttons entirely is a better failure than calling methods that aren't there.
    const self = typeof Pear !== 'undefined' ? (Pear as { Window?: { self?: PearWindowSelf } }).Window?.self : undefined
    host = self ? new PearHost(self) : new WebHost()
  }
  return host
}
