import { gun, user, DAPP_NAME } from '../useGun.js';
import { revokeChatsCertificate } from '../security/chatCertificates.js';

/**
 * Removes a friend and cleans up all associated data
 *
 * This function:
 * 1. Revokes all certificates with the friend
 * 2. Removes friendship records from both users
 * 3. Removes friend from both users' friend lists
 * 4. Deletes chat history and messages
 * 5. Cleans up pending friend requests
 * 6. Removes local storage data
 * 7. Forces garbage collection
 *
 * @async
 * @param {string} friendPub - Public key of friend to remove
 * @returns {Promise<Object>} Result object with success status and message
 * @throws {Error} If user not authenticated or removal fails
 */
const removeFriend = async (friendPub) => {
  console.log('Removing friend', friendPub);
  if (!user.is) throw new Error('Utente non autenticato');
  if (!friendPub) throw new Error('Chiave pubblica amico richiesta');

  try {
    const chatId = [user.is.pub, friendPub].sort().join('_');

    // 1. Revoca certificati
    console.log('Inizio revoca certificati...');
    const revocationSuccess = await revokeChatsCertificate(friendPub);

    if (!revocationSuccess) {
      throw new Error('Errore durante la revoca dei certificati');
    }

    console.log('Certificati revocati, procedo con la rimozione dati');

    // 2. Rimuovi tutti i permessi di scrittura
    const removePermissions = async () => {
      console.log('Rimozione permessi di scrittura...');

      const permissionPromises = [
        // Rimuovi permessi chat
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('chats')
            .get(chatId)
            .get('permissions')
            .put(null, (ack) => {
              if (ack.err)
                console.warn('Errore rimozione permessi chat:', ack.err);
              resolve();
            });
        }),

        // Rimuovi permessi messaggi
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('messages')
            .get(chatId)
            .get('permissions')
            .put(null, (ack) => {
              if (ack.err)
                console.warn('Errore rimozione permessi messaggi:', ack.err);
              resolve();
            });
        }),

        // Rimuovi certificati chat
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('chats')
            .get(friendPub)
            .put(null, (ack) => {
              if (ack.err)
                console.warn('Errore rimozione certificati chat:', ack.err);
              resolve();
            });
        }),

        // Rimuovi certificati messaggi
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('messages')
            .get(friendPub)
            .put(null, (ack) => {
              if (ack.err)
                console.warn('Errore rimozione certificati messaggi:', ack.err);
              resolve();
            });
        }),

        // Rimuovi certificati privati chat
        new Promise((resolve) => {
          user
            .get('private_certificates')
            .get('chats')
            .get(friendPub)
            .put(null, (ack) => {
              if (ack.err)
                console.warn(
                  'Errore rimozione certificati privati chat:',
                  ack.err
                );
              resolve();
            });
        }),

        // Rimuovi certificati privati messaggi
        new Promise((resolve) => {
          user
            .get('private_certificates')
            .get('messages')
            .get(friendPub)
            .put(null, (ack) => {
              if (ack.err)
                console.warn(
                  'Errore rimozione certificati privati messaggi:',
                  ack.err
                );
              resolve();
            });
        }),
      ];

      await Promise.all(permissionPromises);
      console.log('Permessi rimossi');
    };

    // 3. Rimuovi amicizia da entrambi i lati
    const removeFriendship = async () => {
      console.log('Cerco amicizia da rimuovere...');

      // Prima trova e rimuovi l'amicizia
      await new Promise((resolve) => {
        let found = false;
        gun
          .get(DAPP_NAME)
          .get('friendships')
          .map()
          .once((friendship, id) => {
            if (
              friendship &&
              ((friendship.user1 === friendPub &&
                friendship.user2 === user.is.pub) ||
                (friendship.user2 === friendPub &&
                  friendship.user1 === user.is.pub))
            ) {
              found = true;
              console.log('Trovata amicizia da rimuovere:', id);

              // Rimuovi completamente il nodo
              gun
                .get(DAPP_NAME)
                .get('friendships')
                .get(id)
                .put(null, (ack) => {
                  if (ack.err) {
                    console.error('Errore rimozione amicizia:', ack.err);
                  } else {
                    console.log('Amicizia rimossa con successo:', id);
                  }
                });
            }
          });

        // Attendi un po' per assicurarsi che Gun abbia processato le modifiche
        setTimeout(() => {
          if (!found) {
            console.warn('Nessuna amicizia trovata da rimuovere');
          }
          resolve();
        }, 2000);
      });

      // Rimuovi anche dal nodo friends
      await Promise.all([
        // Rimuovi dalla lista amici dell'utente corrente
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('friends')
            .get(user.is.pub)
            .get(friendPub)
            .put(null, (ack) => {
              if (ack.err) {
                console.warn('Errore rimozione lista amici utente:', ack.err);
              } else {
                console.log('Amico rimosso dalla lista utente');
              }
              resolve();
            });
        }),

        // Rimuovi dalla lista amici dell'amico
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('friends')
            .get(friendPub)
            .get(user.is.pub)
            .put(null, (ack) => {
              if (ack.err) {
                console.warn('Errore rimozione lista amici amico:', ack.err);
              } else {
                console.log('Amico rimosso dalla lista amico');
              }
              resolve();
            });
        }),
      ]);

      // Verifica finale che l'amicizia sia stata rimossa
      await new Promise((resolve) => {
        let stillExists = false;
        gun
          .get(DAPP_NAME)
          .get('friendships')
          .map()
          .once((friendship) => {
            if (
              friendship &&
              ((friendship.user1 === friendPub &&
                friendship.user2 === user.is.pub) ||
                (friendship.user2 === friendPub &&
                  friendship.user1 === user.is.pub))
            ) {
              stillExists = true;
              console.warn('Amicizia ancora presente, forzo rimozione');
              // Forza rimozione se ancora presente
              gun
                .get(DAPP_NAME)
                .get('friendships')
                .get(friendship._['#'])
                .put(null);
            }
          });

        // Attendi un po' più a lungo per la verifica finale
        setTimeout(() => {
          if (stillExists) {
            console.warn('Amicizia ancora presente dopo la rimozione');
          } else {
            console.log('Amicizia rimossa con successo');
          }
          resolve();
        }, 3000);
      });
    };

    // 4. Rimuovi messaggi e chat
    const removeMessages = async () => {
      console.log('Rimuovo messaggi della chat:', chatId);

      const messagePromises = [
        // Rimuovi la chat
        new Promise((resolve) => {
          gun
            .get(`${DAPP_NAME}/chats`)
            .get(chatId)
            .put(null, (ack) => {
              if (ack.err) console.warn('Errore rimozione chat:', ack.err);
              resolve();
            });
        }),

        // Rimuovi i messaggi
        new Promise((resolve) => {
          gun
            .get(`${DAPP_NAME}/messages`)
            .get(chatId)
            .put(null, (ack) => {
              if (ack.err) console.warn('Errore rimozione messaggi:', ack.err);
              resolve();
            });
        }),
      ];

      await Promise.all(messagePromises);

      // Rimuovi le sottoscrizioni
      gun.get(`${DAPP_NAME}/chats`).get(chatId).off();
      gun.get(`${DAPP_NAME}/messages`).get(chatId).off();

      console.log('Chat e messaggi rimossi');
    };

    // 5. Rimuovi richieste
    const removeRequests = async () => {
      console.log('Rimuovo richieste pendenti...');

      return new Promise((resolve) => {
        const requestPromises = [];

        gun
          .get(`${DAPP_NAME}/all_friend_requests`)
          .map()
          .once((request, requestId) => {
            if (!request) return;
            if (request.from === friendPub || request.to === friendPub) {
              requestPromises.push(
                new Promise((resolveRequest) => {
                  gun
                    .get(`${DAPP_NAME}/all_friend_requests`)
                    .get(requestId)
                    .put(null, (ack) => {
                      if (ack.err)
                        console.warn('Errore rimozione richiesta:', ack.err);
                      resolveRequest();
                    });
                })
              );
            }
          });

        // Aspetta un po' per assicurarsi che tutte le richieste siano state trovate
        setTimeout(async () => {
          await Promise.all(requestPromises);
          console.log('Richieste rimosse');
          resolve();
        }, 1000);
      });
    };

    // 6. Rimuovi dati locali
    const removeLocalData = async () => {
      console.log('Pulizia dati locali...');
      localStorage.removeItem(`friend_${friendPub}`);
      localStorage.removeItem(`chat_${chatId}`);
      localStorage.removeItem(`messages_${chatId}`);
      localStorage.removeItem(`friend_subscription_${friendPub}`);
      console.log('Dati locali rimossi');
    };

    // Esegui tutte le operazioni in sequenza
    console.log('Inizio rimozione permessi...');
    await removePermissions();
    console.log('Inizio rimozione amicizia...');
    await removeFriendship();
    console.log('Inizio rimozione messaggi...');
    await removeMessages();
    console.log('Inizio rimozione richieste...');
    await removeRequests();
    console.log('Inizio pulizia dati locali...');
    await removeLocalData();

    // Verifica finale dei permessi e delle sottoscrizioni
    const verifyPermissions = async () => {
      const checks = [
        // Verifica permessi chat
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('chats')
            .get(chatId)
            .get('permissions')
            .once((perms) => {
              if (perms) {
                console.warn(
                  'Warning: i permessi della chat sono ancora presenti'
                );
                gun
                  .get(DAPP_NAME)
                  .get('chats')
                  .get(chatId)
                  .get('permissions')
                  .put(null);
              }
              resolve();
            });
        }),

        // Verifica permessi messaggi
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('messages')
            .get(chatId)
            .get('permissions')
            .once((perms) => {
              if (perms) {
                console.warn(
                  'Warning: i permessi dei messaggi sono ancora presenti'
                );
                gun
                  .get(DAPP_NAME)
                  .get('messages')
                  .get(chatId)
                  .get('permissions')
                  .put(null);
              }
              resolve();
            });
        }),

        // Verifica amicizia
        new Promise((resolve) => {
          gun
            .get(`${DAPP_NAME}/friendships`)
            .get(user.is.pub)
            .get(friendPub)
            .once((friendship) => {
              if (friendship) {
                console.warn('Warning: amicizia ancora presente');
                gun
                  .get(`${DAPP_NAME}/friendships`)
                  .get(user.is.pub)
                  .get(friendPub)
                  .put(null);
              }
              resolve();
            });
        }),

        // Verifica amicizia inversa
        new Promise((resolve) => {
          gun
            .get(`${DAPP_NAME}/friendships`)
            .get(friendPub)
            .get(user.is.pub)
            .once((friendship) => {
              if (friendship) {
                console.warn('Warning: amicizia inversa ancora presente');
                gun
                  .get(`${DAPP_NAME}/friendships`)
                  .get(friendPub)
                  .get(user.is.pub)
                  .put(null);
              }
              resolve();
            });
        }),
      ];

      await Promise.all(checks);
      console.log('Verifica permessi e amicizie completata');
    };

    await verifyPermissions();
    console.log('Rimozione amico completata con successo');
    return true;
  } catch (error) {
    console.error('Errore durante la rimozione amico:', error);
    throw error;
  }
};

export default removeFriend;
