module.exports = {
  packagerConfig: {
    asar: false,
    ignore: [
      /^\/\.claude/,
      /^\/\.headroom/,
      /^\/\.tokensave/,
      /^\/src\//,
      /^\/test\//,
      /^\/\.dev-storage\//,
      /^\/out\//,
      /^\/linda-pear-\d/,
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
