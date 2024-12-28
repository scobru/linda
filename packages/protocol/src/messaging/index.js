import { gun, user, DAPP_NAME } from '../useGun.js';
import { updateGlobalMetrics } from '../system/systemService.js';
import { messageNotifications } from '../notifications/index.js';
import { blocking } from '../index.js';
import { messageIntegrity } from './messageIntegrity.js';
import { channelsV2 } from './channels.v2.js';
import { boardsV2 } from './boards.v2.js';

const { userBlocking } = blocking;

/**
 * Servizio unificato per la messaggistica
 */
export const messaging = {
  /**
   * Servizio per le chat private
   */
  chat: {
    /**
     * Crea una nuova chat privata
     */
    create: async (recipientPub, callback = () => {}) => {
      if (!user?.is) throw new Error('Utente non autenticato');

      try {
        const chatId = [user.is.pub, recipientPub].sort().join('_');

        // Verifica se la chat esiste già
        const existingChat = await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('chats')
            .get(chatId)
            .once((chat) => resolve(chat));
        });

        if (existingChat) {
          return callback({
            success: true,
            chat: {
              roomId: chatId,
              user1: user.is.pub,
              user2: recipientPub,
              created: existingChat.created,
            },
          });
        }

        // Crea una nuova chat
        const chatData = {
          user1: user.is.pub,
          user2: recipientPub,
          created: Date.now(),
          status: 'active',
          messages: {},
        };

        await gun.get(DAPP_NAME).get('chats').get(chatId).put(chatData);

        // Aggiungi riferimenti per entrambi gli utenti
        await Promise.all([
          gun.user().get(DAPP_NAME).get('my_chats').set({
            chatId,
            with: recipientPub,
            created: Date.now(),
          }),
          gun.get(`~${recipientPub}`).get(DAPP_NAME).get('my_chats').set({
            chatId,
            with: user.is.pub,
            created: Date.now(),
          }),
        ]);

        return callback({
          success: true,
          chat: {
            roomId: chatId,
            user1: user.is.pub,
            user2: recipientPub,
            created: Date.now(),
          },
        });
      } catch (error) {
        console.error('Errore creazione chat:', error);
        return callback({
          success: false,
          errMessage: error.message || 'Errore creazione chat',
        });
      }
    },

    /**
     * Invia un messaggio in una chat
     */
    sendMessage: async (chatId, recipientPub, content, callback = () => {}) => {
      if (!user?.is) throw new Error('Utente non autenticato');

      try {
        // Verifica blocchi
        const blockStatus = await userBlocking.getBlockStatus(recipientPub);
        if (blockStatus.blocked || blockStatus.blockedBy) {
          throw new Error('Utente bloccato o sei stato bloccato');
        }

        // Genera ID messaggio
        const messageId = `msg_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        // Cripta il contenuto
        const encryptedContent = await messaging.messages.encrypt(
          content,
          recipientPub
        );
        const previewContent =
          content.substring(0, 50) + (content.length > 50 ? '...' : '');
        const encryptedPreview = await messaging.messages.encrypt(
          previewContent,
          recipientPub
        );

        // Prepara il messaggio
        const messageData = {
          sender: user.is.pub,
          recipient: recipientPub,
          timestamp: Date.now(),
          id: messageId,
          content: encryptedContent,
          preview: encryptedPreview,
          status: 'sent',
        };

        // Salva il messaggio
        await gun
          .get(DAPP_NAME)
          .get('chats')
          .get(chatId)
          .get('messages')
          .get(messageId)
          .put(messageData);

        // Aggiorna lastMessage
        await gun
          .get(DAPP_NAME)
          .get('chats')
          .get(chatId)
          .get('lastMessage')
          .put({
            content: encryptedPreview,
            sender: user.is.pub,
            timestamp: Date.now(),
          });

        // Aggiorna metriche
        await updateGlobalMetrics('totalMessagesSent', 1);

        return callback({
          success: true,
          messageId,
          message: messageData,
        });
      } catch (error) {
        console.error('Errore invio messaggio:', error);
        return callback({
          success: false,
          errMessage: error.message || 'Errore invio messaggio',
        });
      }
    },

    /**
     * Elimina una chat
     */
    delete: async (chatId) => {
      if (!user?.is) throw new Error('Utente non autenticato');

      try {
        await gun.get(DAPP_NAME).get('chats').get(chatId).put(null);
        await gun.user().get(DAPP_NAME).get('my_chats').get(chatId).put(null);
        return { success: true };
      } catch (error) {
        console.error('Errore eliminazione chat:', error);
        throw error;
      }
    },
  },

  /**
   * Servizio per i messaggi
   */
  messages: {
    /**
     * Cripta un messaggio
     */
    encrypt: async (content, recipientPub) => {
      try {
        const recipientEpub = await new Promise((resolve) => {
          gun.user(recipientPub).once((data) => resolve(data?.epub));
        });

        if (!recipientEpub)
          throw new Error('Chiave di crittografia non trovata');

        const secret = await SEA.secret(recipientEpub, user.pair());
        const encrypted = await SEA.encrypt(content, secret);

        return encrypted;
      } catch (error) {
        console.error('Errore crittografia:', error);
        throw error;
      }
    },

    /**
     * Decripta un messaggio
     */
    decrypt: async (message, recipientPub) => {
      try {
        if (!message?.content?.startsWith('SEA{')) return message;

        const recipientEpub = await new Promise((resolve) => {
          gun.user(recipientPub).once((data) => resolve(data?.epub));
        });

        if (!recipientEpub)
          throw new Error('Chiave di decrittazione non trovata');

        const secret = await SEA.secret(recipientEpub, user.pair());
        const decrypted = await SEA.decrypt(message.content, secret);

        return {
          ...message,
          content: decrypted || '[Messaggio non decifrabile]',
        };
      } catch (error) {
        console.error('Errore decrittazione:', error);
        return {
          ...message,
          content: '[Errore decrittazione]',
        };
      }
    },

    /**
     * Verifica integrità messaggio
     */
    verify: messageIntegrity.verify,
  },

  /**
   * Servizio per i canali
   */
  channels: channelsV2,

  /**
   * Servizio per le board
   */
  boards: boardsV2,
};

export default messaging;
