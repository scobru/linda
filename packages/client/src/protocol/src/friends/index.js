/**
 * @fileoverview Modulo per la gestione delle amicizie e delle richieste di amicizia
 * @module protocol/friends
 */

import friendsService from './friendsService.js';
import addFriendRequest from './addFriendRequest.js';
import acceptFriendRequest from './acceptFriendRequest.js';
import rejectFriendRequest from './rejectFriendRequest.js';
import removeFriend from './removeFriend.js';

/**
 * Esporta le funzionalità principali del modulo amicizie
 * @exports protocol/friends
 */
export {
  friendsService,
  addFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
};

/**
 * Esporta un oggetto predefinito contenente tutte le funzionalità del modulo
 * @exports protocol/friends
 * @property {Object} friendsService - Servizio per la gestione delle amicizie
 * @property {Function} addFriendRequest - Funzione per inviare richieste di amicizia
 * @property {Function} acceptFriendRequest - Funzione per accettare richieste di amicizia
 * @property {Function} rejectFriendRequest - Funzione per rifiutare richieste di amicizia
 * @property {Function} removeFriend - Funzione per rimuovere un amico
 */
export default {
  friendsService,
  addFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
};
