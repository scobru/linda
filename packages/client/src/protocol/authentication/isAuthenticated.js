/**
 * @fileoverview Authentication status management and checking functionality
 */

import { user } from '../useGun.js';
import { Observable } from 'rxjs';

// Funzione sincrona per verificare lo stato corrente
export const checkAuth = () => {
  return user.is !== undefined && user.is !== null;
};

// Funzione asincrona per ottenere i dettagli dell'utente
export const isAuthenticated = () => {
  return new Promise((resolve) => {
    if (!user.is) {
      resolve({ success: false, error: 'Utente non autenticato' });
      return;
    }

    resolve({
      success: true,
      user: {
        pub: user.is.pub,
        alias: user.is.alias,
        epub: user.is.epub
      }
    });
  });
};

// Observable per monitorare lo stato di autenticazione
export const observeAuthState = () => {
  return new Observable((subscriber) => {
    // Emetti lo stato iniziale
    const emitAuthState = () => {
      if (user.is) {
        subscriber.next({
          success: true,
          user: {
            pub: user.is.pub,
            alias: user.is.alias,
            epub: user.is.epub
          }
        });
      } else {
        subscriber.next({
          success: false,
          error: 'Utente non autenticato'
        });
      }
    };

    // Emetti lo stato iniziale
    emitAuthState();

    // Monitora i cambiamenti di autenticazione
    const authHandler = user.on('auth', () => {
      emitAuthState();
    });

    // Cleanup
    return () => {
      if (authHandler && typeof authHandler === 'function') {
        authHandler();
      }
    };
  });
};

export default {
  checkAuth,
  isAuthenticated,
  observeAuthState
};
