import { gun, user, DAPP_NAME, walletManager } from '../useGun.js';
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from '../security/index.js';
import { updateGlobalMetrics } from '../system/systemService.js';
import { sessionManager } from './sessionManager.js';
import { WalletManager } from "@scobru/shogun";

const LOGIN_TIMEOUT = 15000;

const verifyAuthentication = async (maxAttempts = 30) => {
  console.log('Verifica autenticazione...');
  for (let i = 0; i < maxAttempts; i++) {
  
    if (user) {
      console.log('Utente autenticato:', user);
      return true;
    }
    console.log(`Tentativo ${i + 1}/${maxAttempts}...`);
    await new Promise(r => setTimeout(r, 500)); // Aumentato il delay
  }
  console.log('Verifica autenticazione fallita');
  return false;
};

const saveSession = async (userData, wallet) => {
  try {
    // Verifica che l'utente sia autenticato
    if (!user.is?.pub) {
      console.warn('Attendo autenticazione completa...');
      const isAuthenticated = await verifyAuthentication();
      if (!isAuthenticated) {
        throw new Error('Utente non autenticato per il salvataggio della sessione');
      }
    }

    // Attendi che il WalletManager sia pronto
    await new Promise(r => setTimeout(r, 2000));

    let keyPair = null;
    let attempts = 0;
    const maxAttempts = 3;

    // Se abbiamo chiavi WebAuthn, usiamo quelle
    if (userData.encryptionKeys) {
      console.log('Uso chiavi WebAuthn fornite');
      keyPair = userData.encryptionKeys;
      // Assicurati che il walletManager abbia le chiavi corrette
      walletManager.setCurrentUserKeyPair(userData.encryptionKeys);
    } else {
      while (!keyPair && attempts < maxAttempts) {
        attempts++;
        console.log(`Tentativo ${attempts}/${maxAttempts} di ottenere le chiavi`);

        try {
          // Prima prova dal WalletManager
          keyPair = walletManager.getCurrentUserKeyPair();
          if (keyPair) {
            console.log('Chiavi ottenute dal WalletManager');
            break;
          }

          // Se non disponibile, prova da user._.sea
          if (user._.sea) {
            console.log('Tentativo recupero chiavi da user._.sea');
            keyPair = {
              pub: user._.sea.pub,
              priv: user._.sea.priv,
              epub: user._.sea.epub,
              epriv: user._.sea.epriv
            };
            if (Object.values(keyPair).every(k => k)) {
              console.log('Chiavi recuperate da user._.sea');
              break;
            }
          }

          // Se ancora non disponibile, prova da user.is
          if (user.is) {
            console.log('Tentativo recupero chiavi da user.is');
            keyPair = {
              pub: user.is.pub,
              priv: user.is.priv,
              epub: user.is.epub,
              epriv: user.is.epriv
            };
            if (Object.values(keyPair).every(k => k)) {
              console.log('Chiavi recuperate da user.is');
              break;
            }
          }

          console.log('Attendo prima del prossimo tentativo...');
          await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
          console.warn(`Errore nel tentativo ${attempts}:`, err);
        }
      }
    }

    if (!keyPair) {
      throw new Error('Impossibile ottenere le chiavi dopo multipli tentativi');
    }

    // Verifica dettagliata delle chiavi
    const keyCheck = {
      pub: { exists: !!keyPair.pub, length: keyPair.pub?.length },
      priv: { exists: !!keyPair.priv, length: keyPair.priv?.length },
      epub: { exists: !!keyPair.epub, length: keyPair.epub?.length },
      epriv: { exists: !!keyPair.epriv, length: keyPair.epriv?.length }
    };

    console.log('Verifica dettagliata chiavi:', keyCheck);

    if (!Object.values(keyCheck).every(k => k.exists && k.length > 0)) {
      throw new Error('Chiavi di cifratura incomplete o invalide');
    }

    const sessionData = {
      pub: keyPair.pub,
      epub: keyPair.epub,
      address: wallet.address,
      internalWalletAddress: wallet.address,
      externalWalletAddress: userData.externalWalletAddress || null,
      createdAt: userData.createdAt || Date.now(),
      authType: userData.authType || 'credentials',
      lastSeen: Date.now(),
      pair: {
        pub: keyPair.pub,
        priv: keyPair.priv,
        epub: keyPair.epub,
        epriv: keyPair.epriv
      },
      credentials: {
        username: userData.username,
        password: userData.password || '',
      },
    };

    // Verifica che i dati della sessione siano completi
    if (!sessionData.pub || !sessionData.pair.pub) {
      throw new Error('Dati sessione incompleti');
    }

    console.log('Tentativo salvataggio sessione con dati:', {
      ...sessionData,
      pair: {
        pub: sessionData.pair.pub,
        hasPriv: !!sessionData.pair.priv,
        hasEpub: !!sessionData.pair.epub,
        hasEpriv: !!sessionData.pair.epriv
      },
      credentials: 'HIDDEN'
    });

    // Per WebAuthn, salva anche le chiavi nel localStorage
    if (userData.authType === 'webauthn') {
      localStorage.setItem(
        `webauthn_keys_${sessionData.pub}`,
        JSON.stringify({
          pub: keyPair.pub,
          priv: keyPair.priv,
          epub: keyPair.epub,
          epriv: keyPair.epriv
        })
      );
    }

    const saved = await sessionManager.saveSession(sessionData);
    if (!saved) {
      throw new Error('Errore nel salvataggio della sessione');
    }

    // Verifica che la sessione sia stata salvata correttamente
    const isValid = await sessionManager.validateSession();
    if (!isValid) {
      throw new Error('Validazione sessione fallita');
    }

    console.log('Sessione salvata e validata con successo');
    return true;
  } catch (error) {
    console.error('Errore dettagliato salvataggio sessione:', error);
    sessionManager.clearSession();
    throw error;
  }
};

