/**
 * @module messageList
 * @description Module for handling message lists and real-time message updates
 */

import { gun, user, DAPP_NAME } from '../useGun.js';
import SEA from 'gun/sea.js';
import { LRUCache } from 'lru-cache';
import { blocking } from '../index.js';

const { userBlocking } = blocking;

// Configurazione del limite messaggi
const messageConfig = {
  enabled: true, // Se false, non ci sarà limite
  defaultLimit: 100, // Limite predefinito
  limits: {
    // Limiti personalizzati per tipo di chat
    chats: 100, // Chat private
    groups: 200, // Gruppi
    channels: 500, // Canali
  },
};

const getMessageLimit = (path) => {
  if (!messageConfig.enabled) return Infinity;
  return messageConfig.limits[path] || messageConfig.defaultLimit;
};

const messageCache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 5, // 5 minuti
});

export const messageList = {
  decryptMessage: async (message, recipientPub) => {
    if (!message?.content || !recipientPub) {
      console.warn('Messaggio o recipientPub mancante:', {
        message,
        recipientPub,
      });
      return message;
    }

    try {
      if (!message.content.startsWith('SEA{')) {
        return message;
      }

      const isSender = message.sender === user.is.pub;
      const otherPub = recipientPub;

      console.log('Decrittazione:', {
        isSender,
        ourPub: user.is.pub,
        otherPub,
        messageFrom: message.sender,
        messageTo: message.recipient,
      });

      const otherEpub = await new Promise((resolve) => {
        gun.user(otherPub).once((data) => {
          console.log('Epub trovato:', data?.epub);
          resolve(data?.epub);
        });
      });

      if (!otherEpub) {
        console.warn('Epub non trovato per:', otherPub);
        return {
          ...message,
          content: '[Chiave di decrittazione non trovata]',
        };
      }

      const secret = await SEA.secret(otherEpub, user.pair());
      console.log('Secret generato:', !!secret);

      if (!secret) {
        console.warn('Impossibile generare il segreto condiviso');
        return {
          ...message,
          content: '[Errore nella generazione della chiave]',
        };
      }

      const decryptedContent = await SEA.decrypt(message.content, secret);
      console.log('Contenuto decrittato:', decryptedContent);

      if (!decryptedContent) {
        console.warn('Decrittazione fallita per il messaggio:', message.id);
        return {
          ...message,
          content: '[Messaggio non decifrabile]',
        };
      }

      return {
        ...message,
        content: decryptedContent,
      };
    } catch (error) {
      console.error('Errore durante la decrittazione:', error);
      return {
        ...message,
        content: '[Errore di decrittazione]',
      };
    }
  },

  loadMessages: async (path, id, limit = null, lastTimestamp = Date.now()) => {
    const effectiveLimit = limit || getMessageLimit(path);

    return new Promise((resolve) => {
      const messages = [];
      let loaded = false;

      const messageHandler = gun
        .get(DAPP_NAME)
        .get(path)
        .get(id)
        .get('messages')
        .map()
        .once(async (msg, msgId) => {
          if (msg && msg.content && msg.timestamp < lastTimestamp) {
            const cacheKey = `${msgId}_${msg.timestamp}`;

            if (messageCache.has(cacheKey)) {
              messages.push(messageCache.get(cacheKey));
            } else {
              messages.push({ ...msg, id: msgId });
            }
          }
          loaded = true;
        });

      const checkLoaded = () => {
        if (loaded || messages.length > 0) {
          const sortedMessages = messages.sort(
            (a, b) => b.timestamp - a.timestamp
          );

          // Applica il limite solo se è abilitato
          const finalMessages = messageConfig.enabled
            ? sortedMessages.slice(0, effectiveLimit)
            : sortedMessages;

          // Pulisci i messaggi vecchi solo se il limite è abilitato
          if (messageConfig.enabled && messages.length > effectiveLimit) {
            const messagesToDelete = messages
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(effectiveLimit);

            messagesToDelete.forEach((msg) => {
              gun
                .get(DAPP_NAME)
                .get(path)
                .get(id)
                .get('messages')
                .get(msg.id)
                .put(null);
            });
          }

          if (messageHandler && typeof messageHandler === 'function') {
            messageHandler();
          }

          resolve(finalMessages);
        } else {
          setTimeout(checkLoaded, 100);
        }
      };

      setTimeout(checkLoaded, 100);
    });
  },

  subscribeToMessages: async (path, id, callback) => {
    const processedMessages = new Set();
    let initialLoadComplete = false;
    let messageCount = 0;
    const effectiveLimit = getMessageLimit(path);

    // Verifica se è una chat privata
    const isPrivateChat = path === 'chats';
    let otherUserPub = null;

    if (isPrivateChat) {
      const [user1, user2] = id.split('_');
      otherUserPub = user1 === user?.is?.pub ? user2 : user1;

      const blockStatus = await userBlocking.getBlockStatus(otherUserPub);
      if (blockStatus.blocked || blockStatus.blockedBy) {
        return () => {};
      }
    }

    // Funzione per eliminare i messaggi più vecchi
    const cleanOldMessages = async () => {
      // Pulisci solo se il limite è abilitato
      if (!messageConfig.enabled) return;

      const allMessages = await messageList.loadMessages(path, id, 1000);
      if (allMessages.length > effectiveLimit) {
        const messagesToDelete = allMessages
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(effectiveLimit);

        messagesToDelete.forEach((msg) => {
          gun
            .get(DAPP_NAME)
            .get(path)
            .get(id)
            .get('messages')
            .get(msg.id)
            .put(null);
        });
      }
    };

    return gun
      .get(DAPP_NAME)
      .get(path)
      .get(id)
      .get('messages')
      .map()
      .on((msg, msgId) => {
        if (!msg || !msg.content) return;

        const messageKey = `${msgId}_${msg.timestamp}`;
        if (processedMessages.has(messageKey)) return;

        // Verifica e pulisci i messaggi vecchi periodicamente
        messageCount++;
        if (messageCount > effectiveLimit) {
          cleanOldMessages();
          messageCount = effectiveLimit;
        }

        if (isPrivateChat && msg.sender === otherUserPub) {
          userBlocking.getBlockStatus(otherUserPub).then((blockStatus) => {
            if (!blockStatus.blocked && !blockStatus.blockedBy) {
              processMessage(msg, msgId, messageKey);
            }
          });
        } else {
          processMessage(msg, msgId, messageKey);
        }
      });

    function processMessage(msg, msgId, messageKey) {
      if (!initialLoadComplete) {
        setTimeout(() => {
          initialLoadComplete = true;
          processedMessages.add(messageKey);
          callback({ ...msg, id: msgId });
        }, 500);
      } else {
        processedMessages.add(messageKey);
        callback({ ...msg, id: msgId });
      }
    }
  },

  // Gestione ricevute
  subscribeToReceipts: (roomId, messageId, callback) => {
    const receiptHandler = gun
      .get(DAPP_NAME)
      .get(`chats/${roomId}/receipts`)
      .get(messageId)
      .on((receipt) => {
        if (!receipt) return;
        callback(receipt);
      });

    return receiptHandler;
  },

  // Elimina messaggio
  deleteMessage: async (path, id, messageId) => {
    return new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get(path)
        .get(id)
        .get('messages')
        .get(messageId)
        .put(null, (ack) => {
          if (ack.err) {
            reject(new Error(ack.err));
          } else {
            resolve();
          }
        });
    });
  },

  // Aggiungi questa nuova funzione per la crittografia
  encryptMessage: async (content, recipientPub) => {
    try {
      console.log('Crittografia per:', recipientPub);

      // Ottieni l'epub del destinatario
      const recipientEpub = await new Promise((resolve) => {
        gun.user(recipientPub).once((data) => {
          console.log('Epub trovato per crittografia:', data?.epub);
          resolve(data?.epub);
        });
      });

      if (!recipientEpub) {
        throw new Error('Epub del destinatario non trovato');
      }

      // Usa la stessa logica di crittografia
      const secret = await SEA.secret(recipientEpub, user.pair());
      console.log('Secret generato per crittografia:', !!secret);

      if (!secret) {
        throw new Error('Impossibile generare il segreto condiviso');
      }

      const encryptedContent = await SEA.encrypt(content, secret);
      console.log('Contenuto crittato:', !!encryptedContent);

      if (!encryptedContent) {
        throw new Error('Errore durante la crittografia');
      }

      return encryptedContent;
    } catch (error) {
      console.error('Errore durante la crittografia:', error);
      throw error;
    }
  },

  deleteAllMessages: async (path, id) => {
    return new Promise((resolve, reject) => {
      try {
        // Prima ottieni tutti i messaggi
        gun
          .get(DAPP_NAME)
          .get(path)
          .get(id)
          .get('messages')
          .map()
          .once((msg, msgId) => {
            if (msg) {
              // Cancella ogni messaggio
              gun
                .get(DAPP_NAME)
                .get(path)
                .get(id)
                .get('messages')
                .get(msgId)
                .put(null);
            }
          });

        // Pulisci anche il nodo dei messaggi
        gun.get(DAPP_NAME).get(path).get(id).get('messages').put(null);

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * Cancella tutti i messaggi di una chat
   * @param {string} chatId - ID della chat
   * @returns {Promise<boolean>} True se l'operazione è riuscita
   */
  clearChatMessages: async (chatId) => {
    try {
      console.log('Cancellazione messaggi della chat:', chatId);

      // Ottieni tutti i messaggi della chat
      const messages = await new Promise((resolve) => {
        const msgs = [];
        gun
          .get(DAPP_NAME)
          .get('chats')
          .get(chatId)
          .get('messages')
          .map()
          .once((msg, id) => {
            if (msg) {
              msgs.push({ ...msg, id });
            }
          });

        setTimeout(() => resolve(msgs), 500);
      });

      console.log('Messaggi da cancellare:', messages.length);

      // Cancella ogni messaggio
      await Promise.all(
        messages.map(
          (msg) =>
            new Promise((resolve) => {
              gun
                .get(DAPP_NAME)
                .get('chats')
                .get(chatId)
                .get('messages')
                .get(msg.id)
                .put(null, (ack) => resolve(!ack.err));
            })
        )
      );

      // Cancella lastMessage
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('chats')
          .get(chatId)
          .get('lastMessage')
          .put(null, (ack) => resolve(!ack.err));
      });

      return true;
    } catch (error) {
      console.error('Errore cancellazione messaggi:', error);
      return false;
    }
  },
};

export default messageList;
