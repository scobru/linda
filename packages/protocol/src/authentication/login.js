import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from '../security/index.js';
import { updateGlobalMetrics } from '../system/systemService.js';
import { sessionManager } from './sessionManager.js';

const LOGIN_TIMEOUT = 15000; // Aumentiamo il timeout a 15 secondi

export const loginWithMetaMask = async (address) => {
  let userDataCache = null;
  let decryptedKeys = null;

  try {
    if (!address || typeof address !== 'string') {
      throw new Error('Indirizzo non valido');
    }

    const normalizedAddress = address.toLowerCase();
    console.log('Tentativo login con indirizzo:', normalizedAddress);

    // 1. Verifica connessione Gun
    const isGunConnected = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000);
      gun.get('healthcheck').once(() => {
        clearTimeout(timeout);
        resolve(true);
      });
    });

    if (!isGunConnected) {
      throw new Error('Impossibile connettersi al server Gun');
    }

    // 2. Cerca l'utente con retry
    const findUser = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        const userData = await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('addresses')
            .get(normalizedAddress)
            .once((data) => {
              console.log('Dati utente trovati:', data);
              resolve(data);
            });
          setTimeout(() => resolve(null), 2000);
        });

        if (userData && userData.pub) return userData;
        await new Promise((r) => setTimeout(r, 1000));
      }
      return null;
    };

    const existingUser = await findUser();
    console.log('Utente esistente:', existingUser);

    if (!existingUser || !existingUser.pub) {
      throw new Error('Utente non trovato');
    }

    userDataCache = existingUser;

    // 3. Ottieni il signer con timeout
    const signer = await Promise.race([
      gun.getSigner(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout ottenimento signer')), 10000)
      ),
    ]);

    if (!signer) {
      throw new Error('Impossibile ottenere il signer di MetaMask');
    }

    // 4. Firma il messaggio con timeout
    const signature = await Promise.race([
      signer.signMessage(gun.MESSAGE_TO_SIGN),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout firma messaggio')), 30000)
      ),
    ]);

    if (!signature) {
      throw new Error('Firma non valida o non fornita');
    }

    // 5. Genera la password e decifra le chiavi
    const password = await gun.generatePassword(signature);
    console.log('Password generata');

    try {
      const [decryptedPair, decryptedVPair, decryptedSPair] = await Promise.all(
        [
          gun.decryptWithPassword(userDataCache.env_pair, password),
          gun.decryptWithPassword(userDataCache.env_v_pair, password),
          gun.decryptWithPassword(userDataCache.env_s_pair, password),
        ]
      );

      if (!decryptedPair || !decryptedVPair || !decryptedSPair) {
        throw new Error('Decifratura chiavi fallita');
      }

      decryptedKeys = {
        pair: decryptedPair,
        v_Pair: decryptedVPair,
        s_Pair: decryptedSPair,
      };
      console.log('Chiavi decifrate con successo');
    } catch (error) {
      console.error('Errore decifratura:', error);
      throw new Error('Errore nella decifratura delle chiavi');
    }

    // 6. Autentica l'utente con retry
    const authenticateUser = async (retries = 3) => {
      // Prima pulisci lo stato precedente
      if (user.is) {
        user.leave();
        await new Promise((r) => setTimeout(r, 1000));
      }

      for (let i = 0; i < retries; i++) {
        try {
          // Prima crea l'utente
          await new Promise((resolve, reject) => {
            user.create(decryptedKeys.pair, (ack) => {
              if (ack.err && !ack.err.includes('already created')) {
                reject(new Error(ack.err));
              } else {
                resolve(true);
              }
            });
          });

          // Poi autentica
          await new Promise((resolve, reject) => {
            user.auth(decryptedKeys.pair, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
          });

          return true;
        } catch (error) {
          console.error(`Tentativo ${i + 1} fallito:`, error);
          if (i === retries - 1) throw error;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    };

    await authenticateUser();
    console.log('Autenticazione completata');

    // 7. Verifica autenticazione
    let attempts = 0;
    while (!user.is && attempts < 50) {
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }

    if (!user.is) {
      throw new Error('Verifica autenticazione fallita');
    }

    console.log('Autenticazione verificata');

    // 8. Aggiorna last seen e metriche
    await Promise.resolve([
      new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('users')
          .get(userDataCache.pub)
          .get('lastSeen')
          .put(Date.now(), (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve(ack);
          });
      }),
      updateGlobalMetrics('totalLogins', 1),
    ]);

    // 9. Salva la sessione
    const displayName = `${address.slice(0, 6)}...${address.slice(-4)}`;
    const sessionData = {
      userPub: userDataCache.pub,
      walletData: {
        address: normalizedAddress,
        displayName,
        pair: decryptedKeys.pair,
        v_Pair: decryptedKeys.v_Pair,
        s_Pair: decryptedKeys.s_Pair,
        viewingPublicKey: userDataCache.viewingPublicKey,
        spendingPublicKey: userDataCache.spendingPublicKey,
      },
    };

    sessionManager.saveSession(sessionData);
    console.log('Sessione salvata');

    return {
      success: true,
      pub: userDataCache.pub,
      userData: {
        ...userDataCache,
        displayName,
        address: normalizedAddress,
        username: normalizedAddress,
      },
    };
  } catch (error) {
    console.error('Errore login:', error);

    // Pulizia in caso di errore
    if (user.is) {
      user.leave();
    }

    // Pulisci la sessione
    sessionManager.clearSession();

    throw error;
  }
};

