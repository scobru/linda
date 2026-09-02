const fs = require('node:fs')
const path = require('node:path')

module.exports = {
  hooks: {
    // Electron reads its entrypoint from the packaged app's `main` field, but that field belongs
    // to Pear now: Pear v2+ boots the JS entrypoint named there (pear.js), and it has to stay
    // that way for `pear run`/`pear stage` to work at all. The dev scripts pass Electron its
    // entry as an explicit path, which leaves only the packaged build needing one — so write it
    // into the copy rather than keeping a field that would break the other runtime.
    packageAfterCopy: [async (_config, buildPath) => {
      const manifest = path.join(buildPath, 'package.json')
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'))
      pkg.main = 'electron/main.cjs'
      fs.writeFileSync(manifest, JSON.stringify(pkg, null, 2) + '\n')
    }]
  },
  packagerConfig: {
    asar: false,
    icon: './assets/icon',
    ignore: [
      /^\/\.claude/,
      /^\/\.headroom/,
      /^\/\.tokensave/,
      /^\/src\//,
      /^\/test\//,
      /^\/\.dev-storage\//,
      /^\/out\//,
      /^\/linda-pear-\d/,
      /^\/mobile\//,
      /^\/release-artifacts\//,
      /^\/by-arch\//,
      /^\/build\.js$/,
      /^\/forge\.config\.cjs$/,
      /^\/tsconfig\.json$/,
      /^\/dist\/.*\.map$/,
      // The Pear half of the app: a second entrypoint, a second HTML file and a second bundle,
      // none of which Electron loads.
      /^\/pear\.js$/,
      /^\/pear\.html$/,
      /^\/dist\/pear\//
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux']
    },
    {
      name: '@electron-forge/maker-msix',
      platforms: ['win32'],
      config: {
        packageAssets: path.join(__dirname, 'assets', 'msix'),
        manifestVariables: {
          publisher: 'CN=linda-pear-dev'
        },
        // Reuses the one dev-signing cert everyone's Windows install already trusts, instead of
        // electron-windows-msix's default of minting a brand-new self-signed cert per build.
        // MSIX enforces exact publisher-cert continuity for updates — a fresh cert every release
        // isn't a "you should trust this" warning, it's "Aggiorna" outright disabled with
        // "Editore: Sconosciuto", since Windows can't treat it as the same app at all. Falls back
        // to the library's own ephemeral dev cert when these aren't set (e.g. a local `npm run
        // make` off CI), which is fine for a build no one else is going to try to update onto.
        ...(process.env.WINDOWS_CERTIFICATE_FILE && process.env.WINDOWS_CERTIFICATE_PASSWORD
          ? {
              windowsSignOptions: {
                certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
                certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
                hashes: ['sha256']
              }
            }
          : {})
      }
    }
  ]
}
