import { gun, user } from '../../../state';
import { Observable } from 'rxjs';

const readReceipts = {
  // Osserva i messaggi visibili
  observeMessageVisibility: (messageId, chatId, recipientPub) => {
    if (!user.is || !recipientPub || !chatId) {
      return Promise.resolve(false);
    }
    
    return new Promise((resolve) => {
      try {
        gun.get(`chats/${chatId}/receipts`)
          .get(messageId)
          .put({
            type: 'read',
            messageId,
            timestamp: Date.now(),
            from: user.is.pub,
            to: recipientPub
          });
        resolve(true);
      } catch (error) {
        console.error('Error sending read receipt:', error);
        resolve(false);
      }
    });
  },

  // Osserva le ricevute di lettura
  observeReadReceipts: (messageId, chatId) => {
    return new Observable(subscriber => {
      if (!user.is || !chatId) {
        subscriber.error(new Error('Missing required parameters'));
        return;
      }

      const unsub = gun.get(`chats/${chatId}/receipts`)
        .get(messageId)
        .on(receipt => {
          if (receipt && receipt.type === 'read') {
            subscriber.next(receipt);
          }
        });

      return () => {
        if (typeof unsub === 'function') unsub();
      };
    });
  }
};

export default readReceipts; 