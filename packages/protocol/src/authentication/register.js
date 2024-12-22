import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createFriendRequestCertificate,
  createNotificationCertificate,
} from '../security/index.js';
import { updateGlobalMetrics } from '../system/systemService.js';

const LOGIN_TIMEOUT = 10000; // 10 secondi

export const registerWithMetaMask = async (address) => {
  try {
    // Verifica se l'utente esiste già
    const existingUser = await gun
      .get(DAPP_NAME)
      .get('users')
      .get(address.toLowerCase())
      .once();

    if (existingUser) {
      throw new Error('Utente già registrato con questo indirizzo.');
    }

    const signer = await gun.getSigner();
    if (!signer || !signer.address) {
      throw new Error('Signer non valido');
    }

    const signature = await gun.createSignature(gun.MESSAGE_TO_SIGN);
    if (!signature) {
      throw new Error('Firma non valida');
    }

    const password = await gun.generatePassword(signature);
    if (!password || password.length < 32) {
      throw new Error('Password generata non valida');
    }

    // Creiamo l'account Ethereum
    const userData = await gun.ethToGunAccount();
    if (!userData || !userData.pair) {
      throw new Error('Creazione account fallita');
    }

    return new Promise((resolve, reject) => {
      user.create(userData.pair, async (ack) => {
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

          // Prepara i dati utente
          const userDataToSave = {
            pub: userData.pub,
            address: userData.internalWalletAddress,
            externalWalletAddress: signer.address,
            username: signer.address,
            nickname: signer.address,
            timestamp: Date.now(),
            authType: 'wallet',
            viewingPublicKey: userData.viewingPublicKey,
            spendingPublicKey: userData.spendingPublicKey,
            pair: userData.env_pair,
            v_Pair: userData.env_v_pair,
            s_Pair: userData.env_s_pair,
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

          // Salva nel localStorage
          localStorage.setItem(
            `gunWallet_${userData.pub}`,
            JSON.stringify({
              internalWalletAddress: userData.internalWalletAddress,
              internalWalletPk: userData.internalWalletPk,
              pair: userData.pair,
              v_Pair: userData.vPair,
              s_Pair: userData.sPair,
              viewingPublicKey: userData.viewingPublicKey,
              spendingPublicKey: userData.spendingPublicKey,
              credentials: {
                username: signer.address,
                password: password,
              },
            })
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

          // Salva anche nel nodo gun-eth
          await new Promise((resolve, reject) => {
            gun
              .get(DAPP_NAME)
              .get('addresses')
              .get(userData.internalWalletAddress.toLowerCase())
              .put(
                {
                  pub: userData.pub,
                  internalWalletAddress: userData.internalWalletAddress,
                  viewingPublicKey: userData.viewingPublicKey,
                  spendingPublicKey: userData.spendingPublicKey,
                  pair: userData.env_pair,
                  v_Pair: userData.env_v_pair,
                  s_Pair: userData.env_s_pair,
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

          console.log('Dati salvati in users:', userDataToSave);
          console.log('Dati salvati in profiles:', userDataToSave);
          console.log('Dati salvati in addresses:', userDataToSave);

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

const registerUser = (credentials = {}, callback = () => {}) => {
  let timeoutId;

  const registerPromise = new Promise(async (resolve, reject) => {
    try {
      // Validazione iniziale
      if (!credentials.username || !credentials.password) {
        reject(new Error('Username e password sono richiesti'));
        return;
      }

      // Verifica esistenza utente
      const existingUser = await new Promise((resolve) => {
        gun.get(`~@${credentials.username}`).once((user) => {
          console.log('Verifica utente esistente:', user);
          resolve(user);
        });
      });

      if (existingUser) {
        reject(new Error('Username già in uso.'));
        return;
      }

      // 1. Prima crea l'utente
      const createAck = await new Promise((resolve, reject) => {
        user.create(credentials.username, credentials.password, (ack) => {
          console.log('Risposta creazione utente:', ack);
          if (ack.err) {
            reject(new Error(ack.err));
            return;
          }
          resolve(ack);
        });
      });

      // 2. Autentica l'utente
      await new Promise((resolve, reject) => {
        user.auth(credentials.username, credentials.password, (ack) => {
          console.log('Risposta autenticazione:', ack);
          if (ack.err) reject(new Error(ack.err));
          else resolve(ack);
        });
      });

      // 3. Genera l'account Ethereum
      const userData = await gun.gunToEthAccount(
        user._.sea,
        credentials.password
      );

      // 4. Prepara i dati utente con le chiavi cifrate direttamente nella struttura
      const userDataToSave = {
        pub: user.is.pub,
        address: userData.internalWalletAddress,
        externalWalletAddress: null,
        username: credentials.username,
        nickname: credentials.username,
        timestamp: Date.now(),
        authType: 'credentials',
        viewingPublicKey: userData.viewingPublicKey,
        spendingPublicKey: userData.spendingPublicKey,
        pair: userData.env_pair,
        v_Pair: userData.env_v_pair,
        s_Pair: userData.env_s_pair,
      };

      // 5. Salva i dati in tutti i percorsi necessari
      await Promise.all([
        // Salva in users
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('users')
            .get(user.is.pub)
            .put(userDataToSave, (ack) => {
              console.log('Salvataggio users:', ack);
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),

        // Salva nel profilo utente
        new Promise((resolve, reject) => {
          gun
            .user()
            .get(DAPP_NAME)
            .get('profiles')
            .get(user.is.pub)
            .put(userDataToSave, (ack) => {
              console.log('Salvataggio profiles:', ack);
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),

        // Salva anche nell'indirizzo
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('addresses')
            .get(user.is.pub)
            .put(userDataToSave, (ack) => {
              console.log('Salvataggio addresses:', ack);
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
        }),
      ]);

      // Verifica il salvataggio
      const verifyData = async () => {
        const [usersData, profilesData, addressesData] = await Promise.all([
          gun.get(DAPP_NAME).get('users').get(user.is.pub).once(),
          gun.user().get(DAPP_NAME).get('profiles').get(user.is.pub).once(),
          gun.get(DAPP_NAME).get('addresses').get(user.is.pub).once(),
        ]);

        console.log('Verifica dati salvati:', {
          users: usersData,
          profiles: profilesData,
          addresses: addressesData,
          hasKeys: {
            users: !!(
              usersData?.pair &&
              usersData?.v_Pair &&
              usersData?.s_Pair
            ),
            profiles: !!(
              profilesData?.pair &&
              profilesData?.v_Pair &&
              profilesData?.s_Pair
            ),
            addresses: !!(
              addressesData?.pair &&
              addressesData?.v_Pair &&
              addressesData?.s_Pair
            ),
          },
        });

        if (!usersData?.pair || !profilesData?.pair || !addressesData?.pair) {
          throw new Error('Verifica salvataggio dati fallita: chiavi mancanti');
        }
      };

      await verifyData();

      // Salva nel localStorage
      localStorage.setItem(
        `gunWallet_${user.is.pub}`,
        JSON.stringify({
          internalWalletAddress: userData.internalWalletAddress,
          internalWalletPk: userData.internalWalletPk,
          viewingPublicKey: userData.viewingPublicKey,
          spendingPublicKey: userData.spendingPublicKey,
          pair: userData.pair,
          v_Pair: userData.vPair,
          s_Pair: userData.sPair,
          credentials,
        })
      );

      // Crea i certificati
      await Promise.all([
        createFriendRequestCertificate(),
        createNotificationCertificate(),
      ]);

      // Aggiorna metriche globali
      updateGlobalMetrics('totalRegistrations', 1);

      console.log('Dati salvati in users:', userDataToSave);
      console.log('Dati salvati in profiles:', userDataToSave);
      console.log('Dati salvati in addresses:', userDataToSave);

      resolve({
        success: true,
        pub: user.is.pub,
        userData: userDataToSave,
        message: 'Utente creato con successo',
      });

      if (callback)
        callback({ success: true, pub: user.is.pub, userData: userDataToSave });
    } catch (error) {
      console.error('Errore nel salvataggio dei dati:', error);
      throw error;
    }
  });

  // Aggiungi la gestione del timeout come in login.js
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Timeout durante la registrazione'));
    }, LOGIN_TIMEOUT);
  });

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
      callback({
        success: false,
        errMessage: error.message,
        errCode: 'register-error',
      });
    });

  return registerPromise;
};

export default registerUser;
