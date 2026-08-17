const timers = require('node:timers')

window.setTimeout = timers.setTimeout
window.clearTimeout = timers.clearTimeout
window.setInterval = timers.setInterval
window.clearInterval = timers.clearInterval
