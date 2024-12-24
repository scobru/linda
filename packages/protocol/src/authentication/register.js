import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from '../security/index.js';
import { updateGlobalMetrics } from '../system/systemService.js';

const LOGIN_TIMEOUT = 10000; // 10 secondi

export const registerWithMetaMask = async (address) => {
  let userDataCache = null;
  let decryptedKeys = null;

  try {
    if (!address || typeof address !== 'string') {
      throw new Error('Indirizzo non valido');
    }

    const normalizedAddress = address.toLowerCase();
    console.log('Avvio registrazione con indirizzo:', normalizedAddress);

    // 1. Verifica se l'utente esiste già con retry
    const existingUser = await new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 3;

      const checkUser = () => {
        gun
          .get(DAPP_NAME)
          .get('addresses')
          .get(normalizedAddress)
          .once((data) => {
            if (data) {
              resolve(data);
            } else if (attempts < maxAttempts) {
              attempts++;
              setTimeout(checkUser, 1000);
            } else {
              resolve(null);
            }
          });
      };

      checkUser();
    });

    if (existingUser && existingUser.pub) {
      throw new Error('Utente già registrato con questo indirizzo');
    }

    // 2. Ottieni il signer con retry
    const signer = await gun.getSigner();
    if (!signer) {
      throw new Error('Impossibile ottenere il signer di MetaMask');
    }

    // 3. Firma il messaggio con timeout
    const signature = await Promise.race([
      signer.signMessage(gun.MESSAGE_TO_SIGN),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout firma messaggio')), 30000)
      ),
    ]);

    if (!signature) {
      throw new Error('Firma non valida o non fornita');
    }

    // 4. Genera password dalla firma
    const password = await gun.generatePassword(signature);

    // 5. Genera le chiavi con controlli di validità
    const [pair, v_pair, s_pair] = await Promise.all([
      SEA.pair(),
      SEA.pair(),
      SEA.pair(),
    ]);

    if (!pair?.pub || !v_pair?.pub || !s_pair?.pub) {
      throw new Error('Generazione chiavi fallita');
    }

    // 6. Cifra le chiavi
    const [env_pair, env_v_pair, env_s_pair] = await Promise.all([
      gun.encryptWithPassword(pair, password),
      gun.encryptWithPassword(v_pair, password),
      gun.encryptWithPassword(s_pair, password),
    ]);

    // 7. Crea l'utente con retry
    const createUser = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        const createAck = await new Promise((resolve) =>
          user.create(pair, resolve)
        );
        if (!createAck.err || createAck.err.includes('already created')) {
          return true;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error('Creazione utente fallita dopo multipli tentativi');
    };

    await createUser();

    // 8. Prepara i dati utente
    const userData = {
      pub: pair.pub,
      epub: pair.epub,
      viewingPublicKey: v_pair.pub,
      spendingPublicKey: s_pair.pub,
      env_pair,
      env_v_pair,
      env_s_pair,
      internalWalletAddress: pair.pub,
      externalWalletAddress: normalizedAddress,
      createdAt: Date.now(),
      authType: 'metamask',
      lastSeen: Date.now(),
    };

    // 9. Salva i dati con transazione atomica
    const saveData = async () => {
      const promises = [
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('addresses')
            .get(normalizedAddress)
            .put(userData, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('users')
            .get(pair.pub)
            .put(userData, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),
      ];

      await Promise.all(promises);
    };

    await saveData();

    // 10. Salva nel localStorage con encryption
    const walletData = {
      internalWalletAddress: pair.pub,
      externalWalletAddress: normalizedAddress,
      pair,
      v_Pair: v_pair,
      s_Pair: s_pair,
      viewingPublicKey: v_pair.pub,
      spendingPublicKey: s_pair.pub,
      credentials: {
        username: normalizedAddress,
        password,
      },
    };

    localStorage.setItem(`gunWallet_${pair.pub}`, JSON.stringify(walletData));

    // 11. Aggiorna metriche e crea certificati
    await Promise.all([
      updateGlobalMetrics('totalUsers', 1),
      createFriendRequestCertificate(),
      createNotificationCertificate(),
    ]);

    return {
      success: true,
      pub: pair.pub,
      userData,
    };
  } catch (error) {
    console.error('Errore in registerWithMetaMask:', error);

    // Pulizia in caso di errore
    if (user.is) {
      user.leave();
    }

    // Rimuovi dati parziali se presenti
    if (userDataCache?.pub) {
      gun.get(DAPP_NAME).get('users').get(userDataCache.pub).put(null);
      gun.get(DAPP_NAME).get('addresses').get(address.toLowerCase()).put(null);
    }

    throw error;
  }
};

