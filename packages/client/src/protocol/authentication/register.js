import { gun, user, DAPP_NAME } from '../useGun.js';
import { createFriendRequestCertificate } from '../security/index.js';
import { walletService } from '../wallet.js';

const REGISTRATION_TIMEOUT = 10000; // 10 seconds

export const registerWithMetaMask = async (address) => {
  let timeoutId;

  const registrationPromise = new Promise(async (resolve, reject) => {
    try {
      const signer = await gun.getSigner;
      console.log('Signer:', signer);

      const signature = await gun.createSignature(gun.MESSAGE_TO_SIGN);
      console.log('Signature:', signature);

      await gun.createAndStoreEncryptedPair(signer.address, signature);

      const pair = await gun.getAndDecryptPair(signer.address, signature);
      console.log('Pair:', pair);

      user.create(pair, async (ack) => {
        if (ack.err) {
          reject(new Error(ack.err));
          return;
        }

        await user.auth(pair);

        try {
          // Genera il wallet interno usando la chiave privata di Gun
          const privateKey = user._.sea.priv;
          const internalWallet = await gun.gunToEthAccount(privateKey);
          
          // Salva il wallet interno nel localStorage
          localStorage.setItem('gunWallet', JSON.stringify(internalWallet));

          // Salva l'auth di MetaMask
          localStorage.setItem(
            'walletAuth',
            JSON.stringify({
              address: signer.address,
              timestamp: Date.now(),
            })
          );

          // Usa una sola chiamata per salvare i dati utente
          await gun.get(DAPP_NAME).get('userList').get('users').set({
            pub: pair.pub,
            address: internalWallet.account.address, // Usa l'indirizzo del wallet interno come principale
            metamaskAddress: signer.address, // Mantieni riferimento a MetaMask
            username: internalWallet.account.address.slice(0, 8),
            nickname: internalWallet.account.address.slice(0, 8),
            timestamp: Date.now(),
            authType: 'wallet'
          });

          // Rimuovi la seconda chiamata che stava sovrascrivendo l'indirizzo
          await gun.get(DAPP_NAME)
            .get('userList')
            .get('count')
            .once(async (currentCount) => {
              const newCount = (currentCount || 0) + 1;
              await gun
                .get(DAPP_NAME)
                .get('userList')
                .get('count')
                .put(newCount);

              let nickname = internalWallet.account.address.slice(0, 8);

              await gun
                .get(DAPP_NAME)
                .get('userList')
                .get('nicknames')
                .put(pair.pub)
                .put(nickname);

              await gun.user().get(DAPP_NAME).get('profile').put({
                nickname: nickname,
                address: internalWallet.account.address, // Usa l'indirizzo del wallet interno
                avatarSeed: ''
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

              resolve();
            });

          resolve({
            success: true,
            pub: pair.pub,
            message: 'Utente creato con successo tramite MetaMask.',
          });
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      reject(error);
    }
  });

  // Set timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Timeout durante la registrazione'));
    }, REGISTRATION_TIMEOUT);
  });

  // Execute registration with timeout
  return Promise.race([registrationPromise, timeoutPromise])
    .then((result) => {
      clearTimeout(timeoutId);
      return {
        success: true,
        ...result,
      };
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      throw error;
    });
};

/**
 * Registers a new user in the system.
 *
 * This function handles the registration process by:
 * 1. Validating the provided credentials
 * 2. Checking if username is available
 * 3. Creating the user in Gun's user system
 * 4. Updating user counts and lists
 * 5. Setting up friend request certificates
 *
 * @param {Object} credentials - The user's registration credentials
 * @param {string} credentials.username - The desired username
 * @param {string} credentials.password - The user's password (minimum 8 characters)
 * @param {Function} callback - Optional callback function that receives the registration result
 * @returns {Promise<Object>} Promise that resolves with:
 *   - success: {boolean} Whether registration succeeded
 *   - pub: {string} The user's public key
 *   - message: {string} Status message
 * @throws {Error} If credentials are invalid or registration fails
 */
const registerUser = (credentials = {}, callback = () => {}) => {
  let timeoutId;

  const registrationPromise = new Promise(async (resolve, reject) => {
    try {
      // Password validation
      if (!credentials.password || credentials.password.length < 8) {
        reject(new Error('La password deve essere di almeno 8 caratteri.'));
        return;
      }

      // Check if username is already taken
      const existingUser = await new Promise((resolve) => {
        gun.get(`~@${credentials.username}`).once((user) => resolve(user));
      });

      if (existingUser) {
        reject(new Error('Username in uso.'));
        return;
      }

      // Register the new user
      user.create(
        credentials.username,
        credentials.password,
        async ({ err, pub }) => {
          if (err) {
            reject(new Error(err));
            return;
          }

          try {
            // Aggiorna il conteggio utenti in modo atomico
            await new Promise((resolve) => {
              gun.get(DAPP_NAME)
                .get('userList')
                .get('count')
                .once(async (currentCount) => {
                  const newCount = (currentCount || 0) + 1;
                  await gun
                    .get(DAPP_NAME)
                    .get('userList')
                    .get('count')
                    .put(newCount);

                  // Aggiungi l'utente alla lista utenti
                  await gun.get(DAPP_NAME)
                    .get('userList')
                    .get('users')
                    .set({
                      pub,
                      username: credentials.username,
                      timestamp: Date.now(),
                      status: 'active'
                    });

                  resolve();
                });
            });

            resolve({
              success: true,
              pub,
              message: 'Successfully created user.',
            });
          } catch (error) {
            reject(error);
          }
        }
      );
    } catch (error) {
      reject(error);
    }
  });

  // Set timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Timeout durante la registrazione'));
    }, REGISTRATION_TIMEOUT);
  });

  // Execute registration with timeout
  Promise.race([registrationPromise, timeoutPromise])
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
        errCode: 'registration-error',
      });
    });
};

export default registerUser;
