// Builds the Bare worklet bundle: esbuild flattens worklet/entry.ts + local src/
// into one CJS file (npm packages left as real `require()` calls), then bare-pack
// inlines the pure-JS ones and resolves native addons (bare-fs, udx-native, sodium-native,
// ...) to `linked:` specifiers — those are already compiled into the APK by
// react-native-bare-kit's own Gradle `link` task (see node_modules/react-native-bare-kit/android/link.mjs).
import esbuild from 'esbuild'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mobileRoot = path.resolve(__dirname, '..')
const distDir = path.join(mobileRoot, 'worklet', 'dist')
fs.mkdirSync(distDir, { recursive: true })

const flatOut = path.join(distDir, 'entry.flat.cjs')
const bundleOut = path.join(distDir, 'worklet.bundle.cjs')

// bare-pack's --builtins mechanism (treat a specifier as "provided by the runtime")
// produces a null builtins table under the Bare version embedded in
// react-native-bare-kit@0.14.5, crashing the whole worklet on the first require that
// hits it. Sidestep it entirely: bundle every pure-JS dependency directly with esbuild
// (only the packages with real native addons — already linked into the APK by
// react-native-bare-kit's own Gradle `link` task — stay external for bare-pack --linked
// to resolve), and remap Node builtins to real bare-* packages/stubs esbuild can reach.
const NATIVE_ADDON_PACKAGES = [
  'bare-buffer', 'bare-dns', 'bare-fs', 'bare-inspect', 'bare-path', 'bare-tcp', 'bare-type', 'bare-url',
  'fs-native-extensions', 'quickbit-native', 'rabin-native', 'rocksdb-native',
  'simdle-native', 'sodium-native', 'udx-native'
]

const bareRemap = {
  name: 'bare-remap',
  setup(build) {
    build.onResolve({ filter: /^(node:)?(fs|path)$/ }, (args) => ({
      path: args.path.endsWith('fs') ? 'bare-fs' : 'bare-path',
      external: true
    }))
    // No bare-crypto package exists. @noble/hashes' cryptoNode.js reads
    // `require('node:crypto').webcrypto.getRandomValues` (a module-scoped property,
    // not globalThis.crypto) — stub that shape using sodium-universal's real RNG,
    // already linked as a native addon.
    build.onResolve({ filter: /^(node:)?crypto$/ }, () => ({ path: 'node:crypto', namespace: 'bare-crypto-stub' }))
    build.onLoad({ filter: /.*/, namespace: 'bare-crypto-stub' }, () => ({
      contents: `
        const sodium = require('sodium-universal')
        module.exports = {
          webcrypto: {
            getRandomValues(arr) {
              sodium.randombytes_buf(arr)
              return arr
            }
          }
        }
      `,
      loader: 'js',
      resolveDir: mobileRoot
    }))
    for (const pkg of NATIVE_ADDON_PACKAGES) {
      build.onResolve({ filter: new RegExp(`^${pkg}$`) }, (args) => ({ path: args.path, external: true }))
    }
  }
}

console.log('[1/2] esbuild: bundling worklet/entry.ts + local src/ + pure-JS deps into one CJS file...')
await esbuild.build({
  entryPoints: [path.join(mobileRoot, 'worklet', 'entry.ts')],
  outfile: flatOut,
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
  plugins: [bareRemap],
  logLevel: 'info'
})

console.log('[2/2] bare-pack: inlining pure-JS deps, linking native addons for Android...')
const hosts = ['android-arm64', 'android-arm', 'android-ia32', 'android-x64']
const args = ['bare-pack', '--linked', ...hosts.flatMap((h) => ['--host', h]), '-o', bundleOut, flatOut]
execFileSync('npx', args, { stdio: 'inherit', cwd: mobileRoot, shell: true })

console.log('Wrote', bundleOut)
