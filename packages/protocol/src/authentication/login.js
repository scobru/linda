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
const loginUser = (credentials = {}, callback = () => {}) => {
  let timeoutId;

  const loginPromise = new Promise((resolve, reject) => {
    try {
      // Validazione input
      if (!credentials.username || !credentials.password) {
        throw new Error('Username e password sono richiesti');
      }

      // Reset completo dello stato di autenticazione
      if (user.is) {
        user.leave();
      }

      // Pulizia aggressiva dello stato
      new Promise((resolve) => setTimeout(resolve, 2000));

      // Verifica se l'utente esiste
      const userExists = new Promise((resolve) => {
        gun.get(`~@${credentials.username}`).once((data) => {
          resolve(!!data);
        });
        setTimeout(() => resolve(false), 3000);
      });

      if (!userExists) {
        throw new Error('Utente non trovato');
      }

      // Tenta l'autenticazione una sola volta
      const authResult = new Promise((resolve, reject) => {
        user.auth(credentials.username, credentials.password, async (ack) => {
          if (ack.err) {
            reject(new Error(ack.err));
            return;
          }

          try {
            // Verifica che l'utente sia autenticato
            let attempts = 0;
            const maxAttempts = 20;

            while (attempts < maxAttempts && !user.is) {
              await new Promise((resolve) => setTimeout(resolve, 100));
              attempts++;
            }

            if (!user.is) {
              throw new Error('Verifica autenticazione fallita');
            }

            // Recupera i dati dell'utente
            const userData = new Promise((resolve) => {
              gun
                .get(DAPP_NAME)
                .get('users')
                .get(user.is.pub)
                .once((data) => {
                  resolve(data);
                });
              setTimeout(() => resolve(null), 3000);
            });

            if (!userData) {
              throw new Error('Impossibile recuperare i dati utente');
            }

            // Decifra le chiavi
            const [decryptedPair, decryptedVPair, decryptedSPair] =
              Promise.resolve([
                gun.decryptWithPassword(
                  userData.env_pair,
                  credentials.password
                ),
                gun.decryptWithPassword(
                  userData.env_v_pair,
                  credentials.password
                ),
                gun.decryptWithPassword(
                  userData.env_s_pair,
                  credentials.password
                ),
              ]);

            // Salva nel localStorage
            const walletData = {
              internalWalletAddress: userData.internalWalletAddress,
              externalWalletAddress: userData.externalWalletAddress,
              pair: decryptedPair,
              v_Pair: decryptedVPair,
              s_Pair: decryptedSPair,
              viewingPublicKey: userData.viewingPublicKey,
              spendingPublicKey: userData.spendingPublicKey,
              credentials: {
                username: credentials.username,
                password: credentials.password,
              },
            };

            localStorage.setItem(
              `gunWallet_${user.is.pub}`,
              JSON.stringify(walletData)
            );

            // Aggiorna metriche
            updateGlobalMetrics('totalLogins', 1);

            // Crea i certificati
            Promise.all([
              createFriendRequestCertificate(),
              createNotificationCertificate(),
            ]);

            resolve({
              success: true,
              pub: user.is.pub,
              userData: userData,
            });
          } catch (error) {
            reject(error);
          }
        });
      });

      resolve(authResult);
    } catch (error) {
      if (user.is) {
        user.leave();
      }
      reject(error);
    }
  });

  // Gestione del timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (user.is) {
        user.leave();
      }
      reject(new Error('Timeout durante il login'));
    }, LOGIN_TIMEOUT);
  });

  // Race tra login e timeout
  Promise.race([loginPromise, timeoutPromise])
    .then((result) => {
      clearTimeout(timeoutId);
      callback({
        success: true,
        ...result,
      });
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      if (user.is) {
        user.leave();
      }
      callback({
        success: false,
        errMessage: error.message,
        errCode: 'login-error',
      });
    });

  return loginPromise;
};

export default loginUser;
