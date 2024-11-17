import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import { terser } from 'rollup-plugin-terser';

export default [
  // ESM e CJS builds
  {
    input: 'src/index.js',
    output: [
      {
        file: 'dist/linda.cjs.js',
        format: 'cjs',
        exports: 'named'
      },
      {
        file: 'dist/linda.esm.js',
        format: 'es'
      },
      {
        file: 'dist/linda.umd.js',
        format: 'umd',
        name: 'Linda',
        globals: {
          'gun': 'Gun',
          'gun/sea': 'SEA',
          'rxjs': 'rxjs',
          'ethers': 'ethers'
        }
      }
    ],
    plugins: [
      resolve({
        preferBuiltins: true,
        browser: true
      }),
      commonjs({
        transformMixedEsModules: true
      }),
      json()
    ],
    external: ['gun', 'gun/sea', 'rxjs', 'ethers']
  },

  // Browser bundle
  {
    input: 'src/index.js',
    output: {
      file: 'dist/linda.js',
      format: 'iife',
      name: 'Linda',
      intro: `
        var global = typeof window !== 'undefined' ? window : global;
        var process = { env: { NODE_DEBUG: false } };
      `
    },
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false
      }),
      commonjs({
        transformMixedEsModules: true
      }),
      nodePolyfills(),
      json(),
      terser({
        format: {
          comments: false
        },
        compress: {
          drop_console: false
        }
      })
    ],
  }
];
