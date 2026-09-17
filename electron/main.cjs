const { app, BrowserWindow, Menu, session, shell, clipboard, ipcMain, systemPreferences } = require('electron')
const path = require('node:path')

function createWindow() {
  Menu.setApplicationMenu(null)

  const win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#0b0f14',
    autoHideMenuBar: true,
    // The renderer draws its own titlebar (app-topbar, with -webkit-app-region: drag and its own
    // min/max/close buttons) to match Keet's chromeless look instead of the grey native Windows
    // titlebar — frame: false is what actually turns that off; the renderer side was already built.
    frame: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      // A call's video capture is a `setInterval` in the renderer (`src/call/media-pipeline.ts`),
      // and Chromium throttles renderer timers to roughly 1 Hz once a window is hidden or fully
      // occluded. So the moment you tabbed away from a call — to read something, to share a link —
      // your camera went from 20 fps to about one frame a second for the person on the other end,
      // with nothing on screen to say why. Audio survived it (the AudioWorklet runs on the audio
      // thread, which is not throttled), which is exactly what made the report read as "the video
      // lags" rather than "the window is in the background".
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })

  ipcMain.on('window:is-maximized', (event) => { event.returnValue = win.isMaximized() })
  ipcMain.on('window:minimize', () => win.minimize())
  ipcMain.on('window:maximize-toggle', () => (win.isMaximized() ? win.unmaximize() : win.maximize()))
  ipcMain.on('window:close', () => win.close())
  win.on('maximize', () => win.webContents.send('window:maximized-change', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized-change', false))
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer] ${message} (${sourceId}:${line})`)
  })
  // Windows sometimes activates the BrowserWindow (OS-level) without syncing focus to the
  // renderer — the window looks active but the first click into an input never actually
  // focuses it, so no caret shows until the window regains real focus. Forcing it here closes
  // that gap.
  win.on('focus', () => win.webContents.focus())
  // Menu.setApplicationMenu(null) above also removes the default menu's "Toggle Developer
  // Tools" item, which is what F12/Ctrl+Shift+I are normally wired to — without this they do
  // nothing and there's no way to see renderer console output in a packaged build.
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools()
    }
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.log('[renderer crashed]', details)
  })
  // target="_blank" links (e.g. the About link to the repo) would otherwise open a second,
  // chromeless Electron window instead of the user's browser. linda-pear:// invite links are the
  // same target="_blank" markup, but the scheme isn't registered with Windows, so handing those
  // to shell.openExternal just surfaced "Windows can't find an app to open this link" — route
  // them to the renderer instead, which opens the room in-app (see app-shell.ts).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('linda-pear://')) {
      win.webContents.send('open-invite-link', url)
    } else {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.loadFile(path.join(__dirname, '..', 'index.html'))
}

app.whenReady().then(() => {
  // getUserMedia({ audio: true }) for voice messages needs an explicit grant. Installing a
  // handler *replaces* Electron's default, which granted the rest — an earlier version of this
  // handler returned false for everything but media and so silently revoked clipboard writes
  // and notifications along with it. Everything the app actually uses has to be listed here.
  const ALLOWED_PERMISSIONS = new Set([
    'media',            // microphone, for voice messages
    'audioCapture',
    'videoCapture',     // webcam, for video calls
    'camera',
    'microphone',
    'display-capture',
    'clipboard-read',
    'clipboard-write',
    'clipboard-sanitized-write',
    'notifications'
  ])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (!ALLOWED_PERMISSIONS.has(permission)) {
      callback(false)
      return
    }

    // On macOS, explicitly trigger OS permission prompt if not yet decided
    if (process.platform === 'darwin' && (permission === 'camera' || permission === 'videoCapture' || permission === 'microphone' || permission === 'audioCapture' || permission === 'media')) {
      const mediaType = (permission === 'camera' || permission === 'videoCapture') ? 'camera' : 'microphone'
      systemPreferences.askForMediaAccess(mediaType)
        .then((granted) => callback(granted))
        .catch(() => callback(true))
      return
    }

    callback(true)
  })
  // Some clipboard/notification paths go through the synchronous check instead, which has its
  // own default and would otherwise still refuse.
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))

  // Copy requests from the renderer (see preload.cjs) — the main process is the only place
  // Electron still supports touching the clipboard from.
  ipcMain.on('clipboard:write', (_event, text) => clipboard.writeText(String(text)))

  // Desktop media permissions IPC for renderer queries & explicit activation
  ipcMain.handle('media:request-permission', async (_event, type) => {
    if (process.platform === 'darwin') {
      try {
        return await systemPreferences.askForMediaAccess(type)
      } catch (err) {
        console.warn(`[main] Failed to askForMediaAccess for ${type}:`, err)
        return false
      }
    }
    return true
  })

  ipcMain.handle('media:get-permission-status', async (_event, type) => {
    if (process.platform === 'darwin' || process.platform === 'win32') {
      try {
        return systemPreferences.getMediaAccessStatus(type)
      } catch {
        return 'unknown'
      }
    }
    return 'granted'
  })

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
