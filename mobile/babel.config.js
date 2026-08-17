module.exports = function (api) {
  api.cache(true)
  return {
    // unstable_transformImportMeta: @akaoio/zen's browser bundle uses `import.meta`,
    // which Hermes doesn't support natively — this transforms it away at build time.
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@core': '../src',
          },
        },
      ],
    ],
  }
}