/**
 * Authenticates a registered user with their credentials.
 *
 * This function handles the login process by:
 * 1. Validating the provided credentials
 * 2. Authenticating against the Gun user system
 * 3. Creating necessary security certificates
 * 4. Verifying the user session is properly established
 *
 * @param {Object} credentials - The user's login credentials
 * @param {string} credentials.username - The user's username
 * @param {string} credentials.password - The user's password
 * @param {Function} callback - Optional callback function that receives the authentication result
 * @returns {Promise<Object>} Promise that resolves with:
 *   - success: {boolean} Whether authentication succeeded
 *   - pub: {string} The user's public key
 *   - message: {string} Status message
 *   - user: {Object} The authenticated user object
 * @throws {Error} If credentials are invalid or authentication fails
 */
export const loginUser = async (credentials) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Verifica input
      if (!credentials?.username || !credentials?.password) {
        resolve({
          success: false,
          errMessage: 'Username e password sono richiesti',
          errCode: 'login-error',
        });
        return;
      }

      // Assicurati che non ci siano sessioni attive
      if (user.is) {
        user.leave();
        // Attendi che l'utente sia effettivamente disconnesso
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Verifica se l'utente esiste
      const checkUserExists = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            const exists = await new Promise((resolve) => {
              gun.get(`~@${credentials.username}`).once((data) => {
                console.log(
                  'Verifica utente (tentativo ' + (i + 1) + '):',
                  data
                );
                resolve(!!data);
              });
              setTimeout(() => resolve(false), 2000);
            });

            if (exists) return true;

            // Se non esiste, prova anche nel nodo users
            const userInNode = await new Promise((resolve) => {
              gun
                .get(DAPP_NAME)
                .get('users')
                .map()
                .once((data) => {
                  if (data && data.username === credentials.username) {
                    resolve(true);
                  }
                });
              setTimeout(() => resolve(false), 2000);
            });

            if (userInNode) return true;

            if (i < retries - 1) {
              console.log('Utente non trovato, riprovo...');
              await new Promise((r) => setTimeout(r, 1000));
            }
          } catch (error) {
            console.error('Errore verifica utente:', error);
            if (i === retries - 1) return false;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        return false;
      };

      const userExists = await checkUserExists();
      console.log('Risultato verifica utente:', userExists);

      if (!userExists) {
        resolve({
          success: false,
          errMessage: 'Utente non trovato',
          errCode: 'login-error',
        });
        return;
      }

      // Timeout per l'autenticazione
      const timeoutId = setTimeout(() => {
        if (user.is) user.leave();
        resolve({
          success: false,
          errMessage: 'Timeout durante il login',
          errCode: 'login-error',
        });
      }, LOGIN_TIMEOUT);

      // Tenta l'autenticazione
      user.auth(credentials.username, credentials.password, async (ack) => {
        clearTimeout(timeoutId);

        if (ack.err) {
          resolve({
            success: false,
            errMessage: ack.err,
            errCode: 'login-error',
          });
          return;
        }

        // Verifica che l'autenticazione sia avvenuta correttamente
        let attempts = 0;
        while (attempts < 30 && !user.is?.pub) {
          await new Promise((r) => setTimeout(r, 100));
          attempts++;
        }

        if (!user.is?.pub) {
          resolve({
            success: false,
            errMessage: 'Verifica autenticazione fallita',
            errCode: 'login-error',
          });
          return;
        }

        // Recupera i dati dell'utente con retry
        const getUserData = async (retries = 3) => {
          for (let i = 0; i < retries; i++) {
            try {
              const data = await new Promise((resolve) => {
                gun
                  .get(DAPP_NAME)
                  .get('users')
                  .get(user.is.pub)
                  .once((data) => {
                    console.log('Dati utente recuperati:', data);
                    resolve(data);
                  });
                setTimeout(() => resolve(null), 3000);
              });

              if (data) return data;

              // Se non troviamo i dati in users, proviamo in addresses
              const addressData = await new Promise((resolve) => {
                gun
                  .get(DAPP_NAME)
                  .get('addresses')
                  .get(user.is.pub)
                  .once((data) => resolve(data));
                setTimeout(() => resolve(null), 3000);
              });

              if (addressData) return addressData;

              if (i < retries - 1) {
                console.log('Dati utente non trovati, riprovo...');
                await new Promise((r) => setTimeout(r, 1000));
              }
            } catch (error) {
              console.error('Errore recupero dati:', error);
              if (i === retries - 1) throw error;
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
          return null;
        };

        const userData = await getUserData();

        // Se non troviamo i dati, creiamo un oggetto base
        const userDataToUse = userData || {
          pub: user.is.pub,
          username: credentials.username,
          timestamp: Date.now(),
          lastSeen: Date.now(),
          authType: 'credentials',
          pair: user._.sea,
        };

        // Prepara i dati della sessione
        const sessionData = {
          userPub: user.is.pub,
          walletData: {
            address: user.is.pub,
            displayName: credentials.username,
            pair: user._.sea,
            v_Pair: userDataToUse.v_Pair || null,
            s_Pair: userDataToUse.s_Pair || null,
            viewingPublicKey: userDataToUse.viewingPublicKey || null,
            spendingPublicKey: userDataToUse.spendingPublicKey || null,
            credentials: {
              username: credentials.username,
              password: credentials.password,
            },
          },
        };

        // Salva la sessione e i dati correlati
        const sessionSaved = await sessionManager.saveSession(sessionData);
        if (!sessionSaved) {
          resolve({
            success: false,
            errMessage: 'Errore nel salvataggio della sessione',
            errCode: 'login-error',
          });
          return;
        }

        // Salva dati aggiuntivi nel localStorage
        localStorage.setItem('userPub', user.is.pub);
        localStorage.setItem('username', credentials.username);
        localStorage.setItem('userAlias', credentials.username);
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('lastLogin', Date.now().toString());
        localStorage.setItem('sessionData', JSON.stringify(sessionData));

        // Aggiorna o crea i dati utente in Gun
        await new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('users')
            .get(user.is.pub)
            .put(
              {
                ...userDataToUse,
                lastSeen: Date.now(),
                username: credentials.username,
                nickname: credentials.username,
              },
              (ack) => {
                if (ack.err) reject(new Error(ack.err));
                else resolve(ack);
              }
            );
        });

        // Aggiorna metriche e crea certificati
        await Promise.all([
          updateGlobalMetrics('totalLogins', 1),
          createFriendRequestCertificate(),
          createNotificationCertificate(),
        ]);

        resolve({
          success: true,
          pub: user.is.pub,
          userData: {
            ...userDataToUse,
            username: credentials.username,
            nickname: credentials.username,
          },
        });
      });
    } catch (error) {
      console.error('Errore login:', error);
      if (user.is) user.leave();
      resolve({
        success: false,
        errMessage: error.message,
        errCode: 'login-error',
      });
    }
  });
};

export default loginUser;
