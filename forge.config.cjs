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
        manifestVariables: {
          publisher: 'CN=linda-pear-dev'
        }
      }
    }
  ]
}
