import esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const options = {
  entryPoints: ['src/main.ts'],
  outfile: 'dist/app.js',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info'
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('watching for changes...')
} else {
  await esbuild.build(options)
}
