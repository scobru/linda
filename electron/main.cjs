const { app, BrowserWindow, Menu, session, desktopCapturer, shell } = require('electron')
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
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  })
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer] ${message} (${sourceId}:${line})`)
  })
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
  // chromeless Electron window instead of the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.loadFile(path.join(__dirname, '..', 'index.html'))
}

app.whenReady().then(() => {
  // Electron doesn't implement the web getDisplayMedia() prompt on its own — without this
  // handler, navigator.mediaDevices.getDisplayMedia() in the renderer just rejects and the
  // screen-share button silently does nothing. useSystemPicker covers macOS 15+; everywhere
  // else (including Windows, this app's main target) the handler still runs, so fall back to
  // capturing the primary screen directly via desktopCapturer — no in-app source picker exists.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback(sources[0] ? { video: sources[0] } : {})
    })
  }, { useSystemPicker: true })

  // getUserMedia({ audio: true }) for voice messages. Electron denies media permission
  // requests by default, so without this the recorder rejects and the mic button does nothing.
  // Only media is granted — anything else keeps the default deny.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'audioCapture')
  })

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
