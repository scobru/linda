import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from '../security/index.js';
import { updateGlobalMetrics } from '../system/systemService.js';

const LOGIN_TIMEOUT = 50000; // Aumentiamo il timeout a 15 secondi

export const loginWithMetaMask = async (address) => {
  try {
    if (!address) {
      throw new Error('Indirizzo non valido');
    }

    const normalizedAddress = address.toLowerCase();

    // Cerca l'utente nell'indice degli indirizzi
    const existingUser = await gun
      .get(DAPP_NAME)
      .get('addresses')
      .get(normalizedAddress)
      .once();

    if (!existingUser) {
      throw new Error('Utente non trovato');
    }

    console.log('Found user:', existingUser);

    // Ottieni il signer e firma il messaggio
    const signer = await gun.getSigner();
    if (!signer) {
      throw new Error('Signer non valido');
    }

    const signature = await signer.signMessage(gun.MESSAGE_TO_SIGN);
    if (!signature) {
      throw new Error('Firma non valida');
    }

    // Genera la password dalla firma
    const password = await gun.generatePassword(signature);

    // Recupera i dati dell'utente usando il pub
    let userData = await gun
      .get(DAPP_NAME)
      .get('users')
      .get(existingUser.pub)
      .once();

    if (!userData) {
      // 4. Se non troviamo nel profilo, cerca negli indirizzi
      userData = await gun
        .get(DAPP_NAME)
        .get('addresses')
        .get(signer.address.toLowerCase())
        .once();
      console.log('User data from addresses:', userData);
    }

    if (!userData) {
      throw new Error('Dati utente non trovati');
    }

    // Decifra le chiavi usando la password
    const [decryptedPair, decryptedVPair, decryptedSPair] = await Promise.all([
      gun.decryptWithPassword(userData.env_pair, password),
      gun.decryptWithPassword(userData.env_v_pair, password),
      gun.decryptWithPassword(userData.env_s_pair, password),
    ]);

    if (!decryptedPair || !decryptedVPair || !decryptedSPair) {
      throw new Error('Impossibile decifrare le chiavi');
    }

    // Autentica l'utente con le chiavi decifrate
    return new Promise((resolve, reject) => {
      user.auth(decryptedPair, async (ack) => {
        if (ack.err) {
          reject(new Error(ack.err));
          return;
        }

        try {
          // Salva nel localStorage
          const walletData = {
            internalWalletAddress: userData.internalWalletAddress,
            externalWalletAddress: address,
            pair: decryptedPair,
            v_Pair: decryptedVPair,
            s_Pair: decryptedSPair,
            viewingPublicKey: userData.viewingPublicKey,
            spendingPublicKey: userData.spendingPublicKey,
            credentials: {
              username: address,
              password: password,
            },
          };

          localStorage.setItem(
            `gunWallet_${userData.pub}`,
            JSON.stringify(walletData)
          );

          // Aggiorna metriche
          updateGlobalMetrics('totalLogins', 1);

          // Crea i certificati in modo asincrono
          await Promise.all([
            createFriendRequestCertificate(),
            createNotificationCertificate(),
          ]);

          resolve({
            success: true,
            pub: userData.pub,
            userData: userData,
          });
        } catch (error) {
          reject(new Error(`Errore durante il login: ${error.message}`));
        }
      });
    });
  } catch (error) {
    console.error('Login error:', error);
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

      // Se l'utente è già autenticato, procedi
      if (user.is) {
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

        console.log('userData', userData);

        // Decifra le chiavi
        const [decryptedPair, decryptedVPair, decryptedSPair] = Promise.all([
          gun.decryptWithPassword(userData.env_pair, credentials.password),
          gun.decryptWithPassword(userData.env_v_pair, credentials.password),
          gun.decryptWithPassword(userData.env_s_pair, credentials.password),
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

        console.log('walletData', walletData);

        localStorage.setItem(
          `gunWallet_${user.is.pub}`,
          JSON.stringify(walletData)
        );

        console.log('Local Storage Updated');

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
        return;
      }

      // Reset completo dello stato di autenticazione
      if (user.is) {
        console.log('Resetting user state...');
        user.leave();
        // Attendi che lo stato sia resettato
        new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Verifica se l'utente esiste
      console.log('Verifica esistenza utente...');
      const userExists = new Promise((resolve) => {
        gun.get(`~@${credentials.username}`).once((data) => {
          console.log('User data:', data);
          resolve(!!data);
        });
      });

      console.log('userExists', userExists);

      if (!userExists) {
        throw new Error('Utente non trovato');
      }

      // Tenta l'autenticazione
      console.log('Tentativo di autenticazione...');
      const authResult = new Promise((resolve, reject) => {
        user.auth(credentials.username, credentials.password, async (ack) => {
          if (ack.err) {
            reject(new Error(ack.err));
            return;
          }

          console.log('ack', ack);

          try {
            // Verifica che l'utente sia autenticato
            let attempts = 0;
            const maxAttempts = 20;

            while (attempts < maxAttempts && !user.is) {
              new Promise((resolve) => setTimeout(resolve, 100));
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
                .once((data) => resolve(data));
            });

            console.log('userData', userData);

            if (!userData) {
              throw new Error('Impossibile recuperare i dati utente');
            }

            // Decifra le chiavi
            const [decryptedPair, decryptedVPair, decryptedSPair] = Promise.all(
              [
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
              ]
            );

            console.log('decryptedPair', decryptedPair);
            console.log('decryptedVPair', decryptedVPair);
            console.log('decryptedSPair', decryptedSPair);

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

            console.log('walletData', walletData);

            localStorage.setItem(
              `gunWallet_${user.is.pub}`,
              JSON.stringify(walletData)
            );

            // Aggiorna metriche
            updateGlobalMetrics('totalLogins', 1);

            console.log('Creating certificates...');

            const [friendRequestCertificate, notificationCertificate] =
              await Promise.all([
                createFriendRequestCertificate(),
                createNotificationCertificate(),
              ]);

            console.log('friendRequestCertificate', friendRequestCertificate);
            console.log('notificationCertificate', notificationCertificate);
            console.log('Certificati Created');

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
