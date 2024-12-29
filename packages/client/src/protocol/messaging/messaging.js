import { gun, user, DAPP_NAME } from '../useGun.js';

export const messaging = {
  sendMessage: async (channelId, content) => {
    if (!user.is) throw new Error('Utente non autenticato');

    try {
      const messageId = `msg_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Per i canali, non criptiamo il contenuto
      const message = {
        id: messageId,
        content,
        sender: user.is.pub,
        senderAlias: user.is.alias,
        timestamp: Date.now(),
        type: 'text',
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
      console.error('Errore invio messaggio:', error);
      throw error;
    }
  },

  deleteMessage: async (channelId, messageId) => {
    if (!user.is) throw new Error('Utente non autenticato');

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
        throw new Error('Non autorizzato a eliminare questo messaggio');
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
      console.error('Errore eliminazione messaggio:', error);
      throw error;
    }
  },

  editMessage: async (channelId, messageId, newContent) => {
    if (!user.is) throw new Error('Utente non autenticato');

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
        throw new Error('Non autorizzato a modificare questo messaggio');
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
      console.error('Errore modifica messaggio:', error);
      throw error;
    }
  },
};
