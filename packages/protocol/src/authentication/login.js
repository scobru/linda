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

  const loginPromise = new Promise(async (resolve, reject) => {
    try {
      // Validazione input
      if (!credentials.username || !credentials.password) {
        throw new Error('Username e password sono richiesti');
      }

      // Reset completo dello stato di autenticazione
      if (user.is) {
        console.log('Resetting user state...');
        user.leave();
        // Attendi che lo stato sia completamente resettato
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Verifica se l'utente esiste in modo più affidabile
      console.log('Verifica esistenza utente...');
      const userExists = await new Promise((resolve) => {
        let checked = false;
        const alias = `~@${credentials.username}`;

        // Prima verifica l'alias
        gun.get(alias).once((data) => {
          if (!checked) {
            checked = true;
            console.log('Alias check:', data);
            if (data) {
              resolve(true);
              return;
            }
          }
        });

        // Poi verifica nella lista utenti
        gun
          .get(DAPP_NAME)
          .get('users')
          .map()
          .once((data, key) => {
            if (!checked && data && data.username === credentials.username) {
              checked = true;
              console.log('User found in userList:', data);
              resolve(true);
            }
          });

        // Timeout più lungo per la verifica
        setTimeout(() => {
          if (!checked) {
            checked = true;
            console.log('User not found after timeout');
            resolve(false);
          }
        }, 5000);
      });

      console.log('userExists:', userExists);

      if (!userExists) {
        throw new Error('Utente non trovato');
      }

      // Tenta l'autenticazione con retry
      console.log('Tentativo di autenticazione...');
      let authAttempts = 0;
      const maxAuthAttempts = 3;
      let authError = null;

      while (authAttempts < maxAuthAttempts) {
        try {
          const authResult = await new Promise((resolve, reject) => {
            user.auth(
              credentials.username,
              credentials.password,
              async (ack) => {
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
                  const userData = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                      reject(new Error('Timeout recupero dati utente'));
                    }, 5000);

                    gun
                      .get(DAPP_NAME)
                      .get('users')
                      .get(user.is.pub)
                      .once((data) => {
                        clearTimeout(timeout);
                        if (!data) {
                          reject(new Error('Dati utente non trovati'));
                          return;
                        }
                        resolve(data);
                      });
                  });

                  // Decifra le chiavi
                  const [decryptedPair, decryptedVPair, decryptedSPair] =
                    await Promise.all([
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
                  await updateGlobalMetrics('totalLogins', 1);

                  // Crea i certificati
                  await Promise.all([
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
              }
            );
          });

          // Se arriviamo qui, l'autenticazione è riuscita
          resolve(authResult);
          return;
        } catch (error) {
          authError = error;
          authAttempts++;
          if (authAttempts < maxAuthAttempts) {
            console.log(`Auth attempt ${authAttempts} failed, retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            // Reset dello stato tra i tentativi
            if (user.is) {
              user.leave();
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        }
      }

      // Se arriviamo qui, tutti i tentativi sono falliti
      throw (
        authError || new Error('Autenticazione fallita dopo multipli tentativi')
      );
    } catch (error) {
      if (user.is) {
        user.leave();
      }
      reject(error);
    }
  });

  // Gestione del timeout globale
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
