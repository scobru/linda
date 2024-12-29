/**
 * @module Linda/Messenger/Notifications/V2/Base
 * @description Base notification service with common functionality
 */

import { gun } from '../../../useGun.js';

class BaseNotificationService {
  constructor(type) {
    this.type = type;
    this.subscribers = new Map();
  }

  /**
   * @private
   * @returns {Gun} Gun instance for notifications
   */
  getNotificationsRef() {
    return gun.get('notifications');
  }

  /**
   * Subscribe to notifications
   * @param {string} userId - User ID to subscribe to
   * @param {Function} callback - Callback function for notifications
   * @returns {Function} Unsubscribe function
   */
  subscribe(userId, callback) {
    const ref = this.getNotificationsRef().get(userId).get(this.type);

    const handler = ref.on((data, key) => {
      if (data) {
        callback({ ...data, id: key });
      }
    });

    this.subscribers.set(userId, handler);
    return () => {
      ref.off();
      this.subscribers.delete(userId);
    };
  }

  /**
   * Mark notification as read
   * @param {string} userId - User ID
   * @param {string} notificationId - Notification ID
   */
  async markAsRead(userId, notificationId) {
    const ref = this.getNotificationsRef()
      .get(userId)
      .get(this.type)
      .get(notificationId);

    await ref.put({ read: true });
  }

  /**
   * Remove notification
   * @param {string} userId - User ID
   * @param {string} notificationId - Notification ID
   */
  async remove(userId, notificationId) {
    const ref = this.getNotificationsRef()
      .get(userId)
      .get(this.type)
      .get(notificationId);

    await ref.put(null);
  }

  /**
   * Get all notifications for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of notifications
   */
  async getAll(userId) {
    return new Promise((resolve) => {
      const notifications = [];
      this.getNotificationsRef()
        .get(userId)
        .get(this.type)
        .map()
        .once((data, key) => {
          if (data) {
            notifications.push({ ...data, id: key });
          }
        });
      resolve(notifications);
    });
  }
}

export default BaseNotificationService;
