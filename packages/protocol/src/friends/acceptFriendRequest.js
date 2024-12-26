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
    // Salva i dati dell'utente che ha inviato la richiesta
    console.log('Salvataggio dati mittente:', request.senderInfo);
    await gun
      .get(DAPP_NAME)
      .get('userList')
      .get('users')
      .get(request.from)
      .put({
        pub: request.from,
        alias: request.senderInfo?.alias || request.alias,
        displayName: request.senderInfo?.alias || request.alias,
        lastSeen: Date.now(),
        timestamp: Date.now(),
      });

    // Salva i dati dell'utente che accetta la richiesta
    console.log('Salvataggio dati destinatario:', user.is);
    await gun.get(DAPP_NAME).get('userList').get('users').get(user.is.pub).put({
      pub: user.is.pub,
      alias: user.is.alias,
      displayName: user.is.alias,
      lastSeen: Date.now(),
      timestamp: Date.now(),
    });

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
    await gun.get(DAPP_NAME).get('chats').get(chatId).put(chatData);

    // Crea il record di amicizia con alias
    const friendshipData = {
      user1: user.is.pub,
      user2: request.from,
      created: Date.now(),
      status: 'active',
      chatId: chatId,
      user1Alias: user.is.alias,
      user2Alias: request.senderInfo?.alias || request.alias,
    };

    // Salva l'amicizia
    await gun.get(DAPP_NAME).get('friendships').set(friendshipData);

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
