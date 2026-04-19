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
    }),
    wasm(),
    topLevelAwait(),
  ],
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
    }
  },
  optimizeDeps: {
    include: ['sodium-javascript', 'sodium-universal', 'buffer'],
    exclude: ['@nucypher/umbral-pre']
  }
})
