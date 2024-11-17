import { gun, user, DAPP_NAME } from '../useGun.js';
import { Observable } from 'rxjs';

/**
 * Message notification and tracking functionality
 * @namespace messageNotifications
 */
const messageNotifications = {
  /**
   * Initializes tracking for a new message
   * @async
   * @param {string} messageId - Unique identifier of the message
   * @param {string} chatId - ID of the chat the message belongs to
   * @throws {Error} If user is not authenticated
   * @returns {Promise<void>}
   */
  initMessageTracking: async (messageId, chatId) => {
    if (!user.is) throw new Error('User not authenticated');

    await gun.get(DAPP_NAME).get('message_tracking').get(messageId).put({
      id: messageId,
      chatId,
      sender: user.is.pub,
      timestamp: Date.now(),
      status: 'sent',
    });
  },

  /**
   * Observes status changes for a message
   * @param {string} messageId - ID of message to observe
   * @returns {Observable} Observable that emits message status updates
   */
  observeMessageStatus: (messageId) => {
    return new Observable((subscriber) => {
      const unsub = gun
        .get(DAPP_NAME)
        .get('message_tracking')
        .get(messageId)
        .on((tracking) => {
          if (tracking) {
            subscriber.next({
              id: messageId,
              status: tracking.status,
              timestamp: tracking.timestamp,
            });
          }
        });

      return () => {
        if (typeof unsub === 'function') unsub();
      };
    });
  },

  /**
   * Updates the status of a message
   * @async
   * @param {string} messageId - ID of the message to update
   * @param {string} status - New status to set
   * @throws {Error} If user is not authenticated
   * @returns {Promise<void>}
   */
  updateMessageStatus: async (messageId, status) => {
    if (!user.is) throw new Error('User not authenticated');

    await gun.get(DAPP_NAME).get('message_tracking').get(messageId).put({
      status,
      updatedAt: Date.now(),
    });
  },

  /**
   * Observes new incoming messages for notifications
   * @returns {Observable} Observable that emits new message notifications
   */
  observeNewMessages: () => {
    return new Observable((subscriber) => {
      if (!user.is) {
        subscriber.error(new Error('User not authenticated'));
        return;
      }

      const processedMessages = new Set();

      const unsub = gun
        .get(DAPP_NAME)
        .get('chats')
        .map()
        .get('messages')
        .map()
        .on((message) => {
          if (
            !message ||
            !message.recipient ||
            message.recipient !== user.is.pub
          )
            return;
          if (processedMessages.has(message.id)) return;

          processedMessages.add(message.id);
          subscriber.next({
            id: message.id,
            sender: message.sender,
            senderAlias: message.senderAlias,
            timestamp: message.timestamp,
            preview: message.preview,
          });
        });

      return () => {
        if (typeof unsub === 'function') unsub();
        processedMessages.clear();
      };
    });
  },

  /**
   * Osserva le ricevute di lettura per una chat specifica
   * @param {string} chatId - ID della chat
   * @returns {Observable} Observable che emette gli aggiornamenti delle ricevute di lettura
   */
  observeReadReceipts: (chatId) => {
    return new Observable((subscriber) => {
      if (!chatId) {
        subscriber.error(new Error('ChatId non valido'));
        return;
      }

      // Riferimento alla chat
      const chatRef = gun.get(`${DAPP_NAME}/chats`).get(chatId);

      // Osserva le ricevute di lettura
      const readReceiptsHandler = chatRef.get('readReceipts').map().on((receipt, id) => {
        if (!receipt) return;
        
        subscriber.next({
          messageId: id,
          userId: receipt.userId,
          timestamp: receipt.timestamp,
          status: receipt.status
        });
      });

      // Cleanup function
      return () => {
        chatRef.get('readReceipts').map().off(readReceiptsHandler);
      };
    });
  },

  /**
   * Marca un messaggio come letto
   * @param {string} chatId - ID della chat
   * @param {string} messageId - ID del messaggio
   * @param {string} userId - ID dell'utente che ha letto il messaggio
   */
  markAsRead: async (chatId, messageId, userId) => {
    if (!chatId || !messageId || !userId) {
      throw new Error('Parametri mancanti');
    }

    try {
      await gun
        .get(`${DAPP_NAME}/chats`)
        .get(chatId)
        .get('readReceipts')
        .get(messageId)
        .put({
          userId,
          timestamp: Date.now(),
          status: 'read'
        });

      return true;
    } catch (error) {
      console.error('Errore nel marcare il messaggio come letto:', error);
      return false;
    }
  },

  /**
   * Ottiene lo stato di lettura di un messaggio
   * @param {string} chatId - ID della chat
   * @param {string} messageId - ID del messaggio
   */
  getReadStatus: (chatId, messageId) => {
    return new Promise((resolve) => {
      gun
        .get(`${DAPP_NAME}/chats`)
        .get(chatId)
        .get('readReceipts')
        .get(messageId)
        .once((receipt) => {
          resolve(receipt || { status: 'sent' });
        });
    });
  }
};

export default messageNotifications;
