import {
  gun,
  user,
  DAPP_NAME,
  walletManager,
  gunAuthManager,
} from "../useGun.js";
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from "../security/index.js";
import { updateGlobalMetrics } from "../system/systemService.js";
import { sessionManager } from "./sessionManager.js";

const LOGIN_TIMEOUT = 30000;
let isAuthenticating = false;
let authTimeout = null;
let authRetries = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

const resetAuthState = async (clearUser = true) => {
  console.log("Resetting auth state...");
  isAuthenticating = false;
  authRetries = 0;

  if (authTimeout) {
    clearTimeout(authTimeout);
    authTimeout = null;
  }

  if (clearUser) {
    if (user.is) {
      console.log("Logging out user...");
      user.leave();
    }
    sessionManager.clearSession();
    // Attendi che il logout sia completato
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("Auth state reset complete");
};

const waitForAuth = async (timeout = LOGIN_TIMEOUT) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let checkInterval;

    const checkAuth = () => {
      if (!isAuthenticating) {
        clearInterval(checkInterval);
        resolve();
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        reject(new Error("Timeout durante attesa autenticazione"));
      }
    };

    checkInterval = setInterval(checkAuth, 100);
  });
};

const verifyAuthentication = async (maxAttempts = 30) => {
  console.log("Verifica autenticazione...");

  try {
    // Verifica che gunAuthManager sia disponibile
    if (!gunAuthManager) {
      throw new Error("GunAuthManager non inizializzato");
    }

    // Verifica che l'utente sia autenticato usando gunAuthManager
    for (let i = 0; i < maxAttempts; i++) {
      if (gunAuthManager.isAuthenticated()) {
        const pub = gunAuthManager.getPublicKey();
        console.log("Utente autenticato:", pub);
        return true;
      }
      console.log(`Tentativo ${i + 1}/${maxAttempts}...`);
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log("Verifica autenticazione fallita");
    return false;
  } catch (error) {
    console.error("Errore durante la verifica dell'autenticazione:", error);
    return false;
  }
};

const saveSession = async (userData, wallet) => {
  try {
    // Verifica che l'utente sia autenticato
    if (!user.is?.pub) {
      console.warn("Attendo autenticazione completa...");
      const isAuthenticated = await verifyAuthentication();
      if (!isAuthenticated) {
        throw new Error(
          "Utente non autenticato per il salvataggio della sessione"
        );
      }
    }

    // Attendi che il WalletManager sia pronto
    await new Promise((r) => setTimeout(r, 2000));

    let keyPair = null;
    let attempts = 0;
    const maxAttempts = 3;

    // Se abbiamo chiavi WebAuthn, usiamo quelle
    if (userData.encryptionKeys) {
      console.log("Uso chiavi WebAuthn fornite");
      keyPair = userData.encryptionKeys;
      // Assicurati che il walletManager abbia le chiavi corrette
      walletManager.setCurrentUserKeyPair(userData.encryptionKeys);
    } else {
      while (!keyPair && attempts < maxAttempts) {
        attempts++;
        console.log(
          `Tentativo ${attempts}/${maxAttempts} di ottenere le chiavi`
        );

        try {
          // Prima prova dal WalletManager
          keyPair = walletManager.getCurrentUserKeyPair();
          if (keyPair) {
            console.log("Chiavi ottenute dal WalletManager");
            break;
          }

          // Se non disponibile, prova da user._.sea
          if (user._.sea) {
            console.log("Tentativo recupero chiavi da user._.sea");
            keyPair = {
              pub: user._.sea.pub,
              priv: user._.sea.priv,
              epub: user._.sea.epub,
              epriv: user._.sea.epriv,
            };
            if (Object.values(keyPair).every((k) => k)) {
              console.log("Chiavi recuperate da user._.sea");
              break;
            }
          }

          // Se ancora non disponibile, prova da user.is
          if (user.is) {
            console.log("Tentativo recupero chiavi da user.is");
            keyPair = {
              pub: user.is.pub,
              priv: user.is.priv,
              epub: user.is.epub,
              epriv: user.is.epriv,
            };
            if (Object.values(keyPair).every((k) => k)) {
              console.log("Chiavi recuperate da user.is");
              break;
            }
          }

          console.log("Attendo prima del prossimo tentativo...");
          await new Promise((r) => setTimeout(r, 1000));
        } catch (err) {
          console.warn(`Errore nel tentativo ${attempts}:`, err);
        }
      }
    }

    if (!keyPair) {
      throw new Error("Impossibile ottenere le chiavi dopo multipli tentativi");
    }

    // Verifica dettagliata delle chiavi
    const keyCheck = {
      pub: { exists: !!keyPair.pub, length: keyPair.pub?.length },
      priv: { exists: !!keyPair.priv, length: keyPair.priv?.length },
      epub: { exists: !!keyPair.epub, length: keyPair.epub?.length },
      epriv: { exists: !!keyPair.epriv, length: keyPair.epriv?.length },
    };

    console.log("Verifica dettagliata chiavi:", keyCheck);

    if (!Object.values(keyCheck).every((k) => k.exists && k.length > 0)) {
      throw new Error("Chiavi di cifratura incomplete o invalide");
    }

    const sessionData = {
      pub: keyPair.pub,
      epub: keyPair.epub,
      address: wallet.address,
      internalWalletAddress: wallet.address,
      externalWalletAddress: userData.externalWalletAddress || null,
      createdAt: userData.createdAt || Date.now(),
      authType: userData.authType || "credentials",
      lastSeen: Date.now(),
      pair: {
        pub: keyPair.pub,
        priv: keyPair.priv,
        epub: keyPair.epub,
        epriv: keyPair.epriv,
      },
      credentials: {
        username: userData.username,
        password: userData.password || "",
      },
    };

    // Verifica che i dati della sessione siano completi
    if (!sessionData.pub || !sessionData.pair.pub) {
      throw new Error("Dati sessione incompleti");
    }

    console.log("Tentativo salvataggio sessione con dati:", {
      ...sessionData,
      pair: {
        pub: sessionData.pair.pub,
        hasPriv: !!sessionData.pair.priv,
        hasEpub: !!sessionData.pair.epub,
        hasEpriv: !!sessionData.pair.epriv,
      },
      credentials: "HIDDEN",
    });

    // Per WebAuthn, salva anche le chiavi nel localStorage
    if (userData.authType === "webauthn") {
      localStorage.setItem(
        `webauthn_keys_${sessionData.pub}`,
        JSON.stringify({
          pub: keyPair.pub,
          priv: keyPair.priv,
          epub: keyPair.epub,
          epriv: keyPair.epriv,
        })
      );
    }

    const saved = await sessionManager.saveSession(sessionData);
    if (!saved) {
      throw new Error("Errore nel salvataggio della sessione");
    }

    // Verifica che la sessione sia stata salvata correttamente
    const isValid = await sessionManager.validateSession();
    if (!isValid) {
      throw new Error("Validazione sessione fallita");
    }

    console.log("Sessione salvata e validata con successo");
    return true;
  } catch (error) {
    console.error("Errore dettagliato salvataggio sessione:", error);
    sessionManager.clearSession();
    throw error;
  }
};

const createCertificates = async () => {
  try {
    console.log("Inizio processo creazione certificati...");

    // Segnala che stiamo creando i certificati
    localStorage.setItem("creatingCertificates", "true");
    console.log("Flag creatingCertificates impostato");

    // Verifica che l'utente sia autenticato
    if (!user.pair().pub) {
      console.warn("Utente non autenticato, attendo...");
      const isAuthenticated = await verifyAuthentication();
      console.log("Risultato verifica autenticazione:", { isAuthenticated });
      if (!isAuthenticated) {
        throw new Error(
          "Utente non autenticato per la creazione dei certificati"
        );
      }
    }

    // Verifica che la sessione sia valida
    const isSessionValid = await sessionManager.validateSession();
    console.log("Verifica validità sessione:", { isSessionValid });
    if (!isSessionValid) {
      throw new Error("Sessione non valida per la creazione dei certificati");
    }

    // Salva una copia delle chiavi per il ripristino
    const sessionData = JSON.parse(localStorage.getItem("sessionData"));
    console.log("Backup sessione:", {
      hasSessionData: !!sessionData,
      hasPair: !!sessionData?.pair,
      pairDetails: sessionData?.pair
        ? {
            hasPub: !!sessionData.pair.pub,
            hasPriv: !!sessionData.pair.priv,
          }
        : null,
    });

    const backupKeys = sessionData?.pair ? { ...sessionData.pair } : null;
    const backupSession = sessionData ? { ...sessionData } : null;

    if (!backupKeys || !backupSession) {
      throw new Error("Impossibile effettuare backup della sessione");
    }

    console.log("Inizio creazione certificati con pub:", user.is.pub);

    try {
      // Crea i certificati in sequenza
      console.log("Creazione certificato richieste amicizia...");
      await createFriendRequestCertificate();
      console.log("Certificato richieste amicizia creato");

      console.log("Creazione certificato notifiche...");
      await createNotificationCertificate();
      console.log("Certificato notifiche creato");

      console.log("Certificati creati con successo");
    } catch (error) {
      console.error("Errore durante la creazione dei certificati:", error);

      // In caso di errore, ripristina la sessione completa
      if (backupSession) {
        console.log("Tentativo ripristino sessione dopo errore...");
        localStorage.setItem("sessionData", JSON.stringify(backupSession));
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("userPub", backupSession.pub);
        console.log("Sessione ripristinata dopo errore");
      }
      throw error;
    } finally {
      // Verifica finale della sessione prima di rimuovere il flag
      console.log("Verifica finale sessione...");
      const isStillValid = await sessionManager.validateSession();
      console.log("Risultato verifica finale:", { isStillValid });

      if (isStillValid) {
        console.log("Rimozione flag creazione certificati...");
        localStorage.removeItem("creatingCertificates");
        console.log("Flag creazione certificati rimosso");
      } else {
        // Se la sessione non è più valida, tenta di ripristinarla
        console.log("Sessione non valida nel finally, tentativo ripristino...");
        if (backupSession) {
          localStorage.setItem("sessionData", JSON.stringify(backupSession));
          localStorage.setItem("isAuthenticated", "true");
          localStorage.setItem("userPub", backupSession.pub);
          console.log("Sessione ripristinata nel finally block");
          // Mantieni il flag per permettere un nuovo tentativo
          console.log(
            "Flag creazione certificati mantenuto per nuovo tentativo"
          );
        }
      }
    }

    // Verifica finale dopo il finally
    const finalCheck = await sessionManager.validateSession();
    console.log("Verifica finale dopo finally:", { finalCheck });
    if (!finalCheck) {
      throw new Error("Sessione non valida dopo la creazione dei certificati");
    }

    return true;
  } catch (error) {
    console.error("Errore nella creazione dei certificati:", error);
    // Non rimuovere il flag in caso di errore per permettere un nuovo tentativo
    return false;
  }
};

export const loginWithMetaMask = async (address) => {
  try {
    if (!address || typeof address !== "string") {
      throw new Error("Indirizzo non valido");
    }

    const normalizedAddress = address.toLowerCase();
    console.log("Tentativo login con indirizzo:", normalizedAddress);

    // Verifica se l'utente esiste
    const existingUser = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("addresses")
        .get(normalizedAddress)
        .once((data) => {
          resolve(data);
        });
    });

    if (!existingUser || !existingUser.pub) {
      throw new Error("Utente non trovato");
    }

    // Usa l'EthereumManager per il login
    const ethereumManager = walletManager.getEthereumManager();
    const pubKey = await ethereumManager.loginWithEthereum();

    if (!pubKey) {
      throw new Error("Login con MetaMask fallito");
    }

    // Verifica che l'autenticazione sia avvenuta con successo
    const isAuthenticated = await verifyAuthentication();
    if (!isAuthenticated) {
      throw new Error("Verifica autenticazione fallita");
    }

    // Recupera il wallet
    const wallet = await walletManager.retrieveWallet(pubKey);
    if (!wallet) {
      throw new Error("Wallet non trovato");
    }

    // Aggiorna last seen usando savePublicData
    await gunAuthManager.savePublicData(
      { lastSeen: Date.now() },
      `users/${pubKey}/lastSeen`
    );

    // Prepara i dati per la sessione
    const displayName = `${address.slice(0, 6)}...${address.slice(-4)}`;
    const userData = {
      ...existingUser,
      displayName,
      address: normalizedAddress,
      username: normalizedAddress,
      lastSeen: Date.now(),
      authType: "metamask",
    };

    // Salva la sessione
    await saveSession(userData, wallet);

    // Aggiorna metriche e crea certificati
    await updateGlobalMetrics("totalLogins", 1);
    await createCertificates();

    return {
      success: true,
      pub: pubKey,
      userData,
    };
  } catch (error) {
    console.error("Errore login:", error);
    if (user.is) {
      user.leave();
    }
    sessionManager.clearSession();
    throw error;
  }
};

