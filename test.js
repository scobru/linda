import esbuild from 'esbuild'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const testFiles = fs.readdirSync('test')
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => `test/${f}`)

await esbuild.build({
  entryPoints: testFiles,
  outdir: 'dist',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info'
})

const outFiles = testFiles.map((f) => `dist/${f.slice('test/'.length).replace(/\.ts$/, '.cjs')}`)
const result = spawnSync(process.execPath, ['--test', ...outFiles], { stdio: 'inherit' })
process.exit(result.status ?? 1)
