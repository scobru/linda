/**
 * Electron Preload Script — Linda Desktop
 *
 * This script runs in a privileged context before the renderer is loaded.
 * It exposes a safe, minimal API to the renderer via contextBridge,
 * keeping Node.js/Electron APIs isolated from the web content.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe 'electronAPI' object to the renderer window (window.electronAPI)
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Platform information — useful for adapting UI on Windows/macOS/Linux
   */
  platform: process.platform,

  /**
   * App version from package.json
   */
  version: process.env.npm_package_version,

  /**
   * Check if running inside Electron
   */
  isElectron: true,

  /**
   * Open a URL in the system default browser
   * (safer than opening it in the Electron window)
   */
  openExternal: (url) => {
    // Validate URL before sending to main process
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      ipcRenderer.send('open-external', url);
    }
  },

  /**
   * Notification bridge — trigger native OS notifications from the renderer
   */
  showNotification: (title, body) => {
    ipcRenderer.send('show-notification', { title, body });
  },
});
