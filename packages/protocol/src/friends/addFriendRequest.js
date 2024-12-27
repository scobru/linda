import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  generateAddFriendCertificate,
  createFriendRequestCertificate,
  createChatsCertificate,
  createMessagesCertificate,
} from '../security/index.js';
import { certificateManager } from '../security/certificateManager.js';
import SEA from 'gun/sea.js';
import { updateGlobalMetrics } from '../system/systemService.js';

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

    console.log('Target pub:', targetPub);

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
      console.log('Verifica certificati esistenti...');

      // Genera certificati per chat e messaggi
      console.log('Generazione certificati chat e messaggi...', {
        targetPub,
        userPub,
      });
      const [chatCertificate, messageCertificate] = await Promise.all([
        createChatsCertificate(targetPub),
        createMessagesCertificate(targetPub),
      ]);

      if (!chatCertificate || !messageCertificate) {
        throw new Error('Impossibile generare i certificati chat e messaggi');
      }

      // Salva i certificati pubblicamente
      await Promise.all([
        // Certificato chat
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('chats')
            .get(targetPub)
            .put(chatCertificate, (ack) => {
              console.log('Salvataggio certificato chat:', ack);
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        }),
        // Certificato messaggi
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('messages')
            .get(targetPub)
            .put(messageCertificate, (ack) => {
              console.log('Salvataggio certificato messaggi:', ack);
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        }),
      ]);

      // Verifica il salvataggio dei certificati
      const [savedChatCert, savedMessageCert] = await Promise.all([
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('chats')
            .get(targetPub)
            .once((cert) => {
              console.log('Certificato chat salvato:', cert);
              resolve(cert);
            });
        }),
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('messages')
            .get(targetPub)
            .once((cert) => {
              console.log('Certificato messaggi salvato:', cert);
              resolve(cert);
            });
        }),
      ]);

      if (!savedChatCert || !savedMessageCert) {
        throw new Error('Errore nel salvataggio dei certificati');
      }

      // Verifica la validità dei certificati
      console.log('Verifica certificati con:', {
        targetPub,
        userPub,
        savedChatCert,
        savedMessageCert,
      });

      const [isChatValid, isMessageValid] = await Promise.all([
        certificateManager.verifyCertificate(savedChatCert, targetPub, 'chats'),
        certificateManager.verifyCertificate(
          savedMessageCert,
          targetPub,
          'messages'
        ),
      ]);

      if (!isChatValid || !isMessageValid) {
        throw new Error('I certificati generati non sono validi');
      }

      console.log('Certificati generati e verificati con successo:', {
        chat: {
          cert: savedChatCert,
          valid: isChatValid,
        },
        message: {
          cert: savedMessageCert,
          valid: isMessageValid,
        },
      });

      // Verifica certificato per richieste di amicizia con timeout
      const existingFriendRequestCert = await new Promise((resolve) => {
        let resolved = false;

        gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get('friendRequests')
          .get(targetPub)
          .once((cert) => {
            if (!resolved) {
              resolved = true;
              resolve(cert);
            }
          });

        // Timeout di sicurezza
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        }, 2000);
      });

      console.log('Existing friend request cert:', existingFriendRequestCert);

      // Genera sempre un nuovo certificato se non esiste o non è valido
      console.log('Generazione certificato richieste...');
      const friendRequestCertificate = await createFriendRequestCertificate(
        targetPub
      );
      if (!friendRequestCertificate) {
        throw new Error('Impossibile generare il certificato per le richieste');
      }

      // Salva esplicitamente il nuovo certificato
      await gun
        .user()
        .get(DAPP_NAME)
        .get('certificates')
        .get('friendRequests')
        .get(targetPub)
        .put(friendRequestCertificate);

      // Verifica il salvataggio
      const savedCert = await new Promise((resolve) => {
        let resolved = false;

        gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get('friendRequests')
          .get(targetPub)
          .once((cert) => {
            if (!resolved) {
              resolved = true;
              resolve(cert);
            }
          });

        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        }, 2000);
      });

      if (!savedCert) {
        throw new Error('Errore nel salvataggio del certificato');
      }

      // Genera certificato di autorizzazione
      console.log('Generazione certificato di autorizzazione...');
      const authCert = await generateAddFriendCertificate(targetPub);
      if (!authCert.success) {
        throw new Error(
          authCert.errorMessage || 'Errore nella generazione del certificato'
        );
      }

      console.log('Certificati generati con successo:', {
        friendRequestCertificate,
        authCert,
      });

      // Firma i dati della richiesta
      const signedData = await SEA.sign(
        {
          type: 'friendRequest',
          from: userPub,
          to: targetPub,
          timestamp: Date.now(),
          data: requestData,
        },
        user._.sea
      );

      if (!signedData) {
        throw new Error('Errore nella firma dei dati della richiesta');
      }

      // Prima generiamo la notifica cifrata
      const encryptedNotification = await notifyUser(targetPub, signedData);

      // Poi salviamo la richiesta con i dati firmati e la notifica cifrata
      const request = await gun
        .get(DAPP_NAME)
        .get('all_friend_requests')
        .get(requestId)
        .put(
          {
            ...requestData,
            signedData,
            data: encryptedNotification,
            type: 'friendRequest',
            senderInfo: {
              pub: user.is.pub,
              alias: user.is.alias,
            },
          },
          (ack) => {
            if (ack.err) {
              console.error('Errore nel salvataggio:', ack.err);
              throw new Error(ack.err);
            }
            console.log('Richiesta salvata con successo');
            return true;
          }
        );

      console.log('Request saved:', request);

      // Infine inviamo la notifica diretta
      gun.user(targetPub).get('notifications').set({
        type: 'friendRequest',
        from: user.is.pub,
        timestamp: Date.now(),
        data: encryptedNotification,
      });

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
  } finally {
    updateGlobalMetrics('totalFriendRequestsMade', 1);
  }
};

