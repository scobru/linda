/**
 * @module chatService
 * @description Servizio centralizzato per la gestione delle chat private
 */

import { gun, user, DAPP_NAME } from "../useGun.js";

export const chatService = {
  /**
   * Carica i messaggi di una chat
   * @param {string} roomId - ID della chat
   * @returns {Promise<Array>} Lista dei messaggi
   */
  loadMessages: (roomId) => {
    return new Promise((resolve) => {
      const messages = [];
      const chatRef = gun.get(DAPP_NAME).get("private_messages").get(roomId);

      chatRef.map().once((msg, id) => {
        if (!msg || id === "_" || !msg.timestamp) return;

        messages.push({
          id,
          text: msg.text || msg.content,
          sender: msg.sender || msg.from,
          timestamp: msg.timestamp || msg.time,
          senderInfo: msg.senderInfo || {
            pub: msg.sender || msg.from,
            alias: msg.senderAlias,
          },
        });
      });

      setTimeout(() => {
        resolve(messages.sort((a, b) => a.timestamp - b.timestamp));
      }, 1000);
    });
  },

  /**
   * Sottoscrizione ai messaggi di una chat
   * @param {string} roomId - ID della chat
   * @param {Function} onMessage - Callback per i nuovi messaggi
   * @returns {Function} Funzione di unsubscribe
   */
  subscribeToMessages: (roomId, onMessage) => {
    if (!roomId) return () => {};

    const chatRef = gun.get(DAPP_NAME).get("private_messages").get(roomId);
    const handler = chatRef.map().on((msg, id) => {
      if (!msg || id === "_" || !msg.timestamp) return;

      const message = {
        id,
        text: msg.text || msg.content,
        sender: msg.sender || msg.from,
        timestamp: msg.timestamp || msg.time,
        senderInfo: msg.senderInfo || {
          pub: msg.sender || msg.from,
          alias: msg.senderAlias,
        },
      };

      onMessage(message);
    });

    return handler;
  },

  /**
   * Invia un messaggio in una chat
   * @param {string} roomId - ID della chat
   * @param {string} text - Testo del messaggio
   * @param {Object} senderInfo - Informazioni sul mittente
   * @returns {Promise<boolean>} Esito dell'invio
   */
  sendMessage: async (roomId, text, senderInfo) => {
    if (!user?.is?.pub || !roomId || !text.trim()) {
      throw new Error("Parametri mancanti per l'invio del messaggio");
    }

    const messageData = {
      text: text.trim(),
      sender: user.is.pub,
      timestamp: Date.now(),
      senderInfo: {
        pub: user.is.pub,
        alias: senderInfo.alias,
      },
    };

    const messageId = `msg_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get("private_messages")
        .get(roomId)
        .get(messageId)
        .put(messageData, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    return true;
  },
};

export default chatService;
