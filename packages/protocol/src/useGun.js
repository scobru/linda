import Gun from 'gun';
import SEA from 'gun/sea.js';
import GunEthModule from './gun-eth.mjs';

// Add more fallback peers
const DEFAULT_PEERS = ['https://gun-relay.scobrudot.dev/gun'];

let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL = 2000;
const CONNECTION_TIMEOUT = 5000;
const GunEth = GunEthModule.GunEth;

// Initialize Gun with improved configuration
export const gun = GunEth.initializeGun({
  peers: DEFAULT_PEERS,
  localStorage: false,
  store: {
    put: () => {},
    get: () => {},
  },
  radisk: false,
  rindexed: false,
  indexedDB: false,
  web: false,
  retry: 1500,
  axe: true,
  mesh: true,
  multicast: false,
  timeout: CONNECTION_TIMEOUT,
  super: true, // Enable super peer mode
  WebSocket: false, // Disable WebSocket in browser
});

// Initialize user with improved session handling
export const user = gun.user().recall({
  sessionStorage: true,
  timeout: CONNECTION_TIMEOUT,
});

// Add connection event listeners
gun.on('out', function (msg) {
  if (msg.err) {
    console.warn('Gun error:', msg.err);
  }
});

gun.on('hi', (peer) => {
  console.log('Connected to peer:', peer.url || peer.id);
  isConnected = true;
  reconnectAttempts = 0;
});

gun.on('bye', (peer) => {
  console.log('Disconnected from peer:', peer.url || peer.id);
  isConnected = false;
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    console.log('Connection lost, will attempt to reconnect...');
    reconnect();
  }
});

// Constants
export const DAPP_NAME = 'linda-messenger';
let dappName = DAPP_NAME;

export const setDappName = (name) => {
  dappName = name;
};

// Enhanced peer management with validation
export const addPeer = (url) => {
  if (!url || typeof url !== 'string') return;
  try {
    new URL(url); // Validate URL format
    console.log(`Adding peer: ${url}`);
    const peers = { ...gun._.opt.peers };
    peers[url] = {};
    gun.opt({ peers });
  } catch (error) {
    console.error(`Invalid peer URL: ${url}`);
  }
};

export const removePeer = (url) => {
  if (!url) return;
  const peers = { ...gun._.opt.peers };
  delete peers[url];
  gun.opt({ peers });
};

export const getPeers = () => {
  return Object.keys(gun._.opt.peers || {});
};

// Improved connection check with better timeout handling
export const checkConnection = () => {
  return new Promise((resolve) => {
    if (isConnected) {
      resolve(true);
      return;
    }

    const checkTimeout = setTimeout(() => {
      console.log('Connection check timeout, initiating reconnection...');
      reconnect();
      resolve(false);
    }, CONNECTION_TIMEOUT);

    // Usa Gun per verificare la connessione
    gun.get('~@').once((data) => {
      clearTimeout(checkTimeout);
      isConnected = true;
      resolve(true);
    });
  });
};

// Enhanced reconnection logic with exponential backoff
export const reconnect = async () => {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('Max reconnection attempts reached, resetting connection...');
    resetConnection();
    return;
  }

  console.log(
    `Reconnection attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}`
  );
  isConnected = false;
  reconnectAttempts++;

  // Riconnessione usando Gun
  gun.opt({ peers: DEFAULT_PEERS });

  // Attendi un po' prima di verificare la connessione
  const delay = Math.min(
    RECONNECT_INTERVAL * Math.pow(2, reconnectAttempts - 1),
    10000
  );
  await new Promise((resolve) => setTimeout(resolve, delay));

  const connected = await checkConnection();
  if (connected) {
    console.log('Connection restored');
    reconnectAttempts = 0;
    return;
  }

  setTimeout(reconnect, RECONNECT_INTERVAL);
};

// Reset connection state
const resetConnection = () => {
  console.log('Resetting connection state...');
  isConnected = false;
  reconnectAttempts = 0;

  // Reinizializza Gun con i peer predefiniti
  gun.opt({ peers: DEFAULT_PEERS });

  setTimeout(reconnect, RECONNECT_INTERVAL);
};

// Export SEA
export { SEA };

// Improved cache management with error handling
export const clearLocalCache = () => {
  try {
    const keys = Object.keys(localStorage);
    let cleared = 0;
    keys.forEach((key) => {
      if (key.startsWith('gun/')) {
        localStorage.removeItem(key);
        cleared++;
      }
    });
    console.log(`Local cache cleared successfully (${cleared} items)`);
  } catch (error) {
    console.error('Error clearing local cache:', error);
  }
};

export const getLocalCacheSize = () => {
  try {
    let size = 0;
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith('gun/')) {
        size += localStorage.getItem(key).length;
      }
    });
    return size;
  } catch (error) {
    console.error('Error calculating cache size:', error);
    return 0;
  }
};
