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
    // Genera ID univoco per la chat
    const chatId = [user.is.pub, friendPub].sort().join('_');

    // 1. Revoca tutti i certificati associati
    try {
      await Promise.resolve([
        revokeChatsCertificate(friendPub),
        revokeMessagesCertificate(friendPub),
      ]);
    } catch (error) {
      console.warn('Errore durante la revoca dei certificati:', error);
    }

    console.log('Revoca certificati completata');

    // 2. Rimuovi completamente l'amicizia dal nodo friendships
    await new Promise((resolve, reject) => {
      let found = false;
      gun
        .get(DAPP_NAME)
        .get('friendships')
        .map()
        .once((friendship, friendshipId) => {
          if (friendship && friendshipId) {
            const isMatch =
              (friendship.user1 === friendPub &&
                friendship.user2 === user.is.pub) ||
              (friendship.user2 === friendPub &&
                friendship.user1 === user.is.pub);

            if (isMatch) {
              found = true;
              gun
                .get(DAPP_NAME)
                .get('friendships')
                .get(friendshipId)
                .put(null, (ack) => {
                  if (ack.err) reject(new Error(ack.err));
                });
            }
          }
        });

      // Risolvi dopo un timeout anche se non trovato
      setTimeout(() => resolve(found), 1000);
    });

    // 3. Rimuovi dalla lista amici dell'utente corrente
    await new Promise((resolve, reject) => {
      let found = false;
      gun
        .user()
        .get(DAPP_NAME)
        .get('my_friends')
        .map()
        .once((data, key) => {
          if (data && data.pub === friendPub) {
            found = true;
            gun
              .user()
              .get(DAPP_NAME)
              .get('my_friends')
              .get(key)
              .put(null, (ack) => {
                if (ack.err) reject(new Error(ack.err));
              });
          }
        });

      setTimeout(() => resolve(found), 1000);
    });

    // 4. Rimuovi dalla lista amici dell'altro utente
    await new Promise((resolve) => {
      gun
        .get(`~${friendPub}`)
        .get(DAPP_NAME)
        .get('my_friends')
        .map()
        .once((data, key) => {
          if (data && data.pub === user.is.pub) {
            gun
              .get(`~${friendPub}`)
              .get(DAPP_NAME)
              .get('my_friends')
              .get(key)
              .put(null);
          }
        });
      setTimeout(resolve, 1000);
    });

    // 5. Rimuovi completamente la chat e tutti i suoi messaggi
    await new Promise((resolve) => {
      // Prima rimuovi tutti i messaggi
      gun
        .get(DAPP_NAME)
        .get('chats')
        .get(chatId)
        .get('messages')
        .map()
        .once((msg, msgKey) => {
          if (msg) {
            gun
              .get(DAPP_NAME)
              .get('chats')
              .get(chatId)
              .get('messages')
              .get(msgKey)
              .put(null);
          }
        });

      // Poi rimuovi la chat stessa
      gun.get(DAPP_NAME).get('chats').get(chatId).put(null);

      setTimeout(resolve, 1000);
    });

    // 6. Rimuovi eventuali richieste di amicizia pendenti
    await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('all_friend_requests')
        .map()
        .once((request, key) => {
          if (request && key) {
            const isMatch =
              (request.from === friendPub && request.to === user.is.pub) ||
              (request.to === friendPub && request.from === user.is.pub);

            if (isMatch) {
              gun.get(DAPP_NAME).get('all_friend_requests').get(key).put(null);
            }
          }
        });
      setTimeout(resolve, 1000);
    });

    // 7. Pulisci eventuali riferimenti nel nodo dell'utente
    await new Promise((resolve, reject) => {
      gun
        .user()
        .get(DAPP_NAME)
        .get('friends_data')
        .get(friendPub)
        .put(null, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // 8. Pulisci eventuali dati di chat memorizzati localmente
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(`chat_${chatId}`);
        localStorage.removeItem(`messages_${chatId}`);
      } catch (error) {
        console.warn('Errore durante la pulizia dei dati locali:', error);
      }
    }

    // 9. Forza un garbage collection dei nodi non più necessari
    gun.get(DAPP_NAME).get('chats').get(chatId).off();
    gun.get(`~${friendPub}`).off();

    return { success: true, message: 'Amico rimosso con successo' };
  } catch (error) {
    console.error('Error removing friend:', error);
    throw new Error("Errore durante la rimozione dell'amico: " + error.message);
  }
};

export default removeFriend;
