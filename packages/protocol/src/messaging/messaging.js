import { gun, user, DAPP_NAME } from '../useGun.js';

export const messaging = {
  sendMessage: async (channelId, content) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      const messageId = `msg_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const message = {
        id: messageId,
        content,
        sender: user.is.pub,
        timestamp: Date.now(),
      };

      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('messages')
        .get(messageId)
        .put(message);
      return { success: true, messageId };
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  },

  deleteMessage: async (channelId, messageId) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      const message = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('channels')
          .get(channelId)
          .get('messages')
          .get(messageId)
          .once((data) => resolve(data));
      });

      if (!message || message.sender !== user.is.pub) {
        throw new Error('Not authorized to delete this message');
      }

      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('messages')
        .get(messageId)
        .put(null);
      return { success: true };
    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  },

  editMessage: async (channelId, messageId, newContent) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      const message = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('channels')
          .get(channelId)
          .get('messages')
          .get(messageId)
          .once((data) => resolve(data));
      });

      if (!message || message.sender !== user.is.pub) {
        throw new Error('Not authorized to edit this message');
      }

      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('messages')
        .get(messageId)
        .put({
          ...message,
          content: newContent,
          edited: true,
          editedAt: Date.now(),
        });

      return { success: true };
    } catch (error) {
      console.error('Error editing message:', error);
      throw error;
    }
  },
};
