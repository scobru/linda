import esbuild from 'esbuild'
import { spawnSync } from 'node:child_process'

await esbuild.build({
  entryPoints: ['test/room.test.ts'],
  outfile: 'dist/room.test.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info'
})

const result = spawnSync(process.execPath, ['--test', 'dist/room.test.cjs'], { stdio: 'inherit' })
process.exit(result.status ?? 1)
