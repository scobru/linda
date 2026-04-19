import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

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
    }
  },
  optimizeDeps: {
    include: ['sodium-javascript', 'sodium-universal', 'buffer'],
    exclude: ['@nucypher/umbral-pre']
  }
})
