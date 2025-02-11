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
   * Verifica se esiste una sessione valida
   */
  async validateSession() {
    try {
      console.log('Inizio validazione sessione...');
      
      const sessionData = localStorage.getItem('sessionData');
      if (!sessionData) {
        console.log('Dati sessione mancanti nel localStorage');
        return false;
      }

      const parsedSessionData = JSON.parse(sessionData);

      console.log('Dati sessione trovati:', {
        hasPub: !!parsedSessionData.pub,
        hasPair: !!parsedSessionData.pair,
        pairDetails: parsedSessionData.pair ? {
          hasPub: !!parsedSessionData.pair.pub,
          hasPriv: !!parsedSessionData.pair.priv
        } : null
      });
      
      // Verifica base delle chiavi
      const hasKeys = !!(parsedSessionData?.pair?.pub && parsedSessionData?.pair?.priv);
      console.log('Verifica base chiavi:', { 
        hasKeys,
        pairExists: !!parsedSessionData?.pair,
        pubExists: !!parsedSessionData?.pair?.pub,
        privExists: !!parsedSessionData?.pair?.priv,
        fullPair: parsedSessionData?.pair
      });

      if (!hasKeys) {
        console.log('Chiavi di cifratura mancanti nella sessione');
        return false;
      }

      // Se stiamo creando i certificati o siamo nel processo di login, verifica minima
      const isCreatingCertificates = localStorage.getItem('creatingCertificates') === 'true';
      const isLoggingIn = localStorage.getItem('isLoggingIn') === 'true';
      
      console.log('Stato processi:', { isCreatingCertificates, isLoggingIn });
      
      if (isCreatingCertificates || isLoggingIn) {
        console.log('Processo in corso, verifica minima della sessione');
        return hasKeys;
      }

      const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
      const lastLogin = parseInt(localStorage.getItem('lastLogin') || '0');
      const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 ore

      console.log('Stato autenticazione:', {
        isAuthenticated,
        lastLogin,
        timeSinceLastLogin: Date.now() - lastLogin
      });

      if (!isAuthenticated || Date.now() - lastLogin > SESSION_TIMEOUT) {
        console.log('Sessione non valida o scaduta');
        return false;
      }

      // Verifica che l'utente sia ancora autenticato
      console.log('Verifica user.is:', {
        exists: !!user.is,
        hasPub: !!user.is?.pub,
        pub: user.is?.pub
      });

      // Se l'utente non è autenticato ma abbiamo le chiavi, proviamo la riautenticazione
      if (!user.is && parsedSessionData.pair) {
        console.log('Tentativo riautenticazione automatica...');
        try {
          await new Promise((resolve, reject) => {
            user.auth(parsedSessionData.pair, (ack) => {
              if (ack.err) {
                console.error('Errore riautenticazione:', ack.err);
                reject(ack.err);
              } else {
                console.log('Riautenticazione automatica completata');
                resolve();
              }
            });
          });
          
          // Verifica che l'utente sia stato effettivamente autenticato
          if (!user.is?.pub) {
            console.log('Riautenticazione fallita - user.is non presente');
            return false;
          }
          
          // Verifica che il pub corrisponda
          if (user.is.pub !== parsedSessionData.pub) {
            console.log('Riautenticazione fallita - pub non corrispondente');
            return false;
          }
          
          return true;
        } catch (error) {
          console.error('Errore durante la riautenticazione:', error);
          return false;
        }
      }

      if (!user.is?.pub) {
        console.log('Utente non autenticato');
        return false;
      }

      // Se tutto è ok, aggiorna il timestamp
      localStorage.setItem('lastLogin', Date.now().toString());
      return true;
    } catch (error) {
      console.error('Errore nella validazione della sessione:', error);
      return false;
    }
  },

  /**
   * Salva i dati della sessione
   * @param {Object} sessionData
   */
  saveSession(sessionData) {
    try {
      if (!sessionData || !sessionData.pub) {
        throw new Error('Dati sessione non validi');
      }

      // Verifica che l'utente sia autenticato
      if (!user.is) {
        console.warn('User.is non presente, tentativo riautenticazione...');
        
        // Verifica che abbiamo le chiavi necessarie
        if (!sessionData.pair?.pub || !sessionData.pair?.priv) {
          console.error('Chiavi di cifratura mancanti per riautenticazione');
          return false;
        }

        // Tentativo di riautenticazione con le chiavi della sessione
        try {
          user.auth(sessionData.pair, (ack) => {
            if (ack.err) {
              console.error('Errore riautenticazione:', ack.err);
            } else {
              console.log('Riautenticazione riuscita con le chiavi della sessione');
            }
          });
        } catch (error) {
          console.error('Errore durante la riautenticazione:', error);
        }

        // Attendi un momento per la riautenticazione
        setTimeout(() => {}, 1000);
      }

      // Verifica che il pub corrisponda o che almeno abbiamo le chiavi corrette
      if (user.is?.pub && user.is.pub !== sessionData.pub) {
        console.warn('Mismatch tra pub, ma procedo se le chiavi sono valide');
      }

      // Verifica che le chiavi necessarie siano presenti
      if (!sessionData.pair?.pub || !sessionData.pair?.priv) {
        console.error('Chiavi di cifratura mancanti:', {
          hasPair: !!sessionData.pair,
          hasPub: !!sessionData.pair?.pub,
          hasPriv: !!sessionData.pair?.priv
        });
        return false;
      }

      // Salva i dati della sessione
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('sessionData', JSON.stringify(sessionData));
      localStorage.setItem('userPub', sessionData.pub);
      localStorage.setItem('username', sessionData.credentials?.username || '');
      localStorage.setItem('userAlias', sessionData.credentials?.username || '');
      localStorage.setItem('authType', sessionData.authType || 'credentials');
      localStorage.setItem('lastLogin', Date.now().toString());

      // Salva le chiavi per la riautenticazione
      localStorage.setItem(
        `gunWallet_${sessionData.pub}`,
        JSON.stringify({
          ...sessionData,
          pair: {
            pub: sessionData.pair.pub,
            priv: sessionData.pair.priv,
            epub: sessionData.pair.epub,
            epriv: sessionData.pair.epriv
          }
        })
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
      // Non pulire la sessione se siamo in un processo critico
      const isCreatingCertificates = localStorage.getItem('creatingCertificates') === 'true';
      const isLoggingIn = localStorage.getItem('isLoggingIn') === 'true';
      
      if (isCreatingCertificates || isLoggingIn) {
        console.log('Processo in corso, skip pulizia sessione');
        return;
      }

      // Salva le chiavi prima della pulizia
      const sessionData = localStorage.getItem('sessionData');
      let savedKeys = null;
      if (sessionData) {
        const parsed = JSON.parse(sessionData);
        if (parsed?.pair) {
          savedKeys = { ...parsed.pair };
        }
      }

      // Verifica se l'utente è autenticato prima di disconnetterlo
      if (user.is) {
        console.log('Disconnessione utente...');
        // Non disconnettere l'utente se stiamo ancora creando i certificati
        if (!isCreatingCertificates && !isLoggingIn) {
          user.leave();
        }
      }

      // Lista delle chiavi da preservare
      const keysToKeep = ['theme', 'language', 'isLoggingIn', 'creatingCertificates'];

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

      // Ripristina le chiavi se necessario
      if (savedKeys && (user.is?.pub || isCreatingCertificates || isLoggingIn)) {
        const minimalSession = {
          pub: user.is?.pub || savedKeys.pub,
          pair: savedKeys
        };
        localStorage.setItem('sessionData', JSON.stringify(minimalSession));
        localStorage.setItem('isAuthenticated', 'true');
      }

      console.log('Sessione pulita con successo');
    } catch (error) {
      console.error('Errore nella pulizia della sessione:', error);
    }
  },

  /**
   * Osserva i cambiamenti dello stato di autenticazione
   * @param {Function} callback - Funzione da chiamare quando lo stato cambia
   * @returns {Function} Funzione per rimuovere l'observer
   */
  observeAuthState(callback) {
    const checkState = async () => {
      const isValid = await this.validateSession();
      const authState = {
        isAuthenticated: !!user.is && isValid,
        userPub: user.is?.pub,
        sessionData: localStorage.getItem('sessionData') ? JSON.parse(localStorage.getItem('sessionData')) : null
      };
      callback(authState);
    };

    // Controlla lo stato iniziale
    checkState();

    // Osserva i cambiamenti dell'utente
    const userObserver = user.on('auth', checkState);
    
    // Osserva i cambiamenti del localStorage
    const storageListener = (event) => {
      if (event.key === 'sessionData' || event.key === 'isAuthenticated') {
        checkState();
      }
    };
    window.addEventListener('storage', storageListener);

    // Ritorna una funzione per rimuovere gli observer
    return () => {
      user.off(userObserver);
      window.removeEventListener('storage', storageListener);
    };
  }
};

export default sessionManager;
