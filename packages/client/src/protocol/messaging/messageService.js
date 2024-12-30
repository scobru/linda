/**
 * @module messageService
 * @description Servizio centralizzato per la gestione dei messaggi
 */

import { gun, DAPP_NAME } from "../useGun.js";
import { messageList } from "./messageList.js";

export const messageService = {
  /**
   * Carica i messaggi per qualsiasi tipo di chat
   * @param {string} roomId - ID della stanza/chat
   * @param {string} type - Tipo di chat ('chat', 'channel', 'board')
   * @returns {Promise<Array>} Lista dei messaggi
   */
  loadMessages: async (roomId, type) => {
    if (!roomId) return [];

    try {
      if (type === "chat") {
        return await messageList.getMessages(roomId);
      }

      const path =
        type === "channel" ? "channels" : type === "board" ? "boards" : "chats";

      return await messageList.loadMessages(path, roomId);
    } catch (error) {
      console.error("Errore caricamento messaggi:", error);
      return [];
    }
  },

  /**
   * Sottoscrizione ai messaggi in tempo reale
   * @param {string} roomId - ID della stanza/chat
   * @param {string} type - Tipo di chat
   * @param {Function} callback - Callback per i nuovi messaggi
   * @returns {Function} Funzione di unsubscribe
   */
  subscribeToMessages: (roomId, type, callback) => {
    if (!roomId) return () => {};

    const path =
      type === "channel" ? "channels" : type === "board" ? "boards" : "chats";

    return messageList.subscribeToMessages(path, roomId, callback);
  },

  /**
   * Carica i membri autorizzati di una board
   * @param {string} boardId - ID della board
   * @returns {Promise<Object>} Membri autorizzati e conteggio
   */
  loadAuthorizedMembers: async (boardId) => {
    if (!boardId) return { members: {}, count: 0 };

    return new Promise((resolve) => {
      const members = {};
      let count = 0;

      gun
        .get(DAPP_NAME)
        .get("boards")
        .get(boardId)
        .get("members")
        .map()
        .once((data, key) => {
          if (
            data &&
            (data.canWrite === true || data.permissions?.write === true)
          ) {
            members[key] = data;
            count++;
          }
        });

      setTimeout(() => {
        resolve({ members, count });
      }, 500);
    });
  },

  /**
   * Verifica se un utente è autorizzato in una board
   * @param {string} boardId - ID della board
   * @param {string} userPub - Chiave pubblica utente
   * @param {Object} authorizedMembers - Mappa dei membri autorizzati
   * @returns {boolean} True se l'utente è autorizzato
   */
  isAuthorizedMember: (boardId, userPub, authorizedMembers) => {
    if (!boardId || !userPub) return false;

    // Il creatore è sempre autorizzato
    const board = gun.get(DAPP_NAME).get("boards").get(boardId);
    if (board.creator === userPub) return true;

    const memberData = authorizedMembers[userPub];
    if (!memberData) return false;

    return (
      memberData.canWrite === true || memberData.permissions?.write === true
    );
  },
};

export default messageService;
