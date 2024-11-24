import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createChatsCertificate,
  createMessagesCertificate,
} from '../security/index.js';

/**
 * Creates a new chat room between two users
 *
 * This function:
 * 1. Validates user authentication
 * 2. Generates required security certificates
 * 3. Checks for existing chat room
 * 4. Creates new chat room if none exists
 * 5. Sets up chat references for both users
 *
 * @async
 * @param {string} recipientPub - Public key of chat recipient
 * @param {Function} callback - Optional callback function
 * @returns {Promise<void>} Resolves with chat details via callback
 * @throws {Error} If user not authenticated or chat creation fails
 */
const createChat = async (recipientPub, callback = () => {}) => {
  console.log('Starting createChat', recipientPub);

  if (!user.is) {
    throw new Error('User not authenticated');
  }

  try {
    const chatId = [user.is.pub, recipientPub].sort().join('_');

    // Verifica certificati in modo robusto
    const certificatesResult = await Promise.allSettled([
      createChatsCertificate(recipientPub),
      createMessagesCertificate(recipientPub),
    ]);

    const failedCertificates = certificatesResult.filter(
      (result) => result.status === 'rejected'
    );
    if (failedCertificates.length > 0) {
      throw new Error('Impossibile creare i certificati necessari');
    }

    // Verifica se la chat esiste già
    const existingChat = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('chats')
        .get(chatId)
        .once((chat) => resolve(chat));
    });

    console.log('Existing chat', existingChat);

    if (existingChat) {
      return callback({
        success: true,
        chat: {
          roomId: chatId,
          user1: user.is.pub,
          user2: recipientPub,
          created: existingChat.created,
        },
      });
    }

    // Crea una nuova chat
    const chatData = {
      user1: user.is.pub,
      user2: recipientPub,
      created: Date.now(),
      status: 'active',
      messages: {},
    };

    // Salva i dati della chat
    await gun.get(DAPP_NAME).get('chats').get(chatId).put(chatData);

    // Aggiungi riferimenti per entrambi gli utenti
    await Promise.all([
      gun.user().get(DAPP_NAME).get('my_chats').set({
        chatId,
        with: recipientPub,
        created: Date.now(),
      }),
      gun.get(`~${recipientPub}`).get(DAPP_NAME).get('my_chats').set({
        chatId,
        with: user.is.pub,
        created: Date.now(),
      }),
    ]);

    return callback({
      success: true,
      chat: {
        roomId: chatId,
        user1: user.is.pub,
        user2: recipientPub,
        created: Date.now(),
      },
    });
  } catch (error) {
    console.error('Error creating chat:', error);
    return callback({
      success: false,
      errMessage: error.message || 'Error creating chat',
    });
  }
};

export default createChat;
