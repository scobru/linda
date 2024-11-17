/**
 * Modulo di blocco utenti che fornisce funzionalità per bloccare e sbloccare gli utenti
 * @module blocking
 */

import userBlockingService from './userBlocking.js';
import unblockUserService from './unblockService.js';

// Esporta i servizi rinominati per mantenere la compatibilità
export const userBlocking = userBlockingService;
export const unblockService = unblockUserService;

// Esporta anche come oggetto per l'uso come modulo
export default {
  userBlocking: userBlockingService,
  unblockService: unblockUserService
};
