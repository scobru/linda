import { gun, user, DAPP_NAME } from '../useGun.js';
import { generateAddFriendCertificate } from '../security/index.js';
import { certificateManager } from '../security/certificateManager.js';

/**
 * Sends a friend request to another user
 *
 * This function:
 * 1. Validates the current user is authenticated
 * 2. Resolves target user by public key or alias
 * 3. Verifies target user exists and is not self
 * 4. Checks for existing pending requests or friendships
 * 5. Generates necessary certificates
 * 6. Creates and stores the friend request
 *
 * @async
 * @param {string} publicKeyOrAlias - Public key or alias of target user
 * @param {Function} callback - Optional callback function
 * @returns {Promise<void>} Resolves when request is sent
 * @throws {Error} If user not authenticated or request fails
 */
const addFriendRequest = async (publicKeyOrAlias, callback = () => {}) => {
  if (!user || !user.is) {
    throw new Error('Utente non autenticato');
  }

  try {
    const userData = await new Promise((resolve, reject) => {
      gun.user().once((data) => {
        console.log('User data:', data);
        if (data) {
          resolve(data);
        } else {
          // Aggiungiamo un retry se i dati non sono disponibili immediatamente
          setTimeout(() => {
            gun.user().once((retryData) => {
              if (retryData) {
                resolve(retryData);
              } else {
                reject(new Error('Impossibile recuperare i dati utente'));
              }
            });
          }, 1000);
        }
      });
    });

    console.log('User data:', userData);

    const userPub = userData.pub;
    const userAlias = userData.alias;
    const userEpub = userData.epub;

    let targetPub = publicKeyOrAlias;

    // Se l'input sembra un alias (non contiene caratteri tipici delle chiavi pubbliche)
    if (!publicKeyOrAlias.includes('.') && !publicKeyOrAlias.includes('~')) {
      // Cerca l'utente per alias
      const foundUser = await new Promise((resolve) => {
        let found = null;

        // Cerca nell'indice degli alias
        gun.get(`~@${publicKeyOrAlias}`).once((data) => {
          console.log('Data:', data);

          // get the public key from the first key in data that starts with ~
          const pub = Object.keys(data).find((key) => key.startsWith('~'));
          console.log('Pub:', pub);

          if (pub) {
            found = {
              pub: pub.slice(1),
              alias: publicKeyOrAlias,
            };
            resolve(found);
          } else {
            setTimeout(() => resolve(null), 500);
          }
        });

        // Timeout di sicurezza
        setTimeout(() => resolve(found), 2000);
      });

      if (!foundUser) {
        throw new Error('Utente non trovato con questo alias');
      }

      targetPub = foundUser.pub;
      console.log('Found user by alias:', foundUser);
    }

    if (targetPub === userPub) {
      throw new Error('Non puoi inviare una richiesta a te stesso');
    }

    // Verifica se l'utente esiste
    const targetUser = await new Promise((resolve) => {
      gun.get(`~${targetPub}`).once((data) => {
        resolve(data);
      });
    });

    if (!targetUser) {
      throw new Error('Utente non trovato');
    }

    console.log('Target user:', targetUser);

    // Verifica se esiste già una richiesta pendente
    const existingRequest = await new Promise((resolve) => {
      let found = false;
      let checked = 0;
      let totalChecked = 0;

      gun
        .get(DAPP_NAME)
        .get('all_friend_requests')
        .map()
        .once((request, key) => {
          totalChecked++;
          if (request && !request._ && key !== '_') {
            // Ignora i metadati
            if (
              (request.from === userPub && request.to === targetPub) ||
              (request.from === targetPub && request.to === userPub)
            ) {
              found = true;
            }
          }
          checked++;

          // Se abbiamo controllato tutti gli elementi
          if (checked === totalChecked) {
            setTimeout(() => resolve(found), 100);
          }
        });

      // Timeout di sicurezza
      setTimeout(() => resolve(found), 2000);
    });

    if (existingRequest) {
      throw new Error('Esiste già una richiesta pendente');
    }

    console.log('Existing request:', existingRequest);

    // Verifica se esiste già un'amicizia
    const existingFriendship = await new Promise((resolve) => {
      let found = false;
      let checked = 0;
      let totalChecked = 0;

      gun
        .get(DAPP_NAME)
        .get('friendships')
        .map()
        .once((friendship, key) => {
          totalChecked++;
          if (friendship && !friendship._ && key !== '_') {
            // Ignora i metadati
            if (
              (friendship.user1 === targetPub &&
                friendship.user2 === userPub) ||
              (friendship.user2 === targetPub && friendship.user1 === userPub)
            ) {
              found = true;
            }
          }
          checked++;

          // Se abbiamo controllato tutti gli elementi
          if (checked === totalChecked) {
            setTimeout(() => resolve(found), 100);
          }
        });

      // Timeout di sicurezza
      setTimeout(() => resolve(found), 2000);
    });

    if (existingFriendship) {
      throw new Error('Siete già amici');
    }

    console.log('Existing friendship:', existingFriendship);

    // Prepara i dati della richiesta
    const requestId = `${userPub}_${targetPub}_${Date.now()}`;
    const requestData = {
      id: requestId,
      from: userPub,
      to: targetPub,
      timestamp: Date.now(),
      alias: userAlias,
      senderInfo: {
        pub: userPub,
        alias: userAlias,
        epub: userEpub,
      },
      data: {
        senderInfo: {
          pub: userPub,
          alias: userAlias,
          epub: userEpub,
        },
      },
    };

    console.log('Request data:', requestData);
    console.log('Target pub:', targetPub);

    // Prima di salvare la richiesta, generiamo e verifichiamo i certificati
    try {
      console.log('Getting addFriendRequestCertificate');
      const addFriendRequestCertificate = gun
        .user(targetPub)
        .get(DAPP_NAME)
        .get('certificates')
        .get('friendRequests')
        .then();

      if (!addFriendRequestCertificate) {
        throw new Error('Certificato per richieste di amicizia non trovato');
      }

      console.log('AddFriendRequestCertificate:', addFriendRequestCertificate);

      // Modifica qui: chiamata diretta senza Promise wrapper
      const certResult = await generateAddFriendCertificate(targetPub);

      if (!certResult.success) {
        throw new Error(
          certResult.errorMessage || 'Errore nella generazione del certificato'
        );
      }

      console.log('AddFriendCertificate generated, saving request...');

      // Salva la richiesta
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Timeout nel salvataggio della richiesta'));
        }, 5000);

        gun
          .get(DAPP_NAME)
          .get('all_friend_requests')
          .get(requestId)
          .put(requestData, (ack) => {
            clearTimeout(timeoutId);
            if (ack.err) {
              reject(new Error(ack.err));
            } else {
              resolve(true);
            }
          });
      });

      // segna requestData con sea sign
      const signedRequestData = await SEA.sign(
        JSON.stringify({
          type: 'friendRequest',
          from: userPub,
          timestamp: Date.now(),
          data: requestData,
        }),
        user.pair()
      );

      // Notifica il destinatario
      await notifyUser(targetPub, signedRequestData);

      return callback({
        success: true,
        message: 'Richiesta di amicizia inviata con successo',
      });
    } catch (error) {
      console.error('Errore nella gestione dei certificati:', error);
      return callback({
        success: false,
        errMessage: error.message || "Errore nell'invio della richiesta",
      });
    }
  } catch (error) {
    console.error('Error in addFriendRequest:', error);
    return callback({
      success: false,
      errMessage: error.message || "Errore nell'invio della richiesta",
    });
  }
};

