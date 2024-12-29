import { gun, user, DAPP_NAME } from "../useGun.js";

const sessionManager = {
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
              .get("users")
              .get(user.is.pub)
              .once((data) => {
                res(data);
              });
          });
          if (userData) {
            console.log("Utente già autenticato:", user.is.pub);
            resolve(true);
            return;
          }
        }

        // Verifica dati sessione
        const sessionData = localStorage.getItem("sessionData");
        if (!sessionData) {
          console.log("Nessuna sessione trovata");
          resolve(false);
          return;
        }

        const { userPub, walletData } = JSON.parse(sessionData);

        // Riautenticazione con wallet
        if (!user.is && walletData?.pair) {
          console.log("Tentativo riautenticazione con wallet");
          user.auth(walletData.pair, async (ack) => {
            if (ack.err) {
              console.error("Errore riautenticazione:", ack.err);
              this.clearSession();
              resolve(false);
              return;
            }

            // Verifica dati utente dopo riautenticazione
            const userData = await new Promise((res) => {
              gun
                .get(DAPP_NAME)
                .get("users")
                .get(userPub)
                .once((data) => {
                  res(data);
                });
            });

            if (userData) {
              console.log("Riautenticazione completata con successo");
              resolve(true);
            } else {
              console.log("Dati utente non trovati dopo riautenticazione");
              this.clearSession();
              resolve(false);
            }
          });
          return;
        }

        resolve(false);
      } catch (error) {
        console.error("Errore verifica autenticazione:", error);
        this.clearSession();
        resolve(false);
      }
    });
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
      const keysToKeep = ["theme", "language"];

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

      console.log("Sessione pulita con successo");
    } catch (error) {
      console.error("Errore nella pulizia della sessione:", error);
    }
  },

  /**
   * Verifica se esiste una sessione valida
   * @returns {Promise<boolean>}
   */
  async validateSession() {
    try {
      const isAuthenticated =
        localStorage.getItem("isAuthenticated") === "true";
      const sessionData = localStorage.getItem("sessionData");
      const lastLogin = parseInt(localStorage.getItem("lastLogin") || "0");
      const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 ore

      if (
        !isAuthenticated ||
        !sessionData ||
        Date.now() - lastLogin > SESSION_TIMEOUT
      ) {
        console.log("Sessione non valida o scaduta");
        this.clearSession();
        return false;
      }

      // Verifica che l'utente sia ancora autenticato
      if (!user.is?.pub) {
        console.log("Utente non autenticato");
        this.clearSession();
        return false;
      }

      // Verifica che il pub dell'utente corrisponda
      const parsedSessionData = JSON.parse(sessionData);
      if (parsedSessionData.pub !== user.is.pub) {
        console.log("Mismatch tra pub della sessione e utente corrente");
        this.clearSession();
        return false;
      }

      // Verifica che le chiavi necessarie siano presenti
      if (
        !parsedSessionData.pair ||
        !parsedSessionData.v_Pair ||
        !parsedSessionData.s_Pair
      ) {
        console.log("Chiavi di cifratura mancanti nella sessione");
        this.clearSession();
        return false;
      }

      // Verifica che i dati essenziali siano presenti
      const username = localStorage.getItem("username");
      const userPub = localStorage.getItem("userPub");
      if (!username || !userPub || userPub !== user.is.pub) {
        console.log("Dati utente mancanti o non corrispondenti");
        this.clearSession();
        return false;
      }

      // Verifica che i dati nel nodo Gun corrispondano
      const gunData = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("users")
          .get(user.is.pub)
          .once((data) => {
            resolve(data);
          });
      });

      if (!gunData) {
        console.log("Dati utente non trovati in Gun");
        this.clearSession();
        return false;
      }

      // Se tutto è ok, aggiorna il timestamp
      localStorage.setItem("lastLogin", Date.now().toString());
      return true;
    } catch (error) {
      console.error("Errore nella validazione della sessione:", error);
      this.clearSession();
      return false;
    }
  },

  /**
   * Osserva i cambiamenti nello stato di autenticazione
   * @param {Function} callback - Funzione da chiamare quando lo stato cambia
   * @returns {Function} Funzione per rimuovere l'observer
   */
  observeAuthState(callback) {
    if (typeof callback !== "function") {
      throw new Error("Il callback deve essere una funzione");
    }

    const checkAuth = async () => {
      const isValid = await this.validateSession();
      callback({
        isAuthenticated: isValid,
        user: user.is,
        pub: user.is?.pub,
      });
    };

    // Controlla subito lo stato
    checkAuth();

    // Osserva i cambiamenti dell'utente
    const observer = gun.on("auth", async () => {
      await checkAuth();
    });

    // Ritorna una funzione per rimuovere l'observer
    return () => {
      gun.off("auth", observer);
    };
  },
};

export default sessionManager;
