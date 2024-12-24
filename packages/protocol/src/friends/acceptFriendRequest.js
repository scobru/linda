import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createMessagesCertificate,
  createChatsCertificate,
} from '../security/index.js';

const acceptFriendRequest = async (request) => {
  if (!user?.is) {
    throw new Error('Utente non autenticato');
  }

  console.log('Accepting friend request:', request);

  try {
    // Crea i certificati necessari

    const messagesCertificate = await createMessagesCertificate(request.from);
    const chatsCertificate = await createChatsCertificate(request.from);

    console.log('Messages certificate:', messagesCertificate);
    console.log('Chats certificate:', chatsCertificate);

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
    await gun
      .get(DAPP_NAME)
      .get('chats')
      .get(chatId)
      .put(chatData, (ack) => {
        return ack;
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
    await gun
      .get(DAPP_NAME)
      .get('friendships')
      .set(friendshipData, (ack) => {
        return ack;
      });

    // Rimuovi tutte le richieste correlate
    await gun
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
    await gun
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
