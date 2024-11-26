import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';
import { terser } from 'rollup-plugin-terser';

// Configurazione per moduli ES e CommonJS
const moduleConfig = {
  input: 'src/index.js',
  output: [
    {
      dir: 'dist/esm',
      format: 'es',
      exports: 'named',
      preserveModules: true,
      entryFileNames: '[name].esm.js'
    },
    {
      dir: 'dist/cjs',
      format: 'cjs',
      exports: 'named',
      preserveModules: true,
      entryFileNames: '[name].cjs.js'
    }
  ],
  plugins: [
    resolve({ preferBuiltins: true, browser: true }),
    commonjs({ transformMixedEsModules: true }),
    json()
  ],
  external: ['gun', 'gun/sea', 'rxjs', 'ethers']
};

// Configurazione per UMD
const umdConfig = {
  input: 'src/index.js',
  output: {
    file: 'dist/umd/linda.umd.js',
    format: 'umd',
    name: 'Linda',
    globals: {
      'gun': 'Gun',
      'gun/sea': 'SEA',
      'rxjs': 'rxjs',
      'ethers': 'ethers'
    }
  },
  plugins: [
    resolve({ preferBuiltins: true, browser: true }),
    commonjs({ transformMixedEsModules: true }),
    json()
  ],
  external: ['gun', 'gun/sea', 'rxjs', 'ethers'],
  inlineDynamicImports: true
};

// Configurazione per IIFE
const iifeConfig = {
  input: 'src/index.js',
  output: {
    file: 'dist/iife/linda.js',
    format: 'iife',
    name: 'Linda'
  },
  plugins: [
    resolve({ preferBuiltins: true, browser: true }),
    commonjs({ transformMixedEsModules: true }),
    json(),
    nodePolyfills(),
    terser({
      format: { comments: false },
      compress: { drop_console: false }
    })
  ],
  inlineDynamicImports: true
};

export default [moduleConfig, umdConfig, iifeConfig];