const notifyUser = async (targetPub, signedRequestData) => {
  try {
    // Prima crea il certificato di autorizzazione se non esiste
    const authCert = await gun
      .user()
      .get(DAPP_NAME)
      .get('certificates')
      .get('friendRequests')
      .then();

    console.log('AuthCert:', authCert);

    if (!authCert) {
      // Crea un nuovo certificato di autorizzazione
      const newAuthCert = await createFriendRequestCertificate();
      if (!newAuthCert) {
        throw new Error('Impossibile creare il certificato di autorizzazione');
      }
    }

    // Ottieni la chiave pubblica del destinatario
    const targetUser = await gun.get(`~${targetPub}`).then();
    if (!targetUser || !targetUser.epub) {
      throw new Error(
        'Impossibile trovare la chiave di cifratura del destinatario'
      );
    }

    // Prepara i dati della notifica
    const notificationData = {
      type: 'friendRequest',
      from: user.is.pub,
      timestamp: Date.now(),
      data: signedRequestData,
    };

    // Firma i dati con la nostra chiave privata
    const signedNotification = await SEA.sign(
      JSON.stringify(notificationData),
      user._.sea
    );

    console.log('SignedNotification:', signedNotification);

    // Cifra la notifica firmata con la chiave condivisa
    const sharedSecret = await SEA.secret(targetUser.epub, user._.sea);
    const encryptedNotification = await SEA.encrypt(
      signedNotification,
      sharedSecret
    );

    console.log('EncryptedNotification:', encryptedNotification);

    // Forza la sincronizzazione
    gun
      .get(DAPP_NAME)
      .get('all_friend_requests')
      .once((data) => {
        console.log('Verifica richieste pubbliche:', data);
      });

    console.log('Notifica inviata con successo a:', targetPub);
    return encryptedNotification;
  } catch (error) {
    console.error("Errore dettagliato nell'invio della notifica:", error);
    throw new Error(`Errore nell'invio della notifica: ${error.message}`);
  }
};

export default addFriendRequest;
