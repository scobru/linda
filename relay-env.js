import fs from 'fs';
import { LocalStorage } from 'node-localstorage';

// Ensure radata exists
const storagePath = './radata_storage';
if (!fs.existsSync(storagePath)) {
  fs.mkdirSync(storagePath, { recursive: true });
}

// Global polyfill
global.localStorage = new LocalStorage(storagePath);
if (typeof global.window === 'undefined') {
  global.window = { localStorage: global.localStorage };
}

console.log('[Relay-Env] Storage polyfill initialized.');
