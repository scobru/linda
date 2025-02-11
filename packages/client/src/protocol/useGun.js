import { Shogun } from "@scobru/shogun";
import SEA from "gun/sea";
import Gun from "gun";

export const ACTIVITYPUB_URL = "http://localhost:8765";

const DEFAULT_PEERS = [`${ACTIVITYPUB_URL}/gun`];

const keys = {
  pub: 'ATOCHmGmf19wzojtfOTZdGl_vXKouGq9cXNsAXTCU4E.A37IN6UH57AJIQHm1iuTQ5-mPJJgHmkHn2pgtKa7oNI',
  priv: 'F45K4AobfyO99CWx2CA24v-KSEixWdPAaojlIG-Otg4',
  epub: 'RqdntmTv6BauhopM55r2-EBuL2CaMNDTOOjC0mToD2A.4ndhQhaWxvvL6H5Yn7Q7mPwYXsMEMyYFv5volkpydDQ',
  epriv: 'rpaoTZLcTyjHj6y6TkX7sFkKH20VupJ1hh36lyfVYdE'
}

export { SEA };

const gunOptions = Gun({
  peers: DEFAULT_PEERS,
  localStorage: false,
  radisk: false,
  axe: true
});

export const shogun = new Shogun(gunOptions, keys);
export const gunAuthManager = shogun.getGunAuthManager();

export const gun = gunAuthManager.getGun();
export const user = gunAuthManager.getUser();

// Inizializza il WalletManager
const walletManager = shogun.getWalletManager();
const ethereumManager = shogun.getEthereumManager();
const stealthManager = shogun.getStealthChain();
const activityPubManager = shogun.getActivityPubManager();
const webAuthnService = shogun.getWebAuthnManager();

// Gestione degli eventi di Gun
gun.on("auth", (ack) => {
  console.log("Gun auth event:", ack);
  if (ack.err) {
    console.error("Gun auth error:", ack.err);
  }
});

// Migliore gestione degli errori
gun.on("error", (error) => {
  console.error("Gun error:", error);
  // Tenta di ripulire lo stato in caso di errore
  if (user.is) {
    user.leave();
  }
  if (gun.back("user")._.is) {
    gun.back("user").leave();
  }
});

// Gestione più robusta della disconnessione
let reconnectTimeout = null;
gun.on("disconnected", async (peer) => {
  console.log("Gun disconnected from peer:", peer);

  // Pulisci il timeout precedente se esiste
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  // Imposta un nuovo tentativo di riconnessione
  reconnectTimeout = setTimeout(async () => {
    console.log("Tentativo di riconnessione dopo disconnessione...");
    try {
      // Pulisci lo stato prima di riconnetterti
      if (user.is) {
        user.leave();
      }
      if (gun.back("user")._.is) {
        gun.back("user").leave();
      }

      // Riconnetti ai peer
      gun.opt({ peers: DEFAULT_PEERS });
    } catch (error) {
      console.error("Errore durante la riconnessione:", error);
    }
  }, 5000);
});

// Gestione della riconnessione
gun.on("connected", (peer) => {
  console.log("Gun connected to peer:", peer);
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
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
export {
  walletManager,
  ethereumManager,
  stealthManager,
  activityPubManager,
  webAuthnService,
};

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
