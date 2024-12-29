/**
 * @module Linda/Messenger/Notifications/V2/Friends
 * @description Friend request notifications service
 */

import BaseNotificationService from '../base/notificationService.js';
import { gun, user, DAPP_NAME } from '../../../useGun.js';
import { Observable } from 'rxjs';

class FriendRequestNotificationService extends BaseNotificationService {
  constructor() {
    super('friendRequests');
    this.processedRequests = new Set();
  }

  /**
   * Load user data from Gun
   * @private
   * @param {string} pub - User's public key
   * @returns {Promise<Object>} User data
   */
  async loadUserData(pub) {
    return new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('userList')
        .get('users')
        .map()
        .once((userData) => {
          if (userData && userData.pub === pub) {
            resolve({
              alias: userData.nickname || userData.username || pub,
              displayName: userData.nickname,
              username: userData.username,
              avatarSeed: userData.avatarSeed,
            });
          }
        });

      // Safety timeout
      setTimeout(() => resolve({ alias: pub }), 2000);
    });
  }

  /**
   * Process a friend request
   * @param {string} userId - User ID
   * @param {Object} request - Friend request object
   */
  async processRequest(userId, request) {
    if (!this.processedRequests.has(request.id)) {
      // Se mancano i dati dell'utente, li recuperiamo
      if (!request.alias || !request.from) {
        const userData = await this.loadUserData(request.from);
        request = { ...request, ...userData };
      }

      this.processedRequests.add(request.id);
      const ref = this.getNotificationsRef()
        .get(userId)
        .get(this.type)
        .get(request.id);

      await ref.put({
        type: 'friendRequest',
        requestId: request.id,
        sender: request.from,
        alias: request.alias,
        displayName: request.displayName,
        username: request.username,
        avatarSeed: request.avatarSeed,
        timestamp: request.timestamp || Date.now(),
        status: request.status || 'pending',
        read: false,
      });

      // Manteniamo anche il vecchio sistema per retrocompatibilità
      await gun
        .get(DAPP_NAME)
        .get('all_friend_requests')
        .get(request.id)
        .put({
          ...request,
          status: request.status || 'pending',
        });
    }
  }

  /**
   * Observe friend requests
   * @returns {Observable} Observable of friend requests
   */
  observeFriendRequests() {
    return new Observable((subscriber) => {
      if (!user?.is) {
        subscriber.error(new Error('User not authenticated'));
        return;
      }

      // Osserva le richieste pubbliche
      const publicHandler = gun
        .get(DAPP_NAME)
        .get('all_friend_requests')
        .map()
        .on(async (request, id) => {
          if (id === '_' || !request) return; // Ignora le chiavi speciali di Gun

          console.log('Richiesta ricevuta:', { request, id });

          // Verifica che la richiesta sia per l'utente corrente
          if (request.to === user.is.pub) {
            try {
              await this.processRequest(user.is.pub, { ...request, id });
              console.log('Richiesta processata:', { request, id });

              subscriber.next({
                data: {
                  ...request,
                  id,
                  status: request.status || 'pending',
                },
              });
            } catch (error) {
              console.error('Errore nel processare la richiesta:', error);
            }
          }
        });

      // Forza un check iniziale
      gun
        .get(DAPP_NAME)
        .get('all_friend_requests')
        .once(() => {
          console.log('Check iniziale richieste completato');
        });

      return () => {
        if (typeof publicHandler === 'function') publicHandler();
      };
    });
  }

  /**
   * Get pending friend requests
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of pending friend requests
   */
  async getPendingRequests(userId) {
    const notifications = await this.getAll(userId);
    return notifications.filter((n) => n.status === 'pending');
  }

  /**
   * Update request status
   * @param {string} userId - User ID
   * @param {string} requestId - Request ID
   * @param {string} status - New status
   */
  async updateRequestStatus(userId, requestId, status) {
    // Aggiorna sia il nuovo che il vecchio sistema
    const ref = this.getNotificationsRef()
      .get(userId)
      .get(this.type)
      .get(requestId);

    await ref.put({ status });
    await gun
      .get(DAPP_NAME)
      .get('all_friend_requests')
      .get(requestId)
      .get('status')
      .put(status);
  }

  /**
   * Mark request as read
   * @param {string} userId - User ID
   * @param {string} requestId - Request ID
   */
  async markAsRead(userId, requestId) {
    // Aggiorna sia il nuovo che il vecchio sistema
    await super.markAsRead(userId, requestId);
    await gun
      .get(DAPP_NAME)
      .get('all_friend_requests')
      .get(requestId)
      .get('status')
      .put('read');
  }

  /**
   * Get unread request count
   * @param {string} userId - User ID
   * @returns {Promise<number>} Unread request count
   */
  async getUnreadCount(userId) {
    const notifications = await this.getAll(userId);
    return notifications.filter((n) => !n.read).length;
  }
}

export default new FriendRequestNotificationService();
