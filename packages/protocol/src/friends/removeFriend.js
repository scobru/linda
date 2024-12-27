import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  revokeChatsCertificate,
  revokeMessagesCertificate,
} from '../security/index.js';

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
    await Promise.all([
      revokeChatsCertificate(friendPub),
      revokeMessagesCertificate(friendPub),
    ]);

    console.log('Certificati revocati, procedo con la rimozione dati');

    // 2. Rimuovi amicizia
    const removeFriendship = () =>
      new Promise((resolve, reject) => {
        console.log('Cerco amicizia da rimuovere...');
        gun.get(`${DAPP_NAME}/friendships`).once((friendships) => {
          if (!friendships) {
            console.log('Nessuna amicizia trovata');
            resolve(false);
            return;
          }

          let found = false;
          Object.keys(friendships).forEach((friendshipId) => {
            if (friendshipId === '_') return;

            gun
              .get(`${DAPP_NAME}/friendships`)
              .get(friendshipId)
              .once((friendship) => {
                if (!friendship) return;

                const isMatch =
                  (friendship.user1 === friendPub &&
                    friendship.user2 === user.is.pub) ||
                  (friendship.user2 === friendPub &&
                    friendship.user1 === user.is.pub);

                if (isMatch) {
                  found = true;
                  console.log('Amicizia trovata, rimuovo...');
                  gun
                    .get(`${DAPP_NAME}/friendships`)
                    .get(friendshipId)
                    .put(null, (ack) => {
                      if (ack.err) {
                        console.error('Errore rimozione amicizia:', ack.err);
                        reject(new Error(ack.err));
                      } else {
                        console.log('Amicizia rimossa con successo');
                        resolve(true);
                      }
                    });
                }
              });
          });

          // Se non trovata dopo il controllo di tutte le amicizie
          setTimeout(() => {
            if (!found) {
              console.log('Nessuna amicizia trovata dopo la ricerca');
              resolve(false);
            }
          }, 1000);
        });
      });

    // 3. Rimuovi messaggi
    const removeMessages = () =>
      new Promise((resolve) => {
        console.log('Rimuovo messaggi della chat:', chatId);
        gun
          .get(`${DAPP_NAME}/chats`)
          .get(chatId)
          .once((chat) => {
            if (!chat) {
              console.log('Nessun messaggio trovato');
              resolve(true);
              return;
            }

            // Rimuovi la chat direttamente
            gun
              .get(`${DAPP_NAME}/chats`)
              .get(chatId)
              .put(null, (ack) => {
                if (ack.err) console.warn('Errore rimozione chat:', ack.err);
                console.log('Chat rimossa');
                resolve(true);
              });
          });
      });

    // 4. Rimuovi richieste
    const removeRequests = () =>
      new Promise((resolve) => {
        console.log('Rimuovo richieste pendenti...');
        gun.get(`${DAPP_NAME}/all_friend_requests`).once((requests) => {
          if (!requests) {
            console.log('Nessuna richiesta trovata');
            resolve(true);
            return;
          }

          Object.keys(requests).forEach((requestId) => {
            if (requestId === '_') return;

            gun
              .get(`${DAPP_NAME}/all_friend_requests`)
              .get(requestId)
              .once((request) => {
                if (!request) return;

                const isMatch =
                  (request.from === friendPub && request.to === user.is.pub) ||
                  (request.to === friendPub && request.from === user.is.pub);

                if (isMatch) {
                  gun
                    .get(`${DAPP_NAME}/all_friend_requests`)
                    .get(requestId)
                    .put(null, (ack) => {
                      if (ack.err)
                        console.warn('Errore rimozione richiesta:', ack.err);
                    });
                }
              });
          });

          // Risolvi dopo aver processato tutte le richieste
          setTimeout(() => {
            console.log('Richieste rimosse');
            resolve(true);
          }, 1000);
        });
      });

    // 5. Rimuovi dati locali
    const cleanupLocal = async () => {
      console.log('Pulizia dati locali...');
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem(`chat_${chatId}`);
          localStorage.removeItem(`messages_${chatId}`);
          localStorage.removeItem(`friend_${friendPub}`);
          console.log('Dati locali rimossi');
        } catch (error) {
          console.warn('Errore pulizia dati locali:', error);
        }
      }
      return true;
    };

    // Esegui le operazioni in sequenza
    console.log('Inizio rimozione amicizia...');
    await removeFriendship();

    console.log('Inizio rimozione messaggi...');
    await removeMessages();

    console.log('Inizio rimozione richieste...');
    await removeRequests();

    console.log('Inizio pulizia dati locali...');
    await cleanupLocal();

    // Forza disconnessione dai nodi
    gun.get(`${DAPP_NAME}/friendships`).off();
    gun.get(`${DAPP_NAME}/chats/${chatId}`).off();
    gun.get(`${DAPP_NAME}/all_friend_requests`).off();

    console.log('Rimozione amico completata con successo');
    return { success: true, message: 'Amico rimosso con successo' };
  } catch (error) {
    console.error('Errore rimozione amico:', error);
    throw new Error("Errore durante la rimozione dell'amico: " + error.message);
  }
};

export default removeFriend;
