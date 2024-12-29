/**
 * @module Linda/Messenger/Notifications/V2
 * @description New notification system with improved architecture
 */

import messageNotifications from './messages/messageNotifications.js';
import friendRequestNotifications from './friends/friendRequestNotifications.js';

// Manteniamo la retrocompatibilità con l'API esistente
export { messageNotifications, friendRequestNotifications };

export default {
  messageNotifications,
  friendRequestNotifications,
};