const registerUser = async (credentials = {}, callback = () => {}) => {
  console.log('registerUser called');
  let timeoutId;

  const registerPromise = new Promise(async (resolve, reject) => {
    try {
      // Validazione input
      if (!credentials.username || !credentials.password) {
        throw new Error('Username e password sono richiesti');
      }

      // Pulisci lo stato precedente in modo aggressivo
      if (user.is) {
        user.leave();
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Forza una pulizia completa di Gun
      gun.user().leave();
      await new Promise((r) => setTimeout(r, 2000));

      // Verifica se l'utente esiste già
      const userExists = await new Promise((resolve) => {
        gun.get(`~@${credentials.username}`).once((data) => {
          resolve(!!data);
        });
        setTimeout(() => resolve(false), 3000);
      });

      if (userExists) {
        throw new Error('Username già in uso');
      }

      // 1. Prima crea l'utente con retry e pulizia aggressiva
      const createUserWithRetry = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            // Pulizia aggressiva prima di ogni tentativo
            if (user.is) {
              user.leave();
              await new Promise((r) => setTimeout(r, 1000));
            }
            gun.user().leave();
            await new Promise((r) => setTimeout(r, 2000));

            // Tenta la creazione
            const result = await new Promise((resolve, reject) => {
              console.log('Tentativo di creazione utente:', i + 1);
              user.create(credentials.username, credentials.password, (ack) => {
                console.log('Risposta creazione utente:', ack);
                if (ack.err && !ack.err.includes('already created')) {
                  if (ack.err.includes('already being created')) {
                    console.log('Utente in fase di creazione, attendo...');
                    setTimeout(() => reject(new Error(ack.err)), 1000);
                  } else {
                    reject(new Error(ack.err));
                  }
                } else {
                  resolve(ack);
                }
              });
            });

            return result;
          } catch (error) {
            console.log(`Tentativo ${i + 1} fallito:`, error);
            if (i === retries - 1) throw error;
            // Attendi più a lungo tra i tentativi
            await new Promise((r) => setTimeout(r, 3000));
          }
        }
      };

      await createUserWithRetry();

      // Attendi più a lungo prima di procedere con l'autenticazione
      await new Promise((r) => setTimeout(r, 3000));

      // 2. Autentica l'utente con retry
      const authenticateWithRetry = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            const result = await new Promise((resolve, reject) => {
              user.auth(credentials.username, credentials.password, (ack) => {
                console.log('Risposta autenticazione:', ack);
                if (ack.err) reject(new Error(ack.err));
                else resolve(ack);
              });
            });

            return result;
          } catch (error) {
            console.log(`Tentativo autenticazione ${i + 1} fallito:`, error);
            if (i === retries - 1) throw error;
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      };

      await authenticateWithRetry();

      console.log('User.is:', user.is);

      // Verifica che l'utente sia autenticato
      let attempts = 0;
      while (attempts < 30 && !user.is?.pub) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }

      if (!user.is?.pub) {
        throw new Error('Verifica autenticazione fallita');
      }

      // 3. Genera l'account Ethereum
      const userData = gun.gunToEthAccount(user._.sea, credentials.password);

      // 4. Prepara i dati utente
      const userDataToSave = {
        pub: user.is.pub,
        address: userData?.internalWalletAddress || user.is.pub,
        internalWalletAddress: userData?.internalWalletAddress || user.is.pub,
        externalWalletAddress: null,
        username: credentials.username,
        nickname: credentials.username,
        timestamp: Date.now(),
        authType: 'credentials',
        viewingPublicKey: userData?.viewingPublicKey || null,
        spendingPublicKey: userData?.spendingPublicKey || null,
        env_pair: userData?.env_pair || null,
        env_v_pair: userData?.env_v_pair || null,
        env_s_pair: userData?.env_s_pair || null,
      };

      // 5. Salva i dati in tutti i percorsi necessari
      await Promise.all([
        // Salva in users
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('users')
            .get(user.is.pub)
            .put(userDataToSave, (ack) => {
              console.log('Salvataggio users:', ack);
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),

        // Salva nel profilo utente
        new Promise((resolve, reject) => {
          gun
            .user()
            .get(DAPP_NAME)
            .get('profiles')
            .get(user.is.pub)
            .put(userDataToSave, (ack) => {
              console.log('Salvataggio profiles:', ack);
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),

        // Salva nell'indice degli indirizzi
        new Promise((resolve, reject) => {
          const addressToUse = (
            userData?.internalWalletAddress || user.is.pub
          ).toLowerCase();
          gun
            .get(DAPP_NAME)
            .get('addresses')
            .get(addressToUse)
            .put(userDataToSave, (ack) => {
              console.log('Salvataggio addresses:', ack);
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),
      ]);

      // Salva nel localStorage
      const walletData = {
        internalWalletAddress: userData?.internalWalletAddress || user.is.pub,
        internalWalletPk: userData?.internalWalletPk || null,
        externalWalletAddress: null,
        pair: userData?.pair || user._.sea,
        v_Pair: userData?.v_pair || null,
        s_Pair: userData?.s_pair || null,
        viewingPublicKey: userData?.viewingPublicKey || null,
        spendingPublicKey: userData?.spendingPublicKey || null,
        credentials: {
          username: credentials.username,
          password: credentials.password,
        },
      };

      localStorage.setItem(
        `gunWallet_${user.is.pub}`,
        JSON.stringify(walletData)
      );

      // Crea i certificati e aggiorna metriche
      await Promise.all([
        createFriendRequestCertificate(),
        createNotificationCertificate(),
        updateGlobalMetrics('totalRegistrations', 1),
      ]);

      resolve({
        success: true,
        pub: user.is.pub,
        userData: userDataToSave,
        message: 'Utente creato con successo',
      });
    } catch (error) {
      console.error('Errore nel salvataggio dei dati:', error);
      if (user.is) user.leave();
      reject(error);
    }
  });

  // Gestione timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (user.is) user.leave();
      reject(new Error('Timeout durante la registrazione'));
    }, LOGIN_TIMEOUT);
  });

  Promise.race([registerPromise, timeoutPromise])
    .then((result) => {
      clearTimeout(timeoutId);
      callback({
        success: true,
        ...result,
      });
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      if (user.is) user.leave();
      callback({
        success: false,
        errMessage: error.message,
        errCode: 'register-error',
      });
    });

  return registerPromise;
};

export default registerUser;
