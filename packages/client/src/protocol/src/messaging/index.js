/**
 * @module Linda/Messenger/Messaging
 * @description Gestione della messaggistica
 */

import createChat from './createChat.js';
import messageList from './messageList.js';
import sendMessage from './sendMessage.js';
import channelsService from './channels.js';

// Servizio per le chat private
export const chat = {
  createChat,
  messageList,
  sendMessage
};

// Servizio per i canali e le bacheche
export const channels = channelsService;

// Esporta sia il servizio chat che il servizio channels
export const messaging = {
  chat,
  channels
};

// Esporta anche le singole funzioni per retrocompatibilità
export {
  createChat,
  messageList,
  sendMessage
};

export default messaging;
