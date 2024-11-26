import { gun, user, DAPP_NAME } from '../../useGun.js';
import { Observable } from 'rxjs';

/**
 * Read receipts functionality for messages
 * @namespace readReceipts
 */
const readReceipts = {
  /**
   * Marks a message as visible/read for a recipient
   * @param {string} messageId - ID of the message
   * @param {string} chatId - ID of the chat
   * @param {string} recipientPub - Public key of message recipient
   * @returns {Promise<boolean>} Success status of marking message as read
   */
  observeMessageVisibility: (messageId, chatId, recipientPub) => {
    if (!user.is || !recipientPub || !chatId) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      try {
        gun.get(DAPP_NAME).get(`chats/${chatId}/receipts`).get(messageId).put({
          type: 'read',
          messageId,
          timestamp: Date.now(),
          from: user.is.pub,
          to: recipientPub,
        });
        resolve(true);
      } catch (error) {
        console.error('Error sending read receipt:', error);
        resolve(false);
      }
    });
  },

  /**
   * Observes read receipts for a message
   * @param {string} messageId - ID of message to observe
   * @param {string} chatId - ID of chat containing the message
   * @returns {Observable} Observable that emits read receipt events
   */
  observeReadReceipts: (messageId, chatId) => {
    return new Observable((subscriber) => {
      if (!user.is || !chatId) {
        subscriber.error(new Error('Missing required parameters'));
        return;
      }

      const unsub = gun
        .get(DAPP_NAME)
        .get(`chats/${chatId}/receipts`)
        .get(messageId)
        .on((receipt) => {
          if (receipt && receipt.type === 'read') {
            subscriber.next(receipt);
          }
        });

      return () => {
        if (typeof unsub === 'function') unsub();
      };
    });
  },
};

export default readReceipts;
