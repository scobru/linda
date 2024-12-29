import { gun, user, DAPP_NAME } from '../useGun.js';

export const chatList = {
  add: async (chatId, chatData) => {
    if (!user.is) throw new Error('User not authenticated');
    if (!chatId) throw new Error('Chat ID is required');
    if (!chatData) throw new Error('Chat data is required');

    try {
      await gun.get(DAPP_NAME).get('chats').get(chatId).put(chatData);

      return {
        success: true,
        message: 'Chat added successfully',
      };
    } catch (error) {
      console.error('Error adding chat:', error);
      throw error;
    }
  },

  get: async () => {
    if (!user.is) throw new Error('User not authenticated');

    return new Promise((resolve) => {
      const chats = [];
      gun
        .get(DAPP_NAME)
        .get('chats')
        .map()
        .once((chat, id) => {
          if (chat && (chat.members || []).includes(user.is.pub)) {
            chats.push({
              ...chat,
              id,
            });
          }
        });

      // Risolvi dopo un breve timeout per permettere il caricamento delle chat
      setTimeout(() => {
        resolve(chats.sort((a, b) => b.lastActivity - a.lastActivity));
      }, 100);
    });
  },

  delete: async (chatId) => {
    if (!user.is) throw new Error('User not authenticated');
    if (!chatId) throw new Error('Chat ID is required');

    try {
      await gun.get(DAPP_NAME).get('chats').get(chatId).put(null);

      return {
        success: true,
        message: 'Chat deleted successfully',
      };
    } catch (error) {
      console.error('Error deleting chat:', error);
      throw error;
    }
  },
};

export default chatList;