const createCertificates = async () => {
  try {
    console.log('Inizio processo creazione certificati...');
    
    // Segnala che stiamo creando i certificati
    localStorage.setItem('creatingCertificates', 'true');
    console.log('Flag creatingCertificates impostato');

    // Verifica che l'utente sia autenticato
    if (!user.pair().pub) {
      console.warn('Utente non autenticato, attendo...');
      const isAuthenticated = await verifyAuthentication();
      console.log('Risultato verifica autenticazione:', { isAuthenticated });
      if (!isAuthenticated) {
        throw new Error('Utente non autenticato per la creazione dei certificati');
      }
    }

    // Verifica che la sessione sia valida
    const isSessionValid = await sessionManager.validateSession();
    console.log('Verifica validità sessione:', { isSessionValid });
    if (!isSessionValid) {
      throw new Error('Sessione non valida per la creazione dei certificati');
    }

    // Salva una copia delle chiavi per il ripristino
    const sessionData = JSON.parse(localStorage.getItem('sessionData'));
    console.log('Backup sessione:', {
      hasSessionData: !!sessionData,
      hasPair: !!sessionData?.pair,
      pairDetails: sessionData?.pair ? {
        hasPub: !!sessionData.pair.pub,
        hasPriv: !!sessionData.pair.priv
      } : null
    });

    const backupKeys = sessionData?.pair ? { ...sessionData.pair } : null;
    const backupSession = sessionData ? { ...sessionData } : null;

    if (!backupKeys || !backupSession) {
      throw new Error('Impossibile effettuare backup della sessione');
    }

    console.log('Inizio creazione certificati con pub:', user.is.pub);

    try {
      // Crea i certificati in sequenza
      console.log('Creazione certificato richieste amicizia...');
      await createFriendRequestCertificate();
      console.log('Certificato richieste amicizia creato');
      
      console.log('Creazione certificato notifiche...');
      await createNotificationCertificate();
      console.log('Certificato notifiche creato');
      
      console.log('Certificati creati con successo');
    } catch (error) {
      console.error('Errore durante la creazione dei certificati:', error);
      
      // In caso di errore, ripristina la sessione completa
      if (backupSession) {
        console.log('Tentativo ripristino sessione dopo errore...');
        localStorage.setItem('sessionData', JSON.stringify(backupSession));
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userPub', backupSession.pub);
        console.log('Sessione ripristinata dopo errore');
      }
      throw error;
    } finally {
      // Verifica finale della sessione prima di rimuovere il flag
      console.log('Verifica finale sessione...');
      const isStillValid = await sessionManager.validateSession();
      console.log('Risultato verifica finale:', { isStillValid });
      
      if (isStillValid) {
        console.log('Rimozione flag creazione certificati...');
        localStorage.removeItem('creatingCertificates');
        console.log('Flag creazione certificati rimosso');
      } else {
        // Se la sessione non è più valida, tenta di ripristinarla
        console.log('Sessione non valida nel finally, tentativo ripristino...');
        if (backupSession) {
          localStorage.setItem('sessionData', JSON.stringify(backupSession));
          localStorage.setItem('isAuthenticated', 'true');
          localStorage.setItem('userPub', backupSession.pub);
          console.log('Sessione ripristinata nel finally block');
          // Mantieni il flag per permettere un nuovo tentativo
          console.log('Flag creazione certificati mantenuto per nuovo tentativo');
        }
      }
    }

    // Verifica finale dopo il finally
    const finalCheck = await sessionManager.validateSession();
    console.log('Verifica finale dopo finally:', { finalCheck });
    if (!finalCheck) {
      throw new Error('Sessione non valida dopo la creazione dei certificati');
    }

    return true;
  } catch (error) {
    console.error('Errore nella creazione dei certificati:', error);
    // Non rimuovere il flag in caso di errore per permettere un nuovo tentativo
    return false;
  }
};

