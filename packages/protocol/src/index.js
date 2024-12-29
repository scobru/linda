/**
 * @module Linda/Messenger
 * @descrizione Modulo principale per funzionalità di messaggistica e social
 */

// Prima importa useGun e le sue funzionalità di base
import {
  gun,
  user,
  SEA,
  checkConnection,
  reconnect,
  DAPP_NAME,
  setDappName,
  addPeer,
  removePeer,
  getPeers,
} from './useGun.js';

import { walletService } from './wallet.js';
import {
  userUtils,
  getUserInfo,
  updateUserProfile,
  subscribeToUserUpdates,
} from './utils/userUtils.js';
import { sessionManager } from './authentication/sessionManager.js';

// Importa i servizi V2 prima degli altri moduli
import {
  channelsV2,
  boardsV2,
  messaging as messagingService,
} from './messaging/index.js';

// Poi importa gli altri moduli che potrebbero dipendere da useGun
import * as authentication from './authentication/index.js';
import * as blocking from './blocking/index.js';
import * as friends from './friends/index.js';
import * as notes from './notes/index.js';
import * as notifications from './notifications/index.js';
import * as security from './security/index.js';
import * as system from './system/index.js';
import * as todos from './todos/index.js';
import * as posts from './posts/index.js';

// Esporta le funzionalità di base
export {
  gun,
  user,
  SEA,
  DAPP_NAME,
  setDappName,
  addPeer,
  checkConnection,
  reconnect,
  removePeer,
  getPeers,
  walletService,
  sessionManager,
  channelsV2,
  boardsV2,
};

// Rinomina messagingService come messaging per l'esportazione
export const messaging = messagingService;

// Esporta i moduli completi
export {
  authentication,
  blocking,
  friends,
  notes,
  notifications,
  security,
  system,
  todos,
  posts,
};

// Esporta le funzionalità specifiche di autenticazione
export const {
  checkAuth,
  isAuthenticated,
  loginUser,
  registerUser,
  logout,
  getKeyPair,
} = authentication;

// Esporta le funzionalità di blocking
export const { userBlocking, unblockService } = blocking;

// Esporta le funzionalità di gestione amici
export const {
  addFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  friendsService,
} = friends;

// Esporta le funzionalità delle note
export const { createNote, deleteNote, getNote, updateNote, getUserNotes } =
  notes;

// Esporta le notifiche
export const { messageNotifications } = notifications;

// Esporta le funzionalità di sicurezza
export const {
  certificateManager,
  createChatsCertificate,
  createMessagesCertificate,
  revokeChatsCertificate,
  revokeMessagesCertificate,
} = security;

// Esporta i servizi di sistema
export const { systemService } = system;

// Esporta sia le funzioni individuali che l'oggetto userUtils
export { userUtils, getUserInfo, updateUserProfile, subscribeToUserUpdates };

/**
 * @typedef {Object} CacheManager
 * @descrizione Gestore della cache migliorato per memorizzazione temporanea dei dati
 * @proprietà {Map} store - Archivio dei dati in cache
 * @proprietà {number} ttl - Tempo di vita predefinito in millisecondi
 */

/**
 * @tipo {CacheManager}
 * @descrizione Istanza del gestore cache
 */
const cacheManager = {
  store: new Map(),
  ttl: 5 * 60 * 1000, // 5 minuti

  /**
   * @metodo get
   * @asincrono
   * @param {string} key - Chiave dell'elemento da recuperare
   * @restituisce {Promise<*>} Il valore memorizzato o null se non trovato/scaduto
   */
  async get(key) {
    const cached = this.store.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.value;
    }
    return null;
  },

  /**
   * @metodo set
   * @param {string} key - Chiave per memorizzare il valore
   * @param {*} value - Valore da memorizzare
   * @param {number} [customTtl] - TTL personalizzato in millisecondi
   */
  set(key, value, customTtl = null) {
    this.store.set(key, {
      value,
      timestamp: Date.now(),
      ttl: customTtl || this.ttl,
    });
  },

  /**
   * @metodo delete
   * @param {string} key - Chiave dell'elemento da eliminare
   */
  delete(key) {
    this.store.delete(key);
  },

  /**
   * @metodo clear
   * @descrizione Rimuove tutti gli elementi dalla cache
   */
  clear() {
    this.store.clear();
  },

  /**
   * @metodo cleanup
   * @descrizione Rimuove automaticamente le entry scadute
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.store.delete(key);
      }
    }
  },
};

// Avvia pulizia cache periodica
setInterval(() => cacheManager.cleanup(), 60000);

// Esporta il gestore della cache
export { cacheManager };

// Esporta oggetto default con tutti i moduli
export default {
  authentication,
  blocking,
  friends,
  notes,
  notifications,
  security,
  system,
  todos,
  posts,
  cacheManager,
  sessionManager,
};

/**
 * Aggiorna l'avatar dell'utente
 * @param {string} userPub - La chiave pubblica dell'utente
 * @param {string} avatarData - L'immagine dell'avatar in formato base64
 * @returns {Promise<boolean>} - True se l'aggiornamento è avvenuto con successo
 */
export const updateUserAvatar = async (userPub, avatarData) => {
  try {
    if (!userPub || !avatarData) {
      console.error('userPub e avatarData sono richiesti');
      return false;
    }

    // Salva l'avatar nel nodo dell'utente
    await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('users')
        .get(userPub)
        .get('avatar')
        .put(avatarData, (ack) => {
          if (ack.err) {
            console.error("Errore nel salvataggio dell'avatar:", ack.err);
            resolve(false);
          }
          resolve(true);
        });
    });

    return true;
  } catch (error) {
    console.error("Errore nell'aggiornamento dell'avatar:", error);
    return false;
  }
};
