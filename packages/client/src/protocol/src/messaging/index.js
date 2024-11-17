/**
 * @module Linda/Messenger/Messaging
 * @description Gestione della messaggistica
 */

import createChat from './createChat.js';
import messageList from './messageList.js';
import sendMessage from './sendMessage.js';
import groups from './groups.js';

export { createChat, messageList, sendMessage, groups };

export default {
  createChat,
  messageList,
  sendMessage,
  groups,
};
