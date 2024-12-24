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

    console.log('loginWithMetaMask');

    const normalizedAddress = address.toLowerCase();

    // Cerca l'utente nell'indice degli indirizzi
    const existingUser = await gun
      .get(DAPP_NAME)
      .get('addresses')
      .get(normalizedAddress)
      .once();

    console.log('existingUser:', existingUser);

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

          const friendRequestCertificate =
            await createFriendRequestCertificate();
          const notificationCertificate = await createNotificationCertificate();

          console.log('friendRequestCertificate:', friendRequestCertificate);
          console.log('notificationCertificate:', notificationCertificate);

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

// Funzione per verificare l'esistenza dell'utente
const checkUserExists = (username) => {
  return new Promise((resolve) => {
    let checked = false;
    const alias = `~@${username}`;

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
        if (!checked && data && data.username === username) {
          checked = true;
          console.log('User found in userList:', data);
          resolve(true);
        }
      });

    // Timeout per la verifica
    setTimeout(() => {
      if (!checked) {
        checked = true;
        console.log('User not found after timeout');
        resolve(false);
      }
    }, 5000);
  });
};

const findUserData = (username, pub) => {
  return new Promise((resolve) => {
    let found = false;
    const paths = [
      // Percorso 1: Dati utente diretti
      () => gun.get(DAPP_NAME).get('users').get(pub),
      // Percorso 2: Profilo utente
      () => user.get('profile'),
      // Percorso 3: Lista utenti per username
      () =>
        gun
          .get(DAPP_NAME)
          .get('users')
          .map()
          .once((data, key) => {
            if (data && data.username === username) {
              return data;
            }
          }),
      // Percorso 4: Alias
      () =>
        gun.get(`~@${username}`).once((data, key) => {
          if (data) {
            return gun.get(DAPP_NAME).get('users').get(Object.keys(data)[1]);
          }
        }),
    ];

    const tryPath = async (index) => {
      if (index >= paths.length || found) {
        if (!found) {
          resolve(null);
        }
        return;
      }

      console.log(`Tentativo percorso ${index + 1}/${paths.length}`);

      try {
        const result = await new Promise((res) => {
          paths[index]().once((data) => {
            console.log(`Risultato percorso ${index + 1}:`, data);
            res(data);
          });

          // Timeout per ogni percorso
          setTimeout(() => res(null), 2000);
        });

        if (result && !found) {
          found = true;
          resolve(result);
          return;
        }

        // Prova il prossimo percorso
        setTimeout(() => tryPath(index + 1), 500);
      } catch (error) {
        console.error(`Errore nel percorso ${index + 1}:`, error);
        setTimeout(() => tryPath(index + 1), 500);
      }
    };

    // Inizia la ricerca
    tryPath(0);

    // Timeout globale
    setTimeout(() => {
      if (!found) {
        resolve(null);
      }
    }, 10000);
  });
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
  console.log('Verifica esistenza utente...');

  // Verifica se l'utente esiste
  const userExists = await checkUserExists(credentials.username);
  console.log('userExists:', userExists);

  if (!userExists) {
    return {
      success: false,
      errMessage: 'Utente non trovato',
      errCode: 'login-error',
    };
  }

  console.log('Tentativo di autenticazione...');

  // Ottieni l'istanza dell'utente
  const user = gun.user();

  return new Promise((resolve) => {
    let authAttempts = 0;
    const maxAuthAttempts = 3;

    const attemptAuth = () => {
      authAttempts++;
      console.log(
        `Tentativo di autenticazione ${authAttempts}/${maxAuthAttempts}`
      );

      user.auth(credentials.username, credentials.password, async (ack) => {
        console.log('Risposta autenticazione:', ack);

        if (ack.err) {
          console.error(
            `Errore autenticazione (tentativo ${authAttempts}):`,
            ack.err
          );

          if (authAttempts < maxAuthAttempts) {
            console.log(`Auth attempt ${authAttempts} failed, retrying...`);
            setTimeout(attemptAuth, 1000);
            return;
          }

          resolve({
            success: false,
            errMessage: 'Errore di autenticazione',
            errCode: 'auth-error',
          });
          return;
        }

        // Autenticazione riuscita, verifica i dati utente
        console.log('Autenticazione riuscita, verifica dati utente...');

        try {
          // Cerca i dati utente in tutti i percorsi possibili
          const userData = await findUserData(
            credentials.username,
            user.is.pub
          );

          if (!userData) {
            throw new Error('Dati utente non trovati in nessun percorso');
          }

          console.log('Dati utente recuperati:', userData);

          // Decifra le chiavi
          const [decryptedPair, decryptedVPair, decryptedSPair] =
            await Promise.all([
              gun.decryptWithPassword(userData.env_pair, credentials.password),
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
          await Promise.all([
            createFriendRequestCertificate(),
            createNotificationCertificate(),
          ]);

          resolve({
            success: true,
            user: user,
            profile: userData,
          });
        } catch (error) {
          console.error('Errore nel recupero dati utente:', error);
          resolve({
            success: false,
            errMessage: 'Dati utente non trovati',
            errCode: 'login-error',
          });
        }
      });
    };

    attemptAuth();
  });
};

export default loginUser;
