import { gun, user, DAPP_NAME } from '../useGun.js';
import { createFriendRequestCertificate,createNotificationCertificate } from '../security/index.js';
import { walletService } from '../wallet.js';
import { updateGlobalMetrics } from '../system/systemService.js';

const REGISTRATION_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export const registerWithMetaMask = async (address) => {
  try {
    // 1. Ottieni il signer
    const signer = await gun.getSigner();
    if (!signer || !signer.address) {
      throw new Error('Signer non valido');
    }

    // 2. Crea la firma
    console.log('Richiesta firma per:', gun.MESSAGE_TO_SIGN);
    const signature = await gun.createSignature(gun.MESSAGE_TO_SIGN);
    if (!signature) {
      throw new Error('Firma non valida');
    }

    // Verifica che la firma generi una password valida
    const password = await gun.generatePassword(signature);
    if (!password || password.length < 32) {
      throw new Error('Password generata non valida');
    }

    localStorage.setItem('lastSignature', signature);

    // 3. Crea la coppia crittografata
    console.log('Creazione coppia crittografata per:', signer.address);
    const encryptedPair = await gun.createAndStoreEncryptedPair(signer.address);
    if (!encryptedPair) {
      throw new Error('Errore nella creazione della coppia crittografata');
    }

    // 4. Recupera e decifra la coppia
    console.log('Recupero coppia per:', signer.address);
    let pair;
    try {
      const storedSignature = localStorage.getItem('lastSignature') || signature;
      pair = await gun.getAndDecryptPair(signer.address, password);
    } catch (decryptError) {
      console.log('Tentativo con firma originale...');
      pair = await gun.getAndDecryptPair(signer.address, password);
    }

    if (!pair || typeof pair !== 'object') {
      throw new Error('Formato coppia non valido');
    }

    // 5. Crea l'utente con la coppia recuperata
    return new Promise((resolve, reject) => {
      user.create(pair, async (ack) => {
        if (ack.err) {
          reject(new Error(`Errore durante la creazione dell'utente: ${ack.err}`));
          return;
        }

        try {
          await user.auth(pair);
          
          const privateKey = user._.sea.priv;
          const internalWallet = await gun.gunToEthAccount(privateKey);
          
          // Salva i dati in localStorage
          localStorage.setItem('gunWallet', JSON.stringify(internalWallet));
          localStorage.setItem(
            'walletAuth',
            JSON.stringify({
              address: signer.address,
              timestamp: Date.now(),
            })
          );

          // Prepara i dati utente
          const userData = {
            pub: pair.pub,
            address: internalWallet.account.address,
            metamaskAddress: signer.address,
            username: internalWallet.account.address.slice(0, 8),
            nickname: internalWallet.account.address.slice(0, 8),
            timestamp: Date.now(),
            authType: 'wallet'
          };

          // 6. Salva i dati utente
          const userNode = gun.get(DAPP_NAME).get('userList').get('users');
          await userNode.set(userData);
          
          const countNode = gun.get(DAPP_NAME).get('userList').get('count');
          const currentCount = await countNode.once();
          await countNode.put((currentCount || 0) + 1);
          
          await gun.user().get(DAPP_NAME).get('profile').put({
            nickname: userData.nickname,
            address: userData.address,
            avatarSeed: ''
          });

          // Gestione certificati in parallelo
          await Promise.all([
            createFriendRequestCertificate(),
            createNotificationCertificate()
          ]);

          resolve({
            success: true,
            pub: pair.pub,
            message: 'Utente creato con successo tramite MetaMask'
          });
        } catch (error) {
          reject(new Error(`Errore durante la configurazione dell'utente: ${error.message}`));
        }
      });
    });
  } catch (error) {
    throw error;
  }
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
      user.create(credentials.username, credentials.password, async ({ err, pub }) => {
        if (err) {
          reject(new Error(err));
          return;
        }

        try {
          await user.auth({pub: pub, alias: credentials.username, pass: credentials.password});
          
          const privateKey = user._.sea.priv;
          const internalWallet = await gun.gunToEthAccount(privateKey);

          await gun.saveUserToGun(internalWallet);

          // Prepara i dati utente
          const userData = {
            pub,
            address: internalWallet.account.address,
            username: credentials.username,
            nickname: credentials.username,
            timestamp: Date.now(),
            authType: 'credentials'
          };

          // Salva i dati utente
          const userNode = gun.get(DAPP_NAME).get('userList').get('users');
          await userNode.set(userData);

          const countNode = gun.get(DAPP_NAME).get('userList').get('count');
          const currentCount = await countNode.once();
          await countNode.put((currentCount || 0) + 1);

          await gun.user().get(DAPP_NAME).get('profile').put({
            nickname: userData.nickname,
            address: userData.address,
            avatarSeed: ''
          });




          // Gestione certificati in parallelo
          await Promise.all([
            createFriendRequestCertificate(),
            createNotificationCertificate()
          ]);

          // Aggiorna metriche globali
          gun.get(DAPP_NAME)
            .get('globalMetrics')
            .get('totalUsers')
            .once((currentCount) => {
              const newCount = (currentCount || 0) + 1;
              gun.get(DAPP_NAME)
                .get('globalMetrics')
                .get('totalUsers')
                .put(newCount);
            });

          updateGlobalMetrics('totalRegistrations', 1);

          resolve({
            success: true,
            pub,
            message: 'Utente creato con successo'
          });
        } catch (error) {
          reject(new Error(`Errore durante la configurazione dell'utente: ${error.message}`));
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
