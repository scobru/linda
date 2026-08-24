const timers = require('node:timers')

window.setTimeout = timers.setTimeout
window.clearTimeout = timers.clearTimeout
window.setInterval = timers.setInterval
window.clearInterval = timers.clearInterval

// The renderer's own navigator.clipboard is gated on a permission grant and refuses with
// "Document is not focused" whenever the window isn't focused (DevTools holding focus is
// enough). Electron's clipboard has neither restriction, but touching it from the renderer is
// deprecated and slated for removal — and with contextIsolation off this preload shares the
// renderer's context, so reaching it here counts the same. Hand the write to the main process
// over IPC instead, which is the supported path.
const { ipcRenderer } = require('electron')
window.lindaClipboard = { writeText: (text) => ipcRenderer.send('clipboard:write', String(text)) }
