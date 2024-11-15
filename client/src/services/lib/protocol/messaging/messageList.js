import { Observable } from 'rxjs';
import { gun, user } from '../../../state';
import SEA from 'gun/sea';
import { LRUCache } from 'lru-cache';

const messageList = (roomId) => {
  return new Observable((subscriber) => {
    if (!roomId) {
      subscriber.error(new Error('Room ID is required'));
      return;
    }

    const messages = new Map();
    let isFirstLoad = true;
    const processedMessages = new Set();

    const messageCache = new LRUCache({
      max: 500,
      maxAge: 1000 * 60 * 60 // 1 ora
    });

    // Funzione per decrittare un messaggio
    const decryptMessage = async (message) => {
      if (!message.content) return message;
      if (processedMessages.has(message.id)) return messages.get(message.id);

      try {
        const senderPub = message.sender === user.is.pub ? message.recipient : message.sender;
        const senderEpub = await new Promise((resolve) => {
          gun.user(senderPub).once((data) => resolve(data.epub));
        });

        const secret = await SEA.secret(senderEpub, user.pair());
        
        // Decrittazione contenuto principale
        const decryptedContent = await SEA.decrypt(message.content, secret);
        
        // Decrittazione anteprima se presente e necessaria
        let decryptedPreview = null;
        if (message.preview && message.version === '2.0') {
          decryptedPreview = await SEA.decrypt(message.preview, secret);
        }

        const decryptedMessage = {
          ...message,
          content: decryptedContent || message.content,
          preview: decryptedPreview
        };

        processedMessages.add(message.id);
        return decryptedMessage;
      } catch (error) {
        console.error('Decryption error:', error);
        return message;
      }
    };

    const processMessage = async (message) => {
      if (!message.content) return message;
      
      const cacheKey = `${message.id}_${message.timestamp}`;
      if (messageCache.has(cacheKey)) {
        return messageCache.get(cacheKey);
      }

      try {
        const decryptedMessage = await decryptMessage(message);
        messageCache.set(cacheKey, decryptedMessage);
        return decryptedMessage;
      } catch (error) {
        console.error('Message processing error:', error);
        return message;
      }
    };

    // Monitora i messaggi della chat
    const unsubMessages = gun.get('chats')
      .get(roomId)
      .get('messages')
      .map()
      .on(async (message, messageId) => {
        if (!message) {
          messages.delete(messageId);
          processedMessages.delete(messageId);
          return;
        }

        // Evita elaborazioni duplicate dello stesso messaggio
        if (messages.has(messageId) && processedMessages.has(messageId)) {
          return;
        }

        try {
          const decryptedMessage = await processMessage({
            ...message,
            id: messageId
          });
          
          messages.set(messageId, decryptedMessage);

          // Ordina i messaggi per timestamp e rimuovi duplicati
          const sortedMessages = Array.from(messages.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .filter((msg, index, self) => 
              index === self.findIndex(m => m.id === msg.id)
            );

          if (isFirstLoad) {
            subscriber.next({ initial: sortedMessages });
            isFirstLoad = false;
          } else {
            const lastMessage = sortedMessages[sortedMessages.length - 1];
            if (lastMessage && lastMessage.id === messageId) {
              subscriber.next({ individual: lastMessage });
            }
          }
        } catch (error) {
          console.warn('Error processing message:', error);
        }
      });

    // Cleanup
    return () => {
      if (typeof unsubMessages === 'function') {
        try {
          unsubMessages();
        } catch (error) {
          console.warn('Error during cleanup:', error);
        }
      }
      messages.clear();
      processedMessages.clear();
    };
  });
};

export default messageList;
