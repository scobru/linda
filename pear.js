// Pear application entrypoint. This file runs in Bare — not in the browser, and not in Electron.
//
// Pear v1 booted an HTML file directly, which is what this app's `pear.gui` config was written
// for; Pear v2 dropped HTML entrypoints (see docs.pears.com/reference/migration). The entrypoint
// is now a JS file whose job is to start a UI runtime: `pear-electron` supplies the Electron
// build, shared between every Pear app on the machine instead of shipped per app, and
// `pear-bridge` serves the app's own files to it over loopback.
//
// The UI itself is pear.html + dist/pear/app.js, and it is where all of Linda actually lives —
// this file starts the window and then does nothing but hold the process open.
import Runtime from 'pear-electron'
import Bridge from 'pear-bridge'
import crasher from 'pear-crasher'

/* global Pear */

if (Pear.config?.storage) {
  crasher('linda', Pear.config.storage, true)
}

const runtime = new Runtime()
// Bootstraps the runtime binaries peer-to-peer on first use for a given version. A no-op
// afterwards, and pre-done for anyone who installed the app rather than running it from source.
await runtime.ready()

const bridge = new Bridge()
await bridge.ready()

const pipe = await runtime.start({ bridge })
Pear.teardown(() => pipe.end())
// Closing the window ends the pipe; without this the Bare process would outlive its own UI.
pipe.on('close', () => Pear.exit())
