import Gun from 'gun';
import SEA from 'gun/sea.js';


// Usa solo il peer locale
const DEFAULT_PEERS = [
  'http://localhost:3030/gun'
];

// Inizializza Gun con configurazione semplificata
const gun = Gun({
  peers: DEFAULT_PEERS,
  localStorage: false,
  radisk: true,
  timeout: 5000,
  axe: false
});



// Inizializza l'utente
const user = gun.user().recall({ sessionStorage: true });

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

// Eventi base
gun.on('hi', (peer) => {
  if (!peer || !peer.url) return;
  console.log(`Peer connesso: ${peer.url}`);
});

gun.on('bye', (peer) => {
  if (!peer || !peer.url) return;
  console.log(`Peer disconnesso: ${peer.url}`);
});

gun.on('error', (error) => {
  console.error('Gun error:', error);
});

// Connetti al peer locale all'avvio
addPeer(DEFAULT_PEERS[0]);

// Esporta checkPeerStatus insieme alle altre funzioni
export { gun, user, SEA };
