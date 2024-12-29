import { gun, DAPP_NAME } from "../useGun";

export const avatarService = {
  /**
   * Salva l'avatar di un utente
   * @param {string} userPub - Chiave pubblica dell'utente
   * @param {string} avatarData - Dati dell'avatar in base64
   */
  saveAvatar: async (userPub, avatarData) => {
    if (!userPub || !avatarData) {
      throw new Error("userPub e avatarData sono richiesti");
    }

    // Salva l'avatar nel nodo avatars
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get("avatars")
        .get(userPub)
        .put({ data: avatarData }, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // Aggiorna anche il profilo utente
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get("users")
        .get(userPub)
        .get("avatar")
        .put(avatarData, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });
  },

  /**
   * Recupera l'avatar di un utente
   * @param {string} userPub - Chiave pubblica dell'utente
   * @returns {Promise<string|null>} - Dati dell'avatar o null se non presente
   */
  getAvatar: async (userPub) => {
    if (!userPub) {
      throw new Error("userPub è richiesto");
    }

    return new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get("avatars")
        .get(userPub)
        .once((avatar) => {
          resolve(avatar?.data || null);
        });
    });
  },

  /**
   * Rimuove l'avatar di un utente
   * @param {string} userPub - Chiave pubblica dell'utente
   */
  removeAvatar: async (userPub) => {
    if (!userPub) {
      throw new Error("userPub è richiesto");
    }

    await Promise.all([
      // Rimuovi dal nodo avatars
      new Promise((resolve) => {
        gun.get(DAPP_NAME).get("avatars").get(userPub).put(null, resolve);
      }),
      // Rimuovi dal profilo utente
      new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("users")
          .get(userPub)
          .get("avatar")
          .put(null, resolve);
      }),
    ]);
  },
};
