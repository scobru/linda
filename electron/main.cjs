const { app, BrowserWindow, Menu } = require('electron')
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
  win.webContents.on('render-process-gone', (_event, details) => {
    console.log('[renderer crashed]', details)
  })

  win.loadFile(path.join(__dirname, '..', 'index.html'))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
