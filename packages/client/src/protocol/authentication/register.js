import { gun, user, DAPP_NAME, ethereumManager, walletManager , gunAuthManager , stealthManager} from "../useGun";
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from "../security/index";
import { updateGlobalMetrics ,  } from "../system/systemService";
import { avatarService } from "../utils/avatarService";
import { sessionManager } from "./sessionManager";

const LOGIN_TIMEOUT = 5000; // Ridotto da 10 a 5 secondi

// Inizializza StealthChain
const stealthChain = stealthManager

export const registerWithMetaMask = async (address) => {
  try {
    if (!address || typeof address !== "string") {
      throw new Error("Indirizzo non valido");
    }

    const normalizedAddress = address.toLowerCase();
    console.log("Avvio registrazione con indirizzo:", normalizedAddress);

    // Verifica se l'utente esiste già
    const existingUser = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("addresses")
        .get(normalizedAddress)
        .once((data) => {
          resolve(data);
        });
    });

    if (existingUser && existingUser.pub) {
      throw new Error("Utente già registrato con questo indirizzo");
    }

    // Usa il WalletManager per creare l'account Ethereum
    const pubKey = await ethereumManager.createAccount();

    if (!pubKey) {
      throw new Error("Errore durante la creazione dell'account");
    }

    // Crea il wallet principale
    const mainWallet = await walletManager.getWallet()

    // Genera le chiavi stealth
    const stealthKeys = await new Promise((resolve, reject) => {
      stealthChain.createAccount((error, keys) => {
        if (error) {
          console.error("Errore generazione chiavi stealth:", error);
          reject(error);
          return;
        }
        console.log("Chiavi stealth generate:", keys);
        resolve(keys);
      });
    });

    if (!stealthKeys?.pub) {
      throw new Error("Errore nella generazione delle chiavi stealth");
    }

    // Prepara i dati utente
    const userDataToSave = {
      pub: user._.sea.pub,
      epub: user._.sea.epub,
      address: mainWallet.address,
      internalWalletAddress: mainWallet.address,
      externalWalletAddress: normalizedAddress,
      viewingPublicKey: stealthKeys.pub,
      spendingPublicKey: stealthKeys.epub,
      createdAt: Date.now(),
      authType: "metamask",
      lastSeen: Date.now(),
    };

    // Salva le chiavi private in modo sicuro usando savePrivateData
    await gunAuthManager.savePrivateData({
      viewingPrivateKey: stealthKeys.priv,
      spendingPrivateKey: stealthKeys.epriv
    }, "stealth-keys");

    // Salva i dati pubblici usando savePublicData
    await Promise.all([
      gunAuthManager.savePublicData(userDataToSave, `addresses/${normalizedAddress}`),
      gunAuthManager.savePublicData(userDataToSave, `users/${user._.sea.pub}`)
    ]);

    // Salva il wallet localmente
    await walletManager.saveWallet(mainWallet, user._.sea.pub);

    // Aggiorna metriche e crea certificati
    await Promise.all([
      updateGlobalMetrics("totalUsers", 1),
      createFriendRequestCertificate(),
      createNotificationCertificate(),
    ]);

    // Genera e salva l'avatar predefinito
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${normalizedAddress}&backgroundColor=b6e3f4`;
    const avatarResponse = await fetch(defaultAvatar);
    const avatarBlob = await avatarResponse.blob();
    const avatarBase64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(avatarBlob);
    });

    await avatarService.saveAvatar(user._.sea.pub, avatarBase64);

    return {
      success: true,
      pub: user._.sea.pub,
      userData: {
        ...userDataToSave,
        avatar: avatarBase64,
      },
    };
  } catch (error) {
    console.error("Errore in registerWithMetaMask:", error);

    // Pulizia in caso di errore
    if (user.is) {
      user.leave();
    }

    throw error;
  }
};

export const registerUser = async (credentials = {}, callback = () => {}) => {
  try {
    if (!credentials.username || !credentials.password) {
      throw new Error("Username and password are required");
    }

    console.log('Creating Account...')
    // Usa il GunAuthManager per creare l'account
    const pair = await gunAuthManager.createAccount(credentials.username, credentials.password);
    console.log("Account created with pub:", pair.pub)

    if (!pair || !pair.pub) {
      throw new Error("Failed to create account");
    }

    // Attendi un momento per permettere a Gun di stabilizzarsi
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verifica che l'utente sia autenticato con retry
    let authVerified = false;
    for (let i = 0; i < 20; i++) {
      console.log(`Tentativo verifica autenticazione ${i + 1}/20...`);
      if (gunAuthManager.isAuthenticated()) {
        console.log("Autenticazione verificata con successo");
        authVerified = true;
        break;
      }
      console.log("Attendo 500ms prima del prossimo tentativo...");
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!authVerified) {
      console.error("Verifica autenticazione fallita dopo tutti i tentativi");
      // Invece di lanciare un errore, proviamo a riautenticare
      console.log("Tentativo di riautenticazione...");
      await gunAuthManager.logout();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("Tentativo login esplicito...");
    // Effettua il login esplicito dopo la creazione dell'account
    const loginResult = await gunAuthManager.login(credentials.username, credentials.password);
    console.log("Login result:", loginResult);

    console.log("Verifica finale autenticazione...");
    // Verifica nuovamente l'autenticazione
    if (!gunAuthManager.isAuthenticated()) {
      console.error("Autenticazione fallita dopo login esplicito");
      throw new Error("Authentication failed after explicit login");
    }
    console.log("Autenticazione completata con successo");

    // Se sono state fornite chiavi di cifratura (WebAuthn), usale
    const userKeys = credentials.encryptionKeys || pair;

    // Verifica ulteriormente lo stato dell'utente
    console.log("Verifica stato utente prima del salvataggio sessione...");
    
    // Funzione di utilità per verificare lo stato utente
    const checkUserState = async (maxAttempts = 5) => {
      for (let i = 0; i < maxAttempts; i++) {
        if (user.is?.pub) {
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return false;
    };

    // Prima verifica
    let hasValidState = await checkUserState();
    
    if (!hasValidState) {
      console.log("Stato utente non valido, tentativo di recupero...");
      
      // Prova a riautenticare
      await gunAuthManager.login(credentials.username, credentials.password);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verifica dopo la riautenticazione
      hasValidState = await checkUserState();
      
      if (!hasValidState) {
        console.log("Tentativo finale con le chiavi della sessione...");
        // Ultimo tentativo usando le chiavi della sessione
        const sessionData = {
          pub: pair.pub,
          pair: {
            pub: pair.pub,
            priv: pair.priv,
            epub: pair.epub,
            epriv: pair.epriv
          }
        };
        
        // Salva temporaneamente nel localStorage
        localStorage.setItem('sessionData', JSON.stringify(sessionData));
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userPub', pair.pub);
        
        // Attendi un momento
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verifica finale
        hasValidState = await checkUserState();
      }
    }

    if (!hasValidState) {
      console.warn("Impossibile recuperare lo stato utente ideale, procedo comunque con il salvataggio della sessione");
    }

    console.log("Stato utente finale:", {
      hasUserIs: !!user.is,
      userPub: user.is?.pub,
      pairPub: pair.pub
    });

    // Prepara i dati della sessione
    const sessionData = {
      pub: pair.pub,
      pair: {
        pub: pair.pub,
        priv: pair.priv,
        epub: pair.epub,
        epriv: pair.epriv
      },
      credentials: {
        username: credentials.username,
        password: credentials.password
      },
      lastSeen: Date.now(),
      authType: credentials.encryptionKeys ? "webauthn" : "credentials"
    };

    // Salva nel localStorage prima del salvataggio della sessione
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('sessionData', JSON.stringify(sessionData));
    localStorage.setItem('userPub', sessionData.pub);

    // Attendi un momento per assicurarti che Gun abbia aggiornato lo stato
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("Tentativo salvataggio sessione...");
    const sessionSaved = await sessionManager.saveSession(sessionData);
    
    if (!sessionSaved) {
      console.warn("Primo tentativo salvataggio sessione fallito, retry...");
      
      // Attendi ancora un po' e riprova
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const retrySessionSave = await sessionManager.saveSession(sessionData);
      if (!retrySessionSave) {
        console.error("Salvataggio sessione fallito dopo retry");
        // Continua comunque, dato che abbiamo salvato i dati nel localStorage
      }
    }

    console.log("Procedura di salvataggio sessione completata");

    // Verifica e ripristina l'autenticazione prima di creare il wallet
    console.log("Verifica autenticazione prima della creazione del wallet...");
    
    // Funzione di utilità per verificare e ripristinare l'autenticazione
    const ensureAuthentication = async (maxAttempts = 3) => {
      for (let i = 0; i < maxAttempts; i++) {
        if (user.is?.pub) {
          console.log("Utente già autenticato");
          return true;
        }

        console.log(`Tentativo di riautenticazione ${i + 1}/${maxAttempts}...`);
        try {
          // Prima prova con le credenziali
          await gunAuthManager.login(credentials.username, credentials.password);
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          if (user.is?.pub) {
            console.log("Riautenticazione riuscita con credenziali");
            return true;
          }

          // Se fallisce, prova con le chiavi della sessione
          const sessionData = JSON.parse(localStorage.getItem('sessionData'));
          if (sessionData?.pair) {
            console.log("Tentativo con chiavi sessione...");
            await new Promise((resolve, reject) => {
              user.auth(sessionData.pair, (ack) => {
                if (ack.err) {
                  console.error("Errore auth con chiavi sessione:", ack.err);
                  reject(ack.err);
                } else {
                  console.log("Auth con chiavi sessione riuscita");
                  resolve();
                }
              });
            });
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (user.is?.pub) {
              console.log("Riautenticazione riuscita con chiavi sessione");
              return true;
            }
          }
        } catch (error) {
          console.error(`Errore tentativo ${i + 1}:`, error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      return false;
    };

    // Verifica e ripristina l'autenticazione
    const isAuthenticated = await ensureAuthentication();
    if (!isAuthenticated) {
      throw new Error("Impossibile ripristinare l'autenticazione per la creazione del wallet");
    }

    // Crea il wallet principale
    console.log("Creazione wallet...");
    const mainWallet = await walletManager.getWallet(userKeys.pub);

    if (!mainWallet) {
      throw new Error("Failed to create wallet");
    }
    console.log("Wallet creato con successo:", mainWallet.address);

    // Salva il wallet nel localStorage per l'utente WebAuthn
    if (credentials.encryptionKeys) {
      localStorage.setItem(
        `gunWallet_${userKeys.pub}`,
        JSON.stringify({
          internalWalletAddress: mainWallet.address,
          internalWalletPk: mainWallet.privateKey
        })
      );
    }

    // Genera le chiavi stealth
    const stealthKeys = await new Promise((resolve, reject) => {
      stealthChain.createAccount((error, keys) => {
        if (error) {
          console.error("Error generating stealth keys:", error);
          reject(error);
          return;
        }
        console.log("Stealth keys generated:", keys);
        resolve(keys);
      });
    });

    if (!stealthKeys?.pub) {
      throw new Error("Error generating stealth keys");
    }

    // Prepara i dati utente
    const userDataToSave = {
      pub: userKeys.pub,
      epub: userKeys.epub,
      username: credentials.username,
      address: mainWallet.address,
      internalWalletAddress: mainWallet.address,
      externalWalletAddress: credentials.username,
      viewingPublicKey: stealthKeys.pub,
      spendingPublicKey: stealthKeys.epub,
      createdAt: Date.now(),
      authType: credentials.encryptionKeys ? "webauthn" : "credentials",
      lastSeen: Date.now(),
    };

    // Salva le chiavi private in modo sicuro usando savePrivateData
    await gunAuthManager.savePrivateData({
      viewingPrivateKey: stealthKeys.priv,
      spendingPrivateKey: stealthKeys.epriv
    }, "stealth-keys");

    // Salva i dati pubblici usando savePublicData in entrambe le posizioni
    await Promise.all([
      gunAuthManager.savePublicData(userDataToSave, `users/${userKeys.pub}`),
      gun.get(DAPP_NAME).get('users').get(userKeys.pub).put(userDataToSave)
    ]);

    // Verifica che i dati siano stati salvati
    const savedData = await new Promise((resolve) => {
      gun.get(`users`).get(userKeys.pub).once((data) => {
        resolve(data);
      });
    });

    if (!savedData) {
      throw new Error("Failed to verify user data was saved");
    }

    // Salva il wallet localmente
    await walletManager.saveWallet(mainWallet, userKeys.pub);

    // Aggiorna metriche e crea certificati
    await Promise.all([
      updateGlobalMetrics("totalUsers", 1),
      createFriendRequestCertificate(),
      createNotificationCertificate(),
    ]);

    // Genera e salva l'avatar predefinito
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${credentials.username}&backgroundColor=b6e3f4`;
    const avatarResponse = await fetch(defaultAvatar);
    const avatarBlob = await avatarResponse.blob();
    const avatarBase64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(avatarBlob);
    });

    await avatarService.saveAvatar(userKeys.pub, avatarBase64);

    const result = {
      success: true,
      pub: userKeys.pub,
      userData: {
        ...userDataToSave,
        avatar: avatarBase64,
      },
    };

    callback(result);
    return result;

  } catch (error) {
    console.error("Registration error:", error);

    // Pulizia in caso di errore
    if (user.is) {
      user.leave();
    }

    const errorResult = {
      success: false,
      errMessage: error.message,
    };

    callback(errorResult);
    throw error;
  }
};

export default registerUser;
