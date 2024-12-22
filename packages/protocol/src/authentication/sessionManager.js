import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Session management utilities for handling user sessions
 * @namespace sessionManager
 */
const sessionManager = {
  /**
   * Validates the current user session
   *
   * Checks if:
   * 1. User is authenticated
   * 2. Session data exists and is not expired (1 hour timeout)
   * 3. Updates the session with current timestamp and device info
   *
   * @async
   * @returns {Promise<boolean>} True if session is valid, false otherwise
   */
  async validateSession(password) {
    if (!gun || !user) {
      console.warn('Gun o user non inizializzato');
      return false;
    }

    if (!user?.is) {
      console.log('Utente non autenticato');
      return false;
    }

    try {
      // Ottieni i dati della sessione
      const sessionData = await new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('session')
          .once((data) => {
            resolve(data);
          });
      });

      // Verifica la presenza delle chiavi stealth
      const walletKey = `gunWallet_${user.is.pub}`;

      // check if wallet is in localStorage
      const savedWallet = localStorage.getItem(walletKey);
      if (!savedWallet) {
        console.log('Wallet non trovato in localStorage');
        return false;
      }

      // Se non c'è una sessione, creane una nuova
      if (!sessionData) {
        console.log('Creazione nuova sessione');
        await this.createSession();
        return true;
      }

      // Controlla se la sessione è scaduta (1 ora)
      if (Date.now() - sessionData.lastActive > 3600000) {
        console.log('Sessione scaduta');
        await this.invalidateSession();
        return false;
      }

      // Aggiorna il timestamp della sessione
      await new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('session')
          .put(
            {
              lastActive: Date.now(),
              device:
                typeof navigator !== 'undefined'
                  ? navigator.userAgent
                  : 'unknown',
            },
            (ack) => {
              resolve(ack);
            }
          );
      });

      return true;
    } catch (error) {
      console.error('Errore validazione sessione:', error);
      return false;
    }
  },

  /**
   * Creates a new user session
   *
   * @async
   * @returns {Promise<boolean>} True if session is created, false otherwise
   */
  async createSession() {
    if (!gun || !user || !user?.is) return false;

    try {
      await new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('session')
          .put(
            {
              created: Date.now(),
              lastActive: Date.now(),
              device:
                typeof navigator !== 'undefined'
                  ? navigator.userAgent
                  : 'unknown',
            },
            (ack) => {
              resolve(ack);
            }
          );
      });
      return true;
    } catch (error) {
      console.error('Errore creazione sessione:', error);
      return false;
    }
  },

  /**
   * Invalidates and terminates the current user session
   *
   * Clears session data and logs out the user
   *
   * @async
   * @returns {Promise<void>}
   */
  async invalidateSession() {
    if (!gun || !user || !user?.is) return;

    try {
      // Rimuovi i dati della sessione
      await new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('session')
          .put(null, (ack) => {
            resolve(ack);
          });
      });

      // Esegui il logout
      user.leave();
    } catch (error) {
      console.error('Errore invalidazione sessione:', error);
    }
  },
};

export default sessionManager;
