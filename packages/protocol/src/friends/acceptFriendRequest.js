import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createMessagesCertificate,
  createChatsCertificate,
} from '../security/index.js';

const acceptFriendRequest = async (request) => {
  if (!user?.is) {
    throw new Error('Utente non autenticato');
  }

  try {
    // Crea i certificati necessari
    await Promise.all([
      createMessagesCertificate(request.from),
      createChatsCertificate(request.from),
    ]);

    // Genera un ID univoco per la chat
    const chatId = [user.is.pub, request.from].sort().join('_');

    // Crea la chat
    const chatData = {
      id: chatId,
      created: Date.now(),
      status: 'active',
      user1: user.is.pub,
      user2: request.from,
      type: 'private',
    };

    // Salva la chat
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('chats')
        .get(chatId)
        .put(chatData, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // Crea il record di amicizia
    const friendshipData = {
      user1: user.is.pub,
      user2: request.from,
      created: Date.now(),
      status: 'active',
      chatId: chatId,
    };

    // Salva l'amicizia
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('friendships')
        .set(friendshipData, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // Rimuovi tutte le richieste correlate
    gun
      .get(DAPP_NAME)
      .get('all_friend_requests')
      .map()
      .once((data, key) => {
        if (
          data &&
          ((data.from === request.from && data.to === user.is.pub) ||
            (data.from === user.is.pub && data.to === request.from))
        ) {
          gun.get(DAPP_NAME).get('all_friend_requests').get(key).put(null);
        }
      });

    // Rimuovi le richieste private
    gun
      .get(DAPP_NAME)
      .get('friend_requests')
      .get(user.is.pub)
      .map()
      .once((data, key) => {
        if (data && data.from === request.from) {
          gun
            .get(DAPP_NAME)
            .get('friend_requests')
            .get(user.is.pub)
            .get(key)
            .put(null);
        }
      });

    return {
      success: true,
      message: 'Richiesta accettata con successo',
      chatId: chatId,
    };
  } catch (error) {
    console.error('Error accepting friend request:', error);
    throw error;
  }
};

export default acceptFriendRequest;
