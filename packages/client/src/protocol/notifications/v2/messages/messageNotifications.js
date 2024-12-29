/**
 * @module Linda/Messenger/Notifications/V2/Messages
 * @description Message notifications service
 */

import BaseNotificationService from '../base/notificationService.js';
import { gun, user, DAPP_NAME } from '../../../useGun.js';
import { Observable } from 'rxjs';

class MessageNotificationService extends BaseNotificationService {
  constructor() {
    super('messages');
    this.messageTracking = new Map();
    this.processedMessages = new Set();
  }

  /**
   * Initialize message tracking for a conversation
   * @param {string} conversationId - Conversation ID
   */
  initMessageTracking(conversationId) {
    if (!this.messageTracking.has(conversationId)) {
      this.messageTracking.set(conversationId, new Set());
    }
  }

  /**
   * Initialize tracking for a new message
   * @param {string} messageId - Message ID
   * @param {string} chatId - Chat ID
   */
  async initMessageTrackingLegacy(messageId, chatId) {
    if (!user.is) throw new Error('User not authenticated');

    await gun.get(DAPP_NAME).get('message_tracking').get(messageId).put({
      id: messageId,
      chatId,
      sender: user.is.pub,
      timestamp: Date.now(),
      status: 'sent',
    });
  }

  /**
   * Track a new message
   * @param {string} userId - User ID
   * @param {string} conversationId - Conversation ID
   * @param {Object} message - Message object
   */
  async trackMessage(userId, conversationId, message) {
    this.initMessageTracking(conversationId);
    const tracking = this.messageTracking.get(conversationId);

    if (!tracking.has(message.id)) {
      tracking.add(message.id);
      const ref = this.getNotificationsRef()
        .get(userId)
        .get(this.type)
        .get(message.id);

      await ref.put({
        type: 'message',
        conversationId,
        messageId: message.id,
        sender: message.sender,
        content: message.content,
        timestamp: message.timestamp,
        status: message.status || 'sent',
        read: false,
      });

      // Manteniamo anche il tracking legacy per retrocompatibilità
      await this.initMessageTrackingLegacy(message.id, conversationId);
    }
  }

  /**
   * Observe message status
   * @param {string} messageId - Message ID
   * @returns {Observable} Observable of message status
   */
  observeMessageStatus(messageId) {
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
  }

  /**
   * Update message status
   * @param {string} messageId - Message ID
   * @param {string} status - New status
   */
  async updateMessageStatus(messageId, status) {
    if (!user.is) throw new Error('User not authenticated');

    // Aggiorna sia il nuovo che il vecchio sistema
    const ref = this.getNotificationsRef()
      .get(user.is.pub)
      .get(this.type)
      .get(messageId);

    await ref.put({ status });
    await gun.get(DAPP_NAME).get('message_tracking').get(messageId).put({
      status,
      updatedAt: Date.now(),
    });
  }

  /**
   * Observe new messages
   * @returns {Observable} Observable of new messages
   */
  observeNewMessages() {
    return new Observable((subscriber) => {
      if (!user.is) {
        subscriber.error(new Error('User not authenticated'));
        return;
      }

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
          if (this.processedMessages.has(message.id)) return;

          this.processedMessages.add(message.id);
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
        this.processedMessages.clear();
      };
    });
  }

  /**
   * Mark all messages in a conversation as read
   * @param {string} userId - User ID
   * @param {string} conversationId - Conversation ID
   */
  async markConversationAsRead(userId, conversationId) {
    const notifications = await this.getAll(userId);
    const conversationNotifications = notifications.filter(
      (n) => n.conversationId === conversationId && !n.read
    );

    await Promise.all(
      conversationNotifications.map((n) => this.markAsRead(userId, n.id))
    );
  }

  /**
   * Get unread message count for a conversation
   * @param {string} userId - User ID
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<number>} Unread message count
   */
  async getUnreadCount(userId, conversationId) {
    const notifications = await this.getAll(userId);
    return notifications.filter(
      (n) => n.conversationId === conversationId && !n.read
    ).length;
  }

  /**
   * Observe read receipts for a chat
   * @param {string} chatId - Chat ID
   * @returns {Observable} Observable of read receipts
   */
  observeReadReceipts(chatId) {
    return new Observable((subscriber) => {
      if (!chatId) {
        subscriber.error(new Error('Invalid chatId'));
        return;
      }

      const chatRef = gun.get(`${DAPP_NAME}/chats`).get(chatId);
      const handler = chatRef
        .get('readReceipts')
        .map()
        .on((receipt, id) => {
          if (!receipt) return;

          subscriber.next({
            messageId: id,
            userId: receipt.userId,
            timestamp: receipt.timestamp,
            status: receipt.status,
          });
        });

      return () => {
        if (typeof handler === 'function') handler();
      };
    });
  }
}

export default new MessageNotificationService();
