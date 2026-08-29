const path = require('node:path')

module.exports = {
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
      /^\/dist\/.*\.map$/
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