const notifyUser = async (targetPub, signedRequestData) => {
  try {
    // Recupera e verifica il certificato di autorizzazione
    const encryptedCert = await gun
      .user(targetPub)
      .get(DAPP_NAME)
      .get('private_certificates')
      .get(user.is.pub)
      .get('friend_requests')
      .then();

    if (!encryptedCert) {
      throw new Error('Certificato di autorizzazione non trovato');
    }

    // Decifra il certificato
    const decryptedCert = await SEA.decrypt(
      encryptedCert,
      await SEA.secret(user._.sea.epub, targetPub)
    );

    // Verifica l'autorizzazione
    const isAuthorized = await certificateManager.verifyAuthorization(
      decryptedCert,
      'write_friend_requests'
    );

    if (!isAuthorized) {
      throw new Error('Non autorizzato a inviare richieste di amicizia');
    }

    // Cifra la notifica per il destinatario
    const encryptedNotification = await SEA.encrypt(
      signedRequestData,
      await SEA.secret(user._.sea.epub, targetPub)
    );

    // Salva la notifica cifrata nello spazio privato del destinatario
    await gun
      .user(targetPub)
      .get(DAPP_NAME)
      .get('private_notifications')
      .get('friend_requests')
      .set(encryptedNotification);

  } catch (error) {
    throw new Error(`Errore nell'invio della notifica: ${error.message}`);
  }
};

export default addFriendRequest;
