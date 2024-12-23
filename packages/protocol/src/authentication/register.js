import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from '../security/index.js';
import { updateGlobalMetrics } from '../system/systemService.js';

const LOGIN_TIMEOUT = 10000; // 10 secondi
const REGISTRATION_TIMEOUT = 15000; // Increase timeout to 15 seconds

export const registerWithMetaMask = async (address) => {
  try {
    if (!address || typeof address !== 'string') {
      throw new Error('Indirizzo non valido');
    }

    // Normalizza l'indirizzo
    const normalizedAddress = address.toLowerCase();

    // Verifica se l'utente esiste già
    const existingUser = await gun
      .get(DAPP_NAME)
      .get('users')
      .get(normalizedAddress)
      .once();

    if (existingUser) {
      throw new Error('Utente già registrato con questo indirizzo.');
    }

    const signer = await gun.getSigner();
    if (!signer) {
      throw new Error('Signer non valido');
    }

    // Ottieni l'indirizzo del signer come Promise
    const signerAddress = await signer.getAddress();
    console.log('signer test', signer, 'address:', signerAddress);

    // Usa direttamente il metodo signMessage del signer
    const signature = await signer.signMessage(gun.MESSAGE_TO_SIGN);
    if (!signature) {
      throw new Error('Firma non valida');
    }

    console.log('signature', signature);

    const password = await gun.generatePassword(signature);
    if (!password || password.length < 32) {
      throw new Error('Password generata non valida');
    }

    console.log('Password Generated');

    // Creiamo l'account Ethereum
    const userData = await gun.ethToGunAccount();
    if (!userData || !userData.pair) {
      throw new Error('Creazione account fallita');
    }

    console.log('userData', userData);

    return new Promise((resolve, reject) => {
      user.create(signerAddress, userData.pair, async (ack) => {
        if (ack.err) {
          reject(
            new Error(`Errore durante la creazione dell'utente: ${ack.err}`)
          );
          return;
        }

        try {
          await user.auth(userData.pair);

          // Verifica user.is con timeout
          let attempts = 0;
          const maxAttempts = 10;
          const checkUser = setInterval(() => {
            attempts++;
            if (user.is) {
              clearInterval(checkUser);
              // Continua con il resto del codice
            } else if (attempts >= maxAttempts) {
              clearInterval(checkUser);
              throw new Error('Impossibile ottenere i dati utente');
            }
          }, 100);

          // Prepara i dati utente con struttura corretta
          const userDataToSave = {
            pub: userData.pub,
            address: userData.internalWalletAddress,
            externalWalletAddress: signerAddress, // Usa l'indirizzo ottenuto dal signer
            username: signerAddress,
            nickname: signerAddress,
            timestamp: Date.now(),
            authType: 'wallet',
            viewingPublicKey: userData.viewingPublicKey,
            spendingPublicKey: userData.spendingPublicKey,
            env_pair: userData.env_pair,
            env_v_pair: userData.env_v_pair,
            env_s_pair: userData.env_s_pair,
          };

          // Salva nella lista utenti pubblica
          await new Promise((resolve, reject) => {
            gun
              .get(DAPP_NAME)
              .get('users')
              .get(userData.pub)
              .put(userDataToSave, (ack) => {
                if (ack.err) reject(new Error(ack.err));
                else resolve();
              });
          });

          // Salva nel localStorage con struttura corretta
          const walletData = {
            internalWalletAddress: userData.internalWalletAddress,
            internalWalletPk: userData.internalWalletPk,
            externalWalletAddress: signerAddress,
            pair: userData.pair,
            v_Pair: userData.v_pair,
            s_Pair: userData.s_pair,
            viewingPublicKey: userData.viewingPublicKey,
            spendingPublicKey: userData.spendingPublicKey,
            credentials: {
              username: signerAddress,
              password: password,
            },
          };

          localStorage.setItem(
            `gunWallet_${userData.pub}`,
            JSON.stringify(walletData)
          );

          // Salva nel profilo utente
          await new Promise((resolve, reject) => {
            gun
              .user()
              .get(DAPP_NAME)
              .get('profiles')
              .get(userData.pub)
              .put(userDataToSave, (ack) => {
                if (ack.err) reject(new Error(ack.err));
                else resolve();
              });
          });

          // Salva nell'indice degli indirizzi
          await new Promise((resolve, reject) => {
            gun
              .get(DAPP_NAME)
              .get('addresses')
              .get(signerAddress.toLowerCase())
              .put(
                {
                  pub: userData.pub,
                  internalWalletAddress: userData.internalWalletAddress,
                  externalWalletAddress: signerAddress,
                  viewingPublicKey: userData.viewingPublicKey,
                  spendingPublicKey: userData.spendingPublicKey,
                  env_pair: userData.env_pair,
                  env_v_pair: userData.env_v_pair,
                  env_s_pair: userData.env_s_pair,
                },
                (ack) => {
                  if (ack.err) reject(new Error(ack.err));
                  else resolve();
                }
              );
          });

          // Crea i certificati
          await Promise.all([
            createFriendRequestCertificate(),
            createNotificationCertificate(),
          ]);

          // Aggiorna metriche globali
          updateGlobalMetrics('totalRegistrations', 1);

          resolve({
            success: true,
            pub: userData.pub,
            userData: userDataToSave,
            message: 'Utente creato con successo tramite MetaMask',
          });
        } catch (error) {
          reject(
            new Error(
              `Errore durante la configurazione dell'utente: ${error.message}`
            )
          );
        }
      });
    });
  } catch (error) {
    console.error('Error in registerWithMetaMask:', error);
    throw error;
  }
};

