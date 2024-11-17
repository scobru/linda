/**
 * @module messageList
 * @description Module for handling message lists and real-time message updates
 */

import { Observable } from 'rxjs';
import { gun, user, DAPP_NAME } from '../useGun.js';
import SEA from 'gun/sea.js';
import { LRUCache } from 'lru-cache';

/**
 * Creates an Observable that monitors and processes messages for a given room
 * @param {string} roomId - The ID of the chat room to monitor
 * @returns {Observable} An Observable that emits message updates
 * @throws {Error} If roomId is not provided
 */
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
      maxAge: 1000 * 60 * 60, // 1 hour
    });

    /**
     * Decrypts a message using SEA encryption
     * @param {Object} message - The message to decrypt
     * @returns {Promise<Object>} The decrypted message
     */
    const decryptMessage = async (message) => {
      if (!message.content) return message;
      if (processedMessages.has(message.id)) return messages.get(message.id);

      try {
        const senderPub =
          message.sender === user.is.pub ? message.recipient : message.sender;
        const senderEpub = await new Promise((resolve) => {
          gun.user(senderPub).once((data) => resolve(data.epub));
        });

        const secret = await SEA.secret(senderEpub, user.pair());

        // Decrypt main content
        const decryptedContent = await SEA.decrypt(message.content, secret);

        // Decrypt preview if present and needed
        let decryptedPreview = null;
        if (message.preview && message.version === '2.0') {
          decryptedPreview = await SEA.decrypt(message.preview, secret);
        }

        const decryptedMessage = {
          ...message,
          content: decryptedContent || message.content,
          preview: decryptedPreview,
        };

        processedMessages.add(message.id);
        return decryptedMessage;
      } catch (error) {
        console.error('Decryption error:', error);
        return message;
      }
    };

    /**
     * Processes a message, handling caching and decryption
     * @param {Object} message - The message to process
     * @returns {Promise<Object>} The processed message
     */
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

    // Monitor chat messages
    const unsubMessages = gun
      .get(DAPP_NAME)
      .get('chats')
      .get(roomId)
      .get('messages')
      .map()
      .on(async (message, messageId) => {
        if (!message) {
          messages.delete(messageId);
          processedMessages.delete(messageId);
          return;
        }

        // Avoid duplicate processing of the same message
        if (messages.has(messageId) && processedMessages.has(messageId)) {
          return;
        }

        try {
          const decryptedMessage = await processMessage({
            ...message,
            id: messageId,
          });

          messages.set(messageId, decryptedMessage);

          // Sort messages by timestamp and remove duplicates
          const sortedMessages = Array.from(messages.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .filter(
              (msg, index, self) =>
                index === self.findIndex((m) => m.id === msg.id)
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
