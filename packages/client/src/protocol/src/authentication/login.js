import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from '../security/index.js';

const LOGIN_TIMEOUT = 10000; // 10 seconds

export const loginWithMetaMask = async (address) => {
  try {
    const signer = await gun.getSigner;
    console.log('Signer:', signer);

    const signature = await gun.createSignature(gun.MESSAGE_TO_SIGN);
    console.log('Signature:', signature);

    const pair = await gun.getAndDecryptPair(signer.address, signature);
    console.log('Pair:', pair);

    if (!pair) {
      throw new Error('Utente non registrato. Per favore registrati prima.');
    }

    // Aggiungi questa parte per salvare la sessione
    localStorage.setItem(
      'walletAuth',
      JSON.stringify({
        address: signer.address,
        timestamp: Date.now(),
      })
    );

    return new Promise((resolve, reject) => {
      gun.user().auth(pair, async (ack) => {
        if (ack.err) {
          reject(new Error(ack.err));
          return;
        }

        let addFriendRequestCertificate = gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get('friendRequests');

        if (!addFriendRequestCertificate) {
          await createFriendRequestCertificate();
        }

        // Controlla il certificato per le notifiche
        let notificationCertificate = gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get('notifications');

        if (!notificationCertificate) {
          await createNotificationCertificate();
        }

        // Salva i dati di autenticazione
        sessionStorage.setItem('isAuthenticated', 'true');
        sessionStorage.setItem('userPub', pair.pub);

        resolve({
          success: true,
          pub: pair.pub,
          message: 'Autenticazione completata con successo.',
          user: { pub: pair.pub, address: signer.address },
        });
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

          try {
            let addFriendRequestCertificate = await gun
              .user()
              .get(DAPP_NAME)
              .get('certificates')
              .get('friendRequests');

            if (!addFriendRequestCertificate) {
              await createFriendRequestCertificate();
            }

            // Controlla il certificato per le notifiche
            let notificationCertificate = await gun
              .user()
              .get(DAPP_NAME)
              .get('certificates')
              .get('notifications')
  
            if (!notificationCertificate) {
              await createNotificationCertificate();
            }
            // Wait for user.is to be available
            let attempts = 0;
            const maxAttempts = 10;

            const checkUser = setInterval(() => {
              attempts++;
              console.log('Checking user.is:', user.is, 'Attempt:', attempts);

              if (user.is) {
                clearInterval(checkUser);
                resolve({
                  success: true,
                  pub: user.is.pub,
                  message: 'Successfully authenticated user.',
                  user: user.is,
                });
              } else if (attempts >= maxAttempts) {
                clearInterval(checkUser);
                reject(new Error('Failed to get user data'));
              }
            }, 100);
          } catch (error) {
            reject(error);
          }
        });
    } catch (error) {
      reject(error);
    }
  });

  // Set a timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Timeout during login'));
    }, LOGIN_TIMEOUT);
  });

  // Execute login with timeout
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

  return loginPromise;
};

export default loginUser;