export const register = (credentials = {}, callback = () => {}) => {
  let timeoutId;

  const registerPromise = new Promise(async (resolve, reject) => {
    try {
      // Input validation
      if (!credentials.username || !credentials.password) {
        throw new Error('Username and password are required');
      }

      // Check if user exists
      const userExists = await new Promise((resolve) => {
        gun.get(`~@${credentials.username}`).once((data) => {
          resolve(!!data);
        });
        setTimeout(() => resolve(false), 3000);
      });

      if (userExists) {
        throw new Error('Username already taken');
      }

      // Create user with retry logic
      let attempts = 0;
      const maxAttempts = 3;
      let lastError = null;

      while (attempts < maxAttempts) {
        try {
          const result = await new Promise((resolve, reject) => {
            user.create(credentials.username, credentials.password, (ack) => {
              console.log('Registration response:', ack);
              if (ack.err) {
                reject(new Error(ack.err));
              } else {
                resolve(ack);
              }
            });
          });

          // Authenticate immediately after successful registration
          const authResult = await new Promise((resolve, reject) => {
            user.auth(credentials.username, credentials.password, (ack) => {
              console.log('Authentication response:', ack);
              if (ack.err) {
                reject(new Error(ack.err));
              } else {
                resolve(ack);
              }
            });
          });

          // Initialize user data
          await initializeUserData(user.is.pub, credentials);

          resolve({
            success: true,
            pub: user.is.pub,
            username: credentials.username,
          });
          return;
        } catch (error) {
          console.error(`Registration attempt ${attempts + 1} failed:`, error);
          lastError = error;
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }

      throw (
        lastError || new Error('Registration failed after multiple attempts')
      );
    } catch (error) {
      console.error('Registration error:', error);
      reject(error);
    }
  });

  // Handle timeout
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Registration timeout'));
    }, REGISTRATION_TIMEOUT);
  });

  // Race between registration and timeout
  Promise.race([registerPromise, timeoutPromise])
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
        errCode: 'registration-error',
      });
    });

  return registerPromise;
};

// Helper function to initialize user data
const initializeUserData = async (pub, credentials) => {
  try {
    await gun.get(DAPP_NAME).get('userList').get('users').get(pub).put({
      pub: pub,
      username: credentials.username,
      created: Date.now(),
      lastSeen: Date.now(),
    });

    // Create necessary certificates
    await Promise.all([
      createFriendRequestCertificate(),
      createNotificationCertificate(),
    ]);
  } catch (error) {
    console.error('Error initializing user data:', error);
    throw error;
  }
};

export default register;
