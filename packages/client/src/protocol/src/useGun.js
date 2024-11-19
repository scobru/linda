import Gun from 'gun';
import SEA from 'gun/sea.js';
import 'gun-eth';

// Usa solo il peer locale
const DEFAULT_PEERS = ['http://localhost:3030/gun'];

let isConnected = false;

const initGun = () => {
  if (window.Gun === undefined) {
    const gunInstance = Gun(DEFAULT_PEERS);

    // Gestione degli eventi di connessione
    gunInstance.on('hi', (peer) => {
      if (!peer || !peer.url) return;
      console.log(`Peer connesso: ${peer.url}`);
      isConnected = true;
    });

    gunInstance.on('bye', (peer) => {
      if (!peer || !peer.url) return;
      console.log(`Peer disconnesso: ${peer.url}`);
      isConnected = false;
    });

    gunInstance.on('error', (error) => {
      console.error('Gun error:', error);
    });

    // Verifica periodica della connessione
    setInterval(() => {
      const connectedPeers = Object.keys(gunInstance._.opt.peers).length;
      if (connectedPeers === 0 && !isConnected) {
        console.log('Nessun peer connesso, tentativo di riconnessione...');
        DEFAULT_PEERS.forEach((peer) => {
          gunInstance.opt({ peers: [peer] });
        });
      }
    }, 5000);

    return gunInstance;
  } else {
    return window.Gun({
      peers: DEFAULT_PEERS,
      localStorage:false,
      axe:true
    });
  }
};

// Inizializza Gun
export const gun = initGun();

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
