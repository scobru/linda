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
  if (!user.is) throw new Error('Utente non autenticato');

  try {
    // Genera ID univoco per la chat
    const chatId = [user.is.pub, friendPub].sort().join('_');

    // 1. Revoca tutti i certificati associati
    try {
      await revokeChatsCertificate(friendPub);
      await revokeMessagesCertificate(friendPub);
    } catch (error) {
      console.warn('Errore durante la revoca dei certificati:', error);
    }

    // 2. Rimuovi completamente l'amicizia dal nodo friendships
    await new Promise((resolve) => {
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
              gun.get(DAPP_NAME).get('friendships').get(friendshipId).put(null);
            }
          }
        });
      setTimeout(resolve, 500);
    });

    // 3. Rimuovi dalla lista amici dell'utente corrente
    await new Promise((resolve) => {
      gun
        .user()
        .get(DAPP_NAME)
        .get('my_friends')
        .map()
        .once((data, key) => {
          if (data && data.pub === friendPub) {
            gun.user().get(DAPP_NAME).get('my_friends').get(key).put(null);
          }
        });
      setTimeout(resolve, 500);
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
      setTimeout(resolve, 500);
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

      setTimeout(resolve, 500);
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
      setTimeout(resolve, 500);
    });

    // 7. Pulisci eventuali riferimenti nel nodo dell'utente
    await gun
      .user()
      .get(DAPP_NAME)
      .get('friends_data')
      .get(friendPub)
      .put(null);

    // 8. Pulisci eventuali dati di chat memorizzati localmente
    if (typeof window !== 'undefined') {
      try {
        // Rimuovi dati dalla localStorage se presenti
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
    throw error;
  }
};

export default removeFriend;