export const loginWithMetaMask = async (address) => {
  try {
    if (!address || typeof address !== 'string') {
      throw new Error('Indirizzo non valido');
    }

    const normalizedAddress = address.toLowerCase();
    console.log('Tentativo login con indirizzo:', normalizedAddress);

    // Verifica se l'utente esiste
    const existingUser = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('addresses')
        .get(normalizedAddress)
        .once((data) => {
          resolve(data);
        });
    });

    if (!existingUser || !existingUser.pub) {
      throw new Error('Utente non trovato');
    }

    // Usa l'EthereumManager per il login
    const ethereumManager = walletManager.getEthereumManager();
    const pubKey = await ethereumManager.loginWithEthereum();

    if (!pubKey) {
      throw new Error('Login con MetaMask fallito');
    }

    // Verifica che l'autenticazione sia avvenuta con successo
    const isAuthenticated = await verifyAuthentication();
    if (!isAuthenticated) {
      throw new Error('Verifica autenticazione fallita');
    }

    // Recupera il wallet
    const wallet = await walletManager.retrieveWallet(pubKey);
    if (!wallet) {
      throw new Error('Wallet non trovato');
    }

    // Aggiorna last seen
    await gun
      .get(DAPP_NAME)
      .get('users')
      .get(pubKey)
      .get('lastSeen')
      .put(Date.now());

    // Prepara i dati per la sessione
    const displayName = `${address.slice(0, 6)}...${address.slice(-4)}`;
    const userData = {
      ...existingUser,
      displayName,
      address: normalizedAddress,
      username: normalizedAddress,
      lastSeen: Date.now(),
      authType: 'metamask'
    };

    // Salva la sessione
    await saveSession(userData, wallet);

    // Aggiorna metriche e crea certificati
    await updateGlobalMetrics('totalLogins', 1);
    await createCertificates();

    return {
      success: true,
      pub: pubKey,
      userData
    };
  } catch (error) {
    console.error('Errore login:', error);
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

    // Se abbiamo le chiavi di cifratura WebAuthn, le usiamo direttamente
    if (credentials.encryptionKeys) {
      console.log("Usando chiavi WebAuthn fornite");
      // Imposta le chiavi nel walletManager
      walletManager.setCurrentUserKeyPair(credentials.encryptionKeys);
    }

    // Verifica autenticazione
    const userPub = await walletManager.login(credentials.username, credentials.password);

    console.log("Utente autenticato:", userPub);

    // Recupera i dati utente
    const userData = await gun
      .get(DAPP_NAME)
      .get("users")
      .get(userPub)
      .then();

    if (!userData) {
      throw new Error("Dati utente non trovati");
    }

    // Verifica se l'utente è WebAuthn
    const isWebAuthn = userData.authType === "webauthn";

    // Recupera il wallet e le chiavi
    let wallet;
    let encryptionKeys = credentials.encryptionKeys;
    
    if (isWebAuthn) {
      // Per utenti WebAuthn, prima cerca nel localStorage
      const localWallet = localStorage.getItem(`gunWallet_${userPub}`);
      if (localWallet) {
        const walletData = JSON.parse(localWallet);
        wallet = {
          address: walletData.internalWalletAddress,
          privateKey: walletData.internalWalletPk
        };
        
        // Se non abbiamo già le chiavi, le recuperiamo
        if (!encryptionKeys) {
          encryptionKeys = walletManager.getCurrentUserKeyPair();
          if (!encryptionKeys) {
            throw new Error("Chiavi di cifratura WebAuthn non trovate");
          }
        }
      }
    }

    // Se non abbiamo trovato il wallet nel localStorage, lo creiamo
    if (!wallet) {
      // Per WebAuthn usa le chiavi di cifratura specifiche
      const keysToUse = isWebAuthn ? encryptionKeys : user._.sea;
      if (!keysToUse) {
        throw new Error("Chiavi di cifratura non disponibili");
      }

      const walletResult = await WalletManager.createWalletObj(keysToUse);
      wallet = walletResult.walletObj;

      // Salva il nuovo wallet nel localStorage per utenti WebAuthn
      if (isWebAuthn) {
        localStorage.setItem(
          `gunWallet_${userPub}`,
          JSON.stringify({
            internalWalletAddress: wallet.address,
            internalWalletPk: wallet.privateKey
          })
        );
      }
    }

    // Aggiorna userData con le chiavi di cifratura per WebAuthn
    if (isWebAuthn && encryptionKeys) {
      userData.encryptionKeys = encryptionKeys;
    }

    // Salva la sessione
    await saveSession(userData, wallet);

    return {
      success: true,
      pub: userPub,
      userData: {
        ...userData,
        wallet: {
          address: wallet.address
        }
      }
    };
  } catch (error) {
    console.error("Errore login:", error);
    throw error;
  }
};

export default loginUser;
