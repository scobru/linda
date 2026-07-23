import { app, BrowserWindow, Menu, shell, nativeTheme } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Keep a global reference of the window object to prevent garbage collection
let mainWindow = null;

const isDev = process.env.NODE_ENV === 'development';

/**
 * Creates the main application window.
 */
function createWindow() {
  // Force dark theme to match Linda's OLED black design
  nativeTheme.themeSource = 'dark';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000', // OLED black — matches Linda's design
    title: 'Linda',
    icon: path.join(__dirname, 'resources/icon.png'),
    webPreferences: {
      // Security: disable Node integration in renderer
      nodeIntegration: false,
      // Security: enable context isolation
      contextIsolation: true,
      // Security: disable remote module
      enableRemoteModule: false,
      // Load the preload script
      preload: path.join(__dirname, 'preload.js'),
      // Allow WebRTC (required for P2P file transfers)
      webSecurity: true,
      // Allow accessing camera/microphone for QR scanner
      allowRunningInsecureContent: false,
    },
    // Frameless / custom titlebar option — keep native for now
    frame: true,
    // Start hidden, show when ready to avoid white flash
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Log renderer process crashes or hangs for better troubleshooting
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error(`[Electron] Renderer process gone! Reason: ${details.reason}, Exit Code: ${details.exitCode}`);
  });

  mainWindow.on('unresponsive', () => {
    console.warn('[Electron] Main window became unresponsive!');
  });

  // Show window gracefully when content is ready (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      // Open DevTools in integrated mode rather than detached to avoid crashes on reload
      mainWindow.webContents.openDevTools({ mode: 'right' });
    }
  });

  // Load the app
  if (isDev) {
    // Support dynamic development port to prevent mismatch if default port is occupied
    const port = process.env.PORT || 5173;
    mainWindow.loadURL(`http://localhost:${port}`);
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open external links in the default browser, not in Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Build the application menu.
 */
function buildMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }]
      : []),
    {
      label: 'File',
      submenu: [process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// App lifecycle
app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.shogun.linda');
  }
  buildMenu();
  createWindow();

  // Log auxiliary child process crashes (GPU process, utility processes, etc)
  app.on('child-process-gone', (event, details) => {
    console.error(`[Electron] Child process gone! Name: ${details.name}, Reason: ${details.reason}, Exit Code: ${details.exitCode}`);
  });

  // On macOS: re-create window when dock icon is clicked and no window is open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
