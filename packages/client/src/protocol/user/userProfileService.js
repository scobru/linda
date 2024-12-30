/**
 * @module userProfileService
 * @description Servizio centralizzato per la gestione dei profili utente
 */

import { gun, DAPP_NAME } from "../useGun.js";

export const userProfileService = {
  /**
   * Carica le informazioni di un utente
   * @param {string} userPub - Chiave pubblica dell'utente
   * @returns {Promise<Object>} Informazioni dell'utente
   */
  loadUserInfo: async (userPub) => {
    if (!userPub) return null;

    try {
      const [userListInfo, userInfo] = await Promise.all([
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("userList")
            .get("users")
            .get(userPub)
            .once((data) => resolve(data));
        }),
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("users")
            .get(userPub)
            .once((data) => resolve(data));
        }),
      ]);

      const info = {
        ...userInfo,
        ...userListInfo,
        displayName:
          userListInfo?.nickname || userListInfo?.username || userInfo?.alias,
        username: userListInfo?.username || userInfo?.username,
        nickname: userListInfo?.nickname || userInfo?.nickname,
        avatar: userListInfo?.avatar || userInfo?.avatar,
      };

      return info;
    } catch (error) {
      console.error("Errore caricamento info utente:", error);
      throw error;
    }
  },

  /**
   * Sottoscrizione alle informazioni di un utente
   * @param {string} userPub - Chiave pubblica dell'utente
   * @param {Function} onUpdate - Callback per gli aggiornamenti
   * @returns {Function} Funzione di unsubscribe
   */
  subscribeToUserInfo: (userPub, onUpdate) => {
    if (!userPub) return () => {};

    const unsubUserList = gun
      .get(DAPP_NAME)
      .get("userList")
      .get("users")
      .get(userPub)
      .on((data) => {
        if (data) {
          onUpdate({
            displayName: data.nickname || data.username,
            username: data.username,
            nickname: data.nickname,
            avatar: data.avatar,
          });
        }
      });

    const unsubUsers = gun
      .get(DAPP_NAME)
      .get("users")
      .get(userPub)
      .on((data) => {
        if (data) {
          onUpdate({
            displayName: data.nickname || data.username || data.alias,
            username: data.username,
            nickname: data.nickname,
            avatar: data.avatar,
          });
        }
      });

    return () => {
      if (typeof unsubUserList === "function") unsubUserList();
      if (typeof unsubUsers === "function") unsubUsers();
    };
  },
};

export default userProfileService;
