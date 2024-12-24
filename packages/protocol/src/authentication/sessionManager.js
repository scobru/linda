import { gun, user, DAPP_NAME } from '../useGun.js';

export const sessionManager = {
  /**
   * Verifica se l'utente è autenticato
   * @returns {Promise<boolean>}
   */
  async verifyAuthentication() {
    return new Promise(async (resolve) => {
      try {
        // Verifica immediata se l'utente è già autenticato
        if (user.is?.pub) {
          const userData = await new Promise((res) => {
            gun
              .get(DAPP_NAME)
              .get('users')
              .get(user.is.pub)
              .once((data) => {
                res(data);
              });
          });
          if (userData) {
            console.log('Utente già autenticato:', user.is.pub);
            resolve(true);
            return;
          }
        }

        // Verifica dati sessione
        const sessionData = localStorage.getItem('sessionData');
        if (!sessionData) {
          console.log('Nessuna sessione trovata');
          resolve(false);
          return;
        }

        const { userPub, walletData } = JSON.parse(sessionData);

        // Riautenticazione con wallet
        if (!user.is && walletData?.pair) {
          console.log('Tentativo riautenticazione con wallet');
          user.auth(walletData.pair, async (ack) => {
            if (ack.err) {
              console.error('Errore riautenticazione:', ack.err);
              this.clearSession();
              resolve(false);
              return;
            }

            // Verifica dati utente dopo riautenticazione
            const userData = await new Promise((res) => {
              gun
                .get(DAPP_NAME)
                .get('users')
                .get(userPub)
                .once((data) => {
                  res(data);
                });
            });

            if (userData) {
              console.log('Riautenticazione completata con successo');
              resolve(true);
            } else {
              console.log('Dati utente non trovati dopo riautenticazione');
              this.clearSession();
              resolve(false);
            }
          });
          return;
        }

        resolve(false);
      } catch (error) {
        console.error('Errore verifica autenticazione:', error);
        this.clearSession();
        resolve(false);
      }
    });
  },

  /**
   * Attende che l'autenticazione sia completata
   * @param {number} maxAttempts - Numero massimo di tentativi
   * @param {number} interval - Intervallo tra i tentativi in ms
   * @returns {Promise<boolean>}
   */
  async waitForAuthentication(maxAttempts = 30, interval = 200) {
    console.log('Inizio attesa autenticazione...');
    for (let i = 0; i < maxAttempts; i++) {
      console.log(`Tentativo ${i + 1}/${maxAttempts}`);
      const isAuthenticated = await this.verifyAuthentication();
      if (isAuthenticated) {
        console.log('Autenticazione verificata con successo');
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    console.log('Timeout attesa autenticazione');
    return false;
  },

  /**
   * Salva i dati della sessione
   * @param {Object} sessionData
   */
  saveSession(sessionData) {
    try {
      if (!sessionData || !sessionData.userPub || !sessionData?.pair) {
        throw new Error('Dati sessione non validi');
      }

      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('sessionData', JSON.stringify(sessionData));
      localStorage.setItem('userPub', sessionData.userPub);
      localStorage.setItem('authType', 'metamask');
      localStorage.setItem('lastLogin', Date.now().toString());

      console.log('Session Data saved:', sessionData);

      // Salva le chiavi per la riautenticazione
      localStorage.setItem(
        `gunWallet_${sessionData.userPub}`,
        JSON.stringify(sessionData)
      );

      console.log('Sessione salvata con successo');
      return true;
    } catch (error) {
      console.error('Errore nel salvataggio della sessione:', error);
      return false;
    }
  },

  /**
   * Pulisce i dati della sessione
   */
  clearSession() {
    try {
      if (user.is) {
        user.leave();
      }

      // Lista delle chiavi da preservare
      const keysToKeep = ['theme', 'language'];

      // Salva i valori da preservare
      const preserved = {};
      keysToKeep.forEach((key) => {
        const value = localStorage.getItem(key);
        if (value) preserved[key] = value;
      });

      // Pulisci localStorage
      localStorage.clear();

      // Ripristina i valori preservati
      Object.entries(preserved).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });

      console.log('Sessione pulita con successo');
    } catch (error) {
      console.error('Errore nella pulizia della sessione:', error);
    }
  },

  /**
   * Verifica se esiste una sessione valida
   * @returns {Promise<boolean>}
   */
  async validateSession() {
    try {
      const isAuthenticated =
        localStorage.getItem('isAuthenticated') === 'true';
      const sessionData = localStorage.getItem('sessionData');
      const lastLogin = parseInt(localStorage.getItem('lastLogin') || '0');
      const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 ore

      if (
        !isAuthenticated ||
        !sessionData ||
        Date.now() - lastLogin > SESSION_TIMEOUT
      ) {
        console.log('Sessione non valida o scaduta');
        this.clearSession();
        return false;
      }

      // Verifica che l'utente sia ancora autenticato
      if (!user.is?.pub) {
        console.log('Utente non autenticato');
        this.clearSession();
        return false;
      }

      // Verifica che il pub dell'utente corrisponda
      const parsedSessionData = JSON.parse(sessionData);
      if (parsedSessionData.userPub !== user.is.pub) {
        console.log('Mismatch tra pub della sessione e utente corrente');
        this.clearSession();
        return false;
      }

      // Verifica che i dati essenziali siano presenti
      const username = localStorage.getItem('username');
      const userPub = localStorage.getItem('userPub');
      if (!username || !userPub || userPub !== user.is.pub) {
        console.log('Dati utente mancanti o non corrispondenti');
        this.clearSession();
        return false;
      }

      // Se tutto è ok, aggiorna il timestamp
      localStorage.setItem('lastLogin', Date.now().toString());
      return true;
    } catch (error) {
      console.error('Errore nella validazione della sessione:', error);
      this.clearSession();
      return false;
    }
  },
};

export default sessionManager;