export const loginUser = async (credentials = {}) => {
  try {
    console.log("Starting login process for:", credentials.username);

    // Reset completo dello stato all'inizio
    await resetAuthState(true);
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log("Attempting login with credentials:", credentials);
    isAuthenticating = true;

    // Imposta un timeout globale per l'autenticazione
    authTimeout = setTimeout(async () => {
      console.log("Global authentication timeout reached");
      await resetAuthState(true);
    }, LOGIN_TIMEOUT);

    try {
      // Verifica che non ci siano autenticazioni in corso
      if (gunAuthManager.isAuthenticated()) {
        console.log("User already authenticated, logging out...");
        gunAuthManager.logout();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log("Attempting login with gunAuthManager...");
      const userPub = await gunAuthManager.login(
        credentials.username,
        credentials.password
      );

      if (!userPub) {
        throw new Error("Login failed - No userPub received");
      }

      console.log("UserPub obtained:", userPub);

      // Verifica immediata dell'autenticazione
      let authVerified = false;
      for (let checkAttempt = 0; checkAttempt < 10; checkAttempt++) {
        if (gunAuthManager.isAuthenticated()) {
          authVerified = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (!authVerified) {
        throw new Error("Immediate authentication verification failed");
      }

      // Recupera i dati utente
      let userData = null;
      try {
        userData = await gunAuthManager.getPrivateData(`users/${userPub}`);
      } catch (error) {
        console.log("Errore nel recupero dati privati:", error);
      }

      if (!userData) {
        // Se non troviamo i dati, creiamo un profilo base
        console.log("Creating basic user profile...");
        const basicProfile = {
          pub: userPub,
          username: credentials.username,
          createdAt: Date.now(),
          lastSeen: Date.now()
        };

        // Salva il profilo base direttamente su Gun invece di usare savePublicData
        await new Promise((resolve, reject) => {
          gun.get(DAPP_NAME)
            .get('users')
            .get(userPub)
            .put(basicProfile, (ack) => {
              if (ack.err) {
                reject(new Error(ack.err));
              } else {
                userData = basicProfile;
                resolve();
              }
            });
        });
      }

      // Aggiorna last seen direttamente su Gun
      await new Promise((resolve, reject) => {
        gun.get(DAPP_NAME)
          .get('users')
          .get(userPub)
          .get('lastSeen')
          .put(Date.now(), (ack) => {
            if (ack.err) {
              reject(new Error(ack.err));
            } else {
              resolve();
            }
          });
      });

      // Verifica che l'utente sia ancora autenticato
      if (!gunAuthManager.isAuthenticated()) {
        console.log("Utente non più autenticato, tentativo di riautenticazione...");
        await gunAuthManager.login(credentials.username, credentials.password);
        
        // Verifica nuovamente
        if (!gunAuthManager.isAuthenticated()) {
          throw new Error("Riautenticazione fallita");
        }
      }

      // Ottieni le chiavi di cifratura
      const pair = gunAuthManager.getPair();
      if (!pair || !pair.pub) {
        throw new Error("Impossibile ottenere le chiavi di cifratura");
      }

      // Salva la sessione con le chiavi complete
      const sessionData = {
        pub: userPub,
        pair: pair,
        credentials: {
          username: credentials.username,
          password: credentials.password
        },
        lastSeen: Date.now()
      };

      console.log("Tentativo salvataggio sessione...");
      const saved = await sessionManager.saveSession(sessionData);
      if (!saved) {
        throw new Error("Error saving session");
      }
      console.log("Sessione salvata con successo");

      console.log("Login completed successfully");
      return {
        success: true,
        pub: userPub,
        userData
      };

    } catch (error) {
      console.error("Login error:", error);
      await resetAuthState(true);
      throw error;
    } finally {
      clearTimeout(authTimeout);
      isAuthenticating = false;
    }
  } catch (error) {
    console.error("Login error:", error);
    await resetAuthState(true);
    throw error;
  }
};

export default loginUser;
