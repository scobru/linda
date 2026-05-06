import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      protocolImports: true,
      exclude: ['url', 'child_process', 'os', 'dgram'],
    }),
    wasm(),
    topLevelAwait(),
    {
      name: 'patch-zen-url',
      resolveId(id) {
        if (id === 'node:url' || id === 'url') {
          return path.resolve(__dirname, './src/mock-url.js');
        }
        if (id === 'node:child_process' || id === 'child_process') {
          return path.resolve(__dirname, './src/mock-child_process.js');
        }
        if (id === 'node:os' || id === 'os') {
          return path.resolve(__dirname, './src/mock-os.js');
        }
        if (id === 'node:dgram' || id === 'dgram') {
          return path.resolve(__dirname, './src/mock-dgram.js');
        }
      },
      transform(code, id) {
        if (id.includes('zen/lib') || id.includes('zen.js')) {
          // Replace calls to fileURLToPath(import.meta.url) with a safe empty string
          // This handles cases where the import might have been already resolved or aliased
          return {
            code: code.replace(/fileURLToPath\s*\(\s*import\.meta\.url\s*\)/g, '""')
                      .replace(/[\w$]+\s*\(\s*import\.meta\.url\s*\)/g, (match) => {
                         // Only replace if it looks like a fileURLToPath call (often aliased to single letters in minified code)
                         if (match.startsWith('n(') || match.startsWith('a(') || match.startsWith('p(')) {
                           return '""';
                         }
                         return match;
                      }),
            map: null
          };
        }
      }
    }
  ],
  assetsInclude: ['**/*.wasm'],
  server: {
    watch: {
      ignored: ['**/radata/**'],
    },
  },
  resolve: {
    alias: {
      'sodium-native': 'sodium-javascript',
      'node:fs/promises': path.resolve(__dirname, './src/mock-empty.js'),
      'node:fs': path.resolve(__dirname, './src/mock-empty.js'),
      'fs/promises': path.resolve(__dirname, './src/mock-empty.js'),
      'fs': path.resolve(__dirname, './src/mock-empty.js'),
      'node:url': path.resolve(__dirname, './src/mock-url.js'),
      'url': path.resolve(__dirname, './src/mock-url.js'),
      'node:child_process': path.resolve(__dirname, './src/mock-child_process.js'),
      'child_process': path.resolve(__dirname, './src/mock-child_process.js'),
      'node:os': path.resolve(__dirname, './src/mock-os.js'),
      'os': path.resolve(__dirname, './src/mock-os.js'),
      'node:dgram': path.resolve(__dirname, './src/mock-dgram.js'),
      'dgram': path.resolve(__dirname, './src/mock-dgram.js'),
    }
  },
  optimizeDeps: {
    exclude: ['shogun-core', 'zen', 'shogun-button-react', '@nucypher/umbral-pre'],
    include: ['sodium-javascript', 'sodium-universal', 'buffer']
  }
})
