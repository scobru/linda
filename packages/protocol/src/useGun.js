import Gun from 'gun';
import SEA from 'gun/sea.js';
import GunEthModule from './gun-eth.mjs';
//import GunEthModule from '@scobru/gun-eth';

// Non importare i moduli di storage
// require('gun/lib/store');
// require('gun/lib/rindexed');

const DEFAULT_PEERS = [
  'https://gun-relay.scobrudot.dev/gun',
  /* 'http://localhost:8765/gun', */
];

let isConnected = false;

const GunEth = GunEthModule.GunEth;

// Inizializza Gun con storage locale completamente disabilitato
export const gun = GunEth.initializeGun({
  peers: DEFAULT_PEERS,
  localStorage: false,
  store: {
    // Override del metodo put per prevenire il salvataggio
    put: function () {
      return;
    },
    // Override del metodo get per prevenire la lettura
    get: function () {
      return;
    },
  },
  radisk: false,
  rindexed: false,
  indexedDB: false, // Disabilita esplicitamente IndexedDB
  web: false, // Disabilita il web storage
});

// Inizializza l'utente
export const user = gun.user().recall({ sessionStorage: true });

// Costanti
export const DAPP_NAME = 'linda-messenger';
let dappName = DAPP_NAME;

export const setDappName = (name) => {
  dappName = name;
};

// Funzioni base per la gestione dei peer
export const addPeer = (url) => {
  if (!url) return;
  console.log(`Aggiunta peer: ${url}`);
  gun.opt({ peers: [url] });
};

export const removePeer = (url) => {
  if (!url) return;
  const peers = gun._.opt.peers;
  delete peers[url];
};

export const getPeers = () => {
  return Object.keys(gun._.opt.peers || {});
};

// Verifica connessione
export const checkConnection = () => {
  return new Promise((resolve) => {
    if (isConnected) {
      resolve(true);
      return;
    }

    const timeout = setTimeout(() => resolve(false), 5000);
    gun.on('hi', () => {
      clearTimeout(timeout);
      isConnected = true; // Aggiorna lo stato della connessione
      resolve(true);
    });
  });
};

// Riconnessione
export const reconnect = () => {
  gun.off();
  setTimeout(() => {
    window.location.reload();
  }, 1000);
};

// Esporta SEA
export { SEA };

// Funzione per pulire la cache locale
export const clearLocalCache = () => {
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key.startsWith('gun/')) {
      localStorage.removeItem(key);
    }
  });
};

// Funzione per ottenere la dimensione della cache locale
export const getLocalCacheSize = () => {
  let size = 0;
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key.startsWith('gun/')) {
      size += localStorage.getItem(key).length;
    }
  });
  return size;
};
