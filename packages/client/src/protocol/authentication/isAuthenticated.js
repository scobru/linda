/**
 * @fileoverview Authentication status management and checking functionality
 */

import { user } from "../useGun.js";
import { security } from "../index.js";

const { sessionManager } = security;

// Funzione sincrona per verificare lo stato corrente
export const checkAuth = async () => {
  try {
    if (!user.is) return false;
    return sessionManager.validateSession();
  } catch (error) {
    console.error("Errore verifica autenticazione:", error);
    return false;
  }
};

// Funzione asincrona per ottenere i dettagli dell'utente
export const isAuthenticated = () => {
  return !!user.is && sessionManager.validateSession();
};

// Observable per monitorare lo stato di autenticazione
export const observeAuthState = (callback) => {
  return sessionManager.observeAuthState(callback);
};

export default {
  checkAuth,
  isAuthenticated,
  observeAuthState,
};
