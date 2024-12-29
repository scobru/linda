/**
 * @module Linda/Messenger/Notifications
 * @description Module for managing message notifications and tracking
 */

import messageNotificationsV2 from './v2/messages/messageNotifications.js';
import friendRequestNotificationsV2 from './v2/friends/friendRequestNotifications.js';

// Esportiamo i nuovi moduli con i nomi originali per mantenere la retrocompatibilità
export const messageNotifications = messageNotificationsV2;
export const friendRequestNotifications = friendRequestNotificationsV2;

// Esportiamo anche i moduli v2 direttamente per chi vuole usare la nuova versione
export const v2 = {
  messageNotifications: messageNotificationsV2,
  friendRequestNotifications: friendRequestNotificationsV2,
};

// Export default per retrocompatibilità
export default {
  messageNotifications: messageNotificationsV2,
  friendRequestNotifications: friendRequestNotificationsV2,
};
