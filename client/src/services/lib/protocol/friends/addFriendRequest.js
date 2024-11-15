import { gun, user } from '../../../state';
import { generateAddFriendCertificate } from '../security';
  
const addFriendRequest = async (publicKeyOrAlias, callback = () => {}) => {
  if (!user || !user.is) {
    throw new Error('Utente non autenticato');
  }

  try {
    const userData = await new Promise((resolve, reject) => {
      gun.user().once((data) => {
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

    const userPub = userData.pub;
    const userAlias = userData.alias;
    const userEpub = userData.epub;

    if (!userPub || !userAlias || !userEpub) {
      throw new Error('Dati utente incompleti');
    }

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
          const pub = Object.keys(data).find(key => key.startsWith('~'));
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

    // Verifica se esiste già una richiesta pendente
    const existingRequest = await new Promise((resolve) => {
      let found = false;
      let checked = 0;
      let totalChecked = 0;

      gun
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

    // Verifica se esiste già un'amicizia
    const existingFriendship = await new Promise((resolve) => {
      let found = false;
      let checked = 0;
      let totalChecked = 0;

      gun
        .get('friendships')
        .map()
        .once((friendship, key) => {
          totalChecked++;
          if (friendship && !friendship._ && key !== '_') {
            // Ignora i metadati
            if (
              (friendship.user1 === targetPub &&
                friendship.user2 === userPub) ||
              (friendship.user2 === targetPub &&
                friendship.user1 === userPub)
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

    // Prima di salvare la richiesta, generiamo e verifichiamo i certificati
    try {
      const addFriendRequestCertificate = await gun
        .user(targetPub)
        .get("certificates")
        .get("friendRequests")
        .then();

      if (!addFriendRequestCertificate) {
        throw new Error('Certificato per richieste di amicizia non trovato');
      }

      // Generiamo il certificato
      await new Promise((resolve, reject) => {
        generateAddFriendCertificate(targetPub, ({ errMessage, errCode, success }) => {
          if (errMessage) {
            reject(new Error(errMessage));
          } else {
            resolve(success);
          }
        });
      });

      // Ora possiamo procedere con il salvataggio della richiesta
      await new Promise((resolve, reject) => {
        gun
          .get('all_friend_requests')
          .get(requestId)
          .put(requestData, (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          });
      });

      return callback({
        success: true,
        message: 'Richiesta di amicizia inviata con successo'
      });

    } catch (error) {
      throw new Error(`Errore nella gestione dei certificati: ${error.message}`);
    }
  } catch (error) {
    console.error('Error in addFriendRequest:', error);
    return callback({
      success: false,
      errMessage: error.message || "Errore nell'invio della richiesta",
    });
  }
};

export default addFriendRequest;
