import { WalletManager } from "@scobru/shogun";
import SEA from "gun/sea.js ";

// Non importare i moduli di storage
// require('gun/lib/store');
// require('gun/lib/rindexed');

const DEFAULT_PEERS = ["https://gun-relay.scobrudot.dev/gun"];

let isConnected = false;


export { SEA }

// Inizializza il WalletManager
const walletManager = new WalletManager();

// Inizializza Gun con le opzioni
export const gun = walletManager.getGun();

// Inizializza l'utente
export const user = walletManager.getUser();

// Gestione errori di connessione
gun.on("error", (err) => {
  console.error("Gun error:", err);
});

// Gestione riconnessione
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let isReconnecting = false;

gun.on("disconnected", async (peer) => {
  console.log("Disconnesso dal peer:", peer);

  if (!isReconnecting && reconnectAttempts < maxReconnectAttempts) {
    isReconnecting = true;
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);

    console.log(
      `Tentativo di riconnessione ${reconnectAttempts}/${maxReconnectAttempts} tra ${delay}ms...`
    );

    setTimeout(() => {
      gun.opt({ peers: DEFAULT_PEERS });
      isReconnecting = false;
    }, delay);
  } else if (reconnectAttempts >= maxReconnectAttempts) {
    console.error("Numero massimo di tentativi di riconnessione raggiunto");
  }
});

gun.on("connected", (peer) => {
  console.log("Connesso al peer:", peer);
  reconnectAttempts = 0;
  isReconnecting = false;
});

// Costanti
export const DAPP_NAME = "linda-messenger";
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
    const timeout = setTimeout(() => {
      console.log("Timeout verifica connessione");
      resolve(false);
    }, 5000);

    gun.on("hi", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
};

// Riconnessione forzata
export const reconnect = async () => {
  console.log("Tentativo di riconnessione forzata...");
  gun.off();

  // Rimuovi tutti i peer esistenti
  const currentPeers = Object.keys(gun._.opt.peers || {});
  currentPeers.forEach((peer) => removePeer(peer));

  // Aggiungi nuovamente i peer predefiniti
  DEFAULT_PEERS.forEach((peer) => addPeer(peer));

  // Attendi un breve periodo
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Verifica la connessione
  const isConnected = await checkConnection();
  console.log("Stato connessione dopo riconnessione:", isConnected);

  return isConnected;
};

// Esporta il WalletManager
export { walletManager };

// Funzione per pulire la cache locale
export const clearLocalCache = () => {
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key.startsWith("gun/")) {
      localStorage.removeItem(key);
    }
  });
};

// Funzione per ottenere la dimensione della cache locale
export const getLocalCacheSize = () => {
  let size = 0;
  const keys = Object.keys(localStorage);
  keys.forEach((key) => {
    if (key.startsWith("gun/")) {
      size += localStorage.getItem(key).length;
    }
  });
  return size;
};
