import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from '../security/index.js';
import { updateGlobalMetrics } from '../system/systemService.js';

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

    return new Promise((resolve, reject) => {
      gun.user().auth(pair, async (ack) => {
        if (ack.err) {
          reject(new Error(ack.err));
          return;
        }

        try {
          // Genera/recupera il wallet interno
          const privateKey = user._.sea.priv;
          const internalWallet = await gun.gunToEthAccount(privateKey);
          
          // Salva il wallet interno
          localStorage.setItem('gunWallet', JSON.stringify(internalWallet));

          // Salva l'auth di MetaMask
          localStorage.setItem(
            'walletAuth',
            JSON.stringify({
              address: signer.address,
              timestamp: Date.now(),
            })
          );

          // Aggiorna i dati utente usando l'indirizzo interno
          await gun.get(DAPP_NAME)
            .get('userList')
            .get('users')
            .set({
              pub: pair.pub,
              address: internalWallet.account.address, // Usa l'indirizzo del wallet interno
              metamaskAddress: signer.address, // Mantieni riferimento a MetaMask
              timestamp: Date.now(),
              lastSeen: Date.now(),
              authType: 'wallet'
            });

          // Aggiorna anche il profilo utente
          await gun.user().get(DAPP_NAME).get('profile').put({
            address: internalWallet.account.address // Usa l'indirizzo del wallet interno
          });

          // Aggiorna il nickname se necessario
          await gun.get(DAPP_NAME)
            .get('userList')
            .get('nicknames')
            .get(pair.pub)
            .put(internalWallet.account.address.slice(0, 8));

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
            user: { 
              pub: pair.pub, 
              address: internalWallet.account.address // Usa l'indirizzo del wallet interno
            },
          });
        } catch (error) {
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

  const loginPromise = new Promise(async (resolve, reject) => {
    try {
      if (!credentials.username || !credentials.password) {
        reject(new Error('Username and password are required'));
        return;
      }

      await gun
        .user()
        .auth(credentials.username, credentials.password, async (ack) => {
          if (ack.err) {
            reject(new Error(ack.err));
            return;
          }

          try {
            // Usa gun.gunToEthAccount invece di walletService
            const privateKey = user._.sea.priv;
            const userWallet = await gun.gunToEthAccount(privateKey);
            console.log('Retrieved wallet:', userWallet);

            // salva wallet in localstorage
            localStorage.setItem('gunWallet', JSON.stringify(userWallet));

            // Aggiorna i dati del wallet
            gun.get(DAPP_NAME)
              .get('userList')
              .get('users')
              .set({
                pub: user.is.pub,
                username: credentials.username,
                address: userWallet?.account.address,
                timestamp: Date.now(),
                lastSeen: Date.now(),
                authType: 'gun'
              });

            // Aggiorna anche il profilo utente
            gun.user().get(DAPP_NAME).get('profile').put({
              address: userWallet?.account.address
            });

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
              .get('notifications');

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

            // Aggiorna le metriche globali
            gun.get(DAPP_NAME)
              .get('globalMetrics')
              .get('totalLogins')
              .once((val) => {
                const current = val || 0;
                gun.get(DAPP_NAME)
                  .get('globalMetrics')
                  .get('totalLogins')
                  .put(current + 1);
              });

            // Aggiorna anche le metriche del protocollo
            gun.get(DAPP_NAME)
              .get('protocol')
              .get('authentication')
              .get('logins')
              .once((val) => {
                const current = val || 0;
                gun.get(DAPP_NAME)
                  .get('protocol')
                  .get('authentication')
                  .get('logins')
                  .put(current + 1);
              });
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

  // Incrementa il contatore dei login
  updateGlobalMetrics('totalLogins', 1);

  return loginPromise;
};

export default loginUser;
