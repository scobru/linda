/**
 * Modulo di blocco utenti che fornisce funzionalità per bloccare e sbloccare gli utenti
 * @module blocking
 */

import userBlockingService from './userBlocking.js';
import unblockUserService from './unblockService.js';

export const userBlocking = userBlockingService;
export const unblockService = unblockUserService;

export const blocking = {
  userBlocking: userBlockingService,
  unblockService: unblockUserService
};

export default blocking;
