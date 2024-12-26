/**
 * @module Linda/Messenger/Messaging
 * @description Gestione della messaggistica
 */

import createChat from './createChat.js';
import messageList from './messageList.js';
import sendMessage from './sendMessage.js';
import sendVoiceMessage from './sendVoiceMessage.js';
import channelsService from './channels.js';
import { gun, user, DAPP_NAME } from '../useGun.js';

// Funzioni per la gestione del blocco chat
const blockChat = async (chatId) => {
  return new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get('blocked_chats')
      .get(chatId)
      .put({ blocked: true, timestamp: Date.now() }, (ack) => {
        resolve({ success: !ack.err });
      });
  });
};

const unblockChat = async (chatId) => {
  return new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get('blocked_chats')
      .get(chatId)
      .put(null, (ack) => {
        resolve({ success: !ack.err });
      });
  });
};

const getBlockedChats = async () => {
  return new Promise((resolve) => {
    const blockedChats = [];
    gun
      .get(DAPP_NAME)
      .get('blocked_chats')
      .map()
      .once((data, id) => {
        if (data && data.blocked) {
          blockedChats.push(id);
        }
      });

    setTimeout(() => resolve(blockedChats), 500);
  });
};

// Esporta le funzioni di chat
export const chat = {
  blockChat,
  unblockChat,
  getBlockedChats,
  createChat,
  messageList,
  sendMessage,
  sendVoiceMessage,
};

// Servizio per i canali e le bacheche
export const channels = channelsService;

// Esporta sia il servizio chat che il servizio channels
export const messaging = {
  chat,
  channels,
};

// Esporta anche le singole funzioni per retrocompatibilità
export { createChat, messageList, sendMessage, sendVoiceMessage };

export default messaging;
