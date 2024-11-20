/**
 * @module messageList
 * @description Module for handling message lists and real-time message updates
 */

import { gun, user, DAPP_NAME } from '../useGun.js';
import SEA from 'gun/sea.js';
import { LRUCache } from 'lru-cache';

const messageCache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 5 // 5 minuti
});

const messageList = {
  decryptMessage: async (message, recipientPub) => {
    if (!message?.content || !recipientPub) {
      console.warn('Messaggio o recipientPub mancante:', { message, recipientPub });
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
        messageTo: message.recipient
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
          content: '[Chiave di decrittazione non trovata]'
        };
      }

      const secret = await SEA.secret(otherEpub, user.pair());
      console.log('Secret generato:', !!secret);

      if (!secret) {
        console.warn('Impossibile generare il segreto condiviso');
        return {
          ...message,
          content: '[Errore nella generazione della chiave]'
        };
      }

      const decryptedContent = await SEA.decrypt(message.content, secret);
      console.log('Contenuto decrittato:', decryptedContent);

      if (!decryptedContent) {
        console.warn('Decrittazione fallita per il messaggio:', message.id);
        return {
          ...message,
          content: '[Messaggio non decifrabile]'
        };
      }

      return {
        ...message,
        content: decryptedContent
      };

    } catch (error) {
      console.error('Errore durante la decrittazione:', error);
      return {
        ...message,
        content: '[Errore di decrittazione]'
      };
    }
  },

  loadMessages: async (path, id) => {
    return new Promise((resolve) => {
      const messages = [];
      gun.get(DAPP_NAME)
        .get(path)
        .get(id)
        .get('messages')
        .map()
        .once(async (msg, msgId) => {
          if (msg && msg.content) {
            const cacheKey = `${msgId}_${msg.timestamp}`;
            
            if (messageCache.has(cacheKey)) {
              messages.push(messageCache.get(cacheKey));
            } else {
              messages.push({ ...msg, id: msgId });
            }
          }
        });
      
      setTimeout(() => resolve(messages.sort((a, b) => a.timestamp - b.timestamp)), 500);
    });
  },

  subscribeToMessages: (path, id, callback) => {
    const processedMessages = new Set();
    
    return gun.get(DAPP_NAME)
      .get(path)
      .get(id)
      .get('messages')
      .map()
      .on((msg, msgId) => {
        if (!msg || !msg.content) return;
        
        const messageKey = `${msgId}_${msg.timestamp}`;
        if (processedMessages.has(messageKey)) return;
        processedMessages.add(messageKey);
        
        callback({ ...msg, id: msgId });
      });
  },

  // Gestione ricevute
  subscribeToReceipts: (roomId, messageId, callback) => {
    const receiptHandler = gun.get(DAPP_NAME)
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
      gun.get(DAPP_NAME)
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
        gun.user(recipientPub).once(data => {
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
  }
};

export default messageList;
