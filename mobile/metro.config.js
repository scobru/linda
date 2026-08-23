const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

// Watch the shared src/ directory for changes, in addition to Expo's own defaults
// (expo-doctor flags overwriting watchFolders outright as dangerous/unsupported)
config.watchFolders = [...config.watchFolders, workspaceRoot]

// Resolve modules from both mobile/node_modules and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Path alias: @core → ../src (shared core modules)
config.resolver.extraNodeModules = {
  '@core': path.resolve(workspaceRoot, 'src'),
}

// bare-expo resolver: node:fs → bare-fs, node:path → bare-path
// Same mechanism Keet uses — Bare runtime provides these APIs with
// compatible signatures, Metro just needs to know where to find them.
const originalResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Map node: builtins to bare-* equivalents under Bare runtime
  const bareMap = {
    'node:fs': 'bare-fs',
    'node:fs/promises': 'bare-fs/promises',
    'node:path': 'bare-path',
    'node:os': 'bare-os',
    'node:stream': 'bare-stream',
    'node:events': 'bare-events',
    'node:buffer': 'bare-buffer',
    'node:crypto': 'bare-crypto',
    fs: 'bare-fs',
    path: 'bare-path',
    os: 'bare-os',
    'sodium-native': 'sodium-javascript',
    'quickbit-native': path.resolve(workspaceRoot, 'node_modules/quickbit-universal/fallback.js'),
    'simdle-native': path.resolve(workspaceRoot, 'node_modules/simdle-universal/fallback.js'),
  }

  if (bareMap[moduleName]) {
    return context.resolveRequest(context, bareMap[moduleName], platform)
  }


  // Strip .js from relative imports so Metro resolves .ts files via sourceExts
  // (shared core modules use ESM .js extensions in imports)
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    return context.resolveRequest(context, moduleName.slice(0, -3), platform)
  }

  // Default resolution
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

// Source file extensions
config.resolver.sourceExts = [...(config.resolver.sourceExts || []), 'ts', 'tsx', 'cjs', 'mjs']

module.exports = config
