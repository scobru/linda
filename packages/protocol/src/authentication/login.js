import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from '../security/index.js';
import { updateGlobalMetrics } from '../system/systemService.js';

const LOGIN_TIMEOUT = 10000; // 10 seconds

export const loginWithMetaMask = async (address) => {
  try {
    // Ottieni il signer e crea la firma
    const signer = await gun.getSigner();
    const signature = await signer.signMessage(MESSAGE_TO_SIGN);
    const password = await gun.generatePassword(signature);

    // Verifica se l'utente esiste già
    const existingUser = await gun
      .get(DAPP_NAME)
      .get('users')
      .get(address.toLowerCase())
      .once();

    if (!existingUser) {
      throw new Error('Utente non registrato. Per favore registrati prima.');
    }

    // Recupera le chiavi cifrate e decifrale
    const decryptedPairs = {
      pair: await gun.decryptWithPassword(
        existingUser.encryptedPairs.pair,
        password
      ),
      viewingKeyPair: await gun.decryptWithPassword(
        existingUser.encryptedPairs.viewingKeyPair,
        password
      ),
      spendingKeyPair: await gun.decryptWithPassword(
        existingUser.encryptedPairs.spendingKeyPair,
        password
      ),
    };

    // Converti la chiave privata nel formato corretto per Ethereum
    const hexPrivateKey = await gun.convertToEthAddress(
      decryptedPairs.pair.epriv
    );

    return new Promise((resolve, reject) => {
      gun.user().auth(decryptedPairs.pair, async (ack) => {
        if (ack.err) {
          reject(new Error(ack.err));
          return;
        }

        try {
          // Salva nel localStorage per accesso rapido
          const walletData = {
            internalWalletAddress: existingUser.address,
            internalWalletPk: hexPrivateKey,
            viewingPublicKey: existingUser.viewingPublicKey,
            spendingPublicKey: existingUser.spendingPublicKey,
            pair: decryptedPairs.pair,
            v_Pair: decryptedPairs.v_Pair,
            s_Pair: decryptedPairs.s_Pair,
            credentials,
          };

          localStorage.setItem(
            `gunWallet_${existingUser.pub}`,
            JSON.stringify(walletData)
          );

          // Verifica/crea certificati
          await Promise.all([
            createFriendRequestCertificate(),
            createNotificationCertificate(),
          ]);

          // Aggiorna metriche
          updateGlobalMetrics('totalLogins', 1);

          resolve({
            success: true,
            pub: existingUser.pub,
            message: 'Autenticazione completata con successo.',
            user: {
              pub: existingUser.pub,
              address: existingUser.address,
            },
          });
        } catch (error) {
          console.error('Error in auth callback:', error);
          reject(error);
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
  console.log('loginUser', credentials);

  const loginPromise = new Promise(async (resolve, reject) => {
    try {
      if (!credentials.username || !credentials.password) {
        reject(new Error('Username and password are required'));
        return;
      }

      gun
        .user()
        .auth(credentials.username, credentials.password, async (ack) => {
          if (ack.err) {
            reject(new Error(ack.err));
            return;
          }

          const pub = user.is.pub;
          console.log('User authenticated:', { pub });

          // Cerca i dati utente in tutti i percorsi possibili
          let userData = null;

          // 1. Prima cerca per username
          const usernameData = await gun
            .get(`~@${credentials.username}`)
            .once();
          console.log('Username data:', usernameData);

          if (usernameData) {
            // 2. Se troviamo il riferimento username, cerca per pub
            userData = await gun
              .get(DAPP_NAME)
              .get('users')
              .get(usernameData.pub)
              .once();
            console.log('User data from pub:', userData);
          }

          if (!userData) {
            // 3. Se non troviamo per pub, cerca nel profilo
            userData = await gun
              .user()
              .get(DAPP_NAME)
              .get('profiles')
              .get(pub)
              .once();
            console.log('User data from profile:', userData);
          }

          if (!userData) {
            // 4. Se non troviamo nel profilo, cerca negli indirizzi
            userData = await gun
              .get(DAPP_NAME)
              .get('addresses')
              .get(pub)
              .once();
            console.log('User data from addresses:', userData);
          }

          if (!userData) {
            reject(new Error('Dati utente non trovati'));
            return;
          }

          // Modifica la verifica dei dati di cifratura
          if (
            !userData ||
            !userData.pair ||
            !userData.viewingKeyPair ||
            !userData.spendingKeyPair
          ) {
            console.error('Dati utente o chiavi mancanti:', { userData });
            reject(new Error('Dati utente non validi'));
            return;
          }

          try {
            // Decifra le chiavi
            const [decryptedPair, decryptedVPair, decryptedSPair] =
              await Promise.all([
                gun.decryptWithPassword(userData.pair, credentials.password),
                gun.decryptWithPassword(
                  userData.viewingKeyPair,
                  credentials.password
                ),
                gun.decryptWithPassword(
                  userData.spendingKeyPair,
                  credentials.password
                ),
              ]);

            console.log('Chiavi decifrate con successo:', {
              hasPair: !!decryptedPair,
              hasVPair: !!decryptedVPair,
              hasSPair: !!decryptedSPair,
            });

            // Converti la chiave privata nel formato corretto per Ethereum
            const hexPrivateKey = await gun.convertToEthAddress(
              decryptedPair.epriv
            );

            // Salva nel localStorage
            const walletData = {
              internalWalletAddress: userData.address,
              internalWalletPk: hexPrivateKey,
              viewingPublicKey: userData.viewingPublicKey,
              spendingPublicKey: userData.spendingPublicKey,
              pair: decryptedPair,
              v_Pair: decryptedVPair,
              s_Pair: decryptedSPair,
              credentials,
            };

            localStorage.setItem(
              `gunWallet_${pub}`,
              JSON.stringify(walletData)
            );

            // Verifica/crea certificati
            await Promise.all([
              createFriendRequestCertificate(),
              createNotificationCertificate(),
            ]);

            // Verifica user.is con timeout
            let attempts = 0;
            const maxAttempts = 10;
            const checkUser = setInterval(() => {
              attempts++;
              if (user.is) {
                clearInterval(checkUser);
                resolve({
                  success: true,
                  pub: user.is.pub,
                  message: 'Successfully authenticated user.',
                  user: {
                    pub: user.is.pub,
                    address: userData.address,
                  },
                });
              } else if (attempts >= maxAttempts) {
                clearInterval(checkUser);
                reject(new Error('Failed to get user data'));
              }
            }, 100);

            // Aggiorna metriche
            updateGlobalMetrics('totalLogins', 1);
          } catch (error) {
            console.error('Error in auth callback:', error);
            reject(error);
          }
        });
    } catch (error) {
      reject(error);
    }
  });

  // Gestione timeout e callback rimangono invariati
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Timeout during login'));
    }, LOGIN_TIMEOUT);
  });

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
      callback({
        success: false,
        errMessage: error.message,
        errCode: 'login-error',
      });
    });

  updateGlobalMetrics('totalLogins', 1);
  return loginPromise;
};

export default loginUser;
