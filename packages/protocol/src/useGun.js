import Gun from 'gun';
import SEA from 'gun/sea.js';
import gunEth from './gun-eth.cjs'
// Usa solo il peer locale
const DEFAULT_PEERS = ['http://localhost:8765/gun'];

let isConnected = false;

const { GunEth } = gunEth;

GunEth.init('optimismSepolia')

const initGun = () => {
  const options = {
    peers: DEFAULT_PEERS
  };

  if (window.Gun === undefined) {
    const gunInstance = new Gun(DEFAULT_PEERS);
    


    // Gestione degli eventi di connessione
    gunInstance.on('hi', peer => {
      if (!peer || !peer.url) return;
      console.log(`Peer connesso: ${peer.url}`);
      isConnected = true;
    });

    return gunInstance;
  } else {
    const gunInstance = window.Gun(options);
   

    
    return gunInstance;
  }
};

// Inizializza Gun
export const gun = initGun();

// Esporta anche l'istanza eth per comodità
export const eth = gun.eth;

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
  keys.forEach(key => {
    if (key.startsWith('gun/')) {
      localStorage.removeItem(key);
    }
  });
};

// Funzione per ottenere la dimensione della cache locale
export const getLocalCacheSize = () => {
  let size = 0;
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('gun/')) {
      size += localStorage.getItem(key).length;
    }
  });
  return size;
};
