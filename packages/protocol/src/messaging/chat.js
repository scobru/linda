import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  revokeChatsCertificate,
  revokeMessagesCertificate,
} from '../security/chatCertificates.js';
import { userBlocking } from '../blocking/index.js';

// Funzione per bloccare una chat
const blockChat = async (chatId) => {
  return new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get('blocked_chats')
      .get(chatId)
      .put({ blocked: true, timestamp: Date.now() }, (ack) => {
        resolve({ success: !ack.err });
      });
  });
};

// Funzione per sbloccare una chat
const unblockChat = async (chatId) => {
  return new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get('blocked_chats')
      .get(chatId)
      .put(null, (ack) => {
        resolve({ success: !ack.err });
      });
  });
};

// Funzione per ottenere le chat bloccate
const getBlockedChats = async () => {
  return new Promise((resolve) => {
    const blockedChats = [];
    gun
      .get(DAPP_NAME)
      .get('blocked_chats')
      .map()
      .once((data, id) => {
        if (data && data.blocked) {
          blockedChats.push(id);
        }
      });

    setTimeout(() => resolve(blockedChats), 500);
  });
};

// Funzione per rimuovere completamente una chat
const removeChat = async (chatId, targetPub) => {
  try {
    console.log('Rimozione chat:', { chatId, targetPub });

    // 1. Blocca la chat e l'utente
    await Promise.all([blockChat(chatId), userBlocking.blockUser(targetPub)]);

    // 2. Revoca i certificati
    await Promise.all([
      revokeChatsCertificate(targetPub),
      revokeMessagesCertificate(targetPub),
    ]);

    // 3. Rimuovi i riferimenti alla chat
    await Promise.all([
      // Rimuovi dalla lista delle chat
      new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('chats')
          .get(chatId)
          .put(
            {
              status: 'removed',
              removedAt: Date.now(),
              removedBy: user.is.pub,
            },
            (ack) => {
              resolve(!ack.err);
            }
          );
      }),
      // Rimuovi dai riferimenti dell'utente
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('my_chats')
          .get(chatId)
          .put(null, (ack) => {
            resolve(!ack.err);
          });
      }),
    ]);

    return { success: true };
  } catch (error) {
    console.error('Errore rimozione chat:', error);
    return { success: false, error: error.message };
  }
};

export const chat = {
  // ... altre funzioni esistenti ...
  blockChat,
  unblockChat,
  getBlockedChats,
  removeChat,
};
