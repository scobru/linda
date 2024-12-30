/**
 * @module channelService
 * @description Servizio centralizzato per la gestione dei canali
 */

import { gun, user, DAPP_NAME } from "../useGun.js";

export const channelService = {
  /**
   * Carica la lista dei canali
   * @param {Function} callback - Callback con la risposta
   * @returns {Promise<void>}
   */
  list: async (callback) => {
    try {
      const channels = await new Promise((resolve) => {
        const results = [];
        gun
          .get(DAPP_NAME)
          .get("channels")
          .map()
          .once((data, id) => {
            if (data && data.name) {
              results.push({ ...data, id });
            }
          });

        setTimeout(() => {
          resolve(results.sort((a, b) => b.created - a.created));
        }, 1000);
      });

      callback({ success: true, channels });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  /**
   * Crea un nuovo canale
   * @param {Object} channelData - Dati del canale
   * @param {Function} callback - Callback con la risposta
   */
  create: async (channelData, callback) => {
    try {
      if (!user?.is) throw new Error("Utente non autenticato");

      const channelId = `channel_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .get(channelId)
          .put(
            {
              ...channelData,
              id: channelId,
              creator: user.is.pub,
              created: Date.now(),
              members: {
                [user.is.pub]: {
                  role: "admin",
                  joined: Date.now(),
                },
              },
            },
            (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            }
          );
      });

      callback({ success: true, channelId });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  /**
   * Unisciti a un canale
   * @param {string} channelId - ID del canale
   * @param {Function} callback - Callback con la risposta
   */
  join: async (channelId, callback) => {
    try {
      if (!user?.is) throw new Error("Utente non autenticato");

      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .get(channelId)
          .get("members")
          .get(user.is.pub)
          .put(
            {
              role: "member",
              joined: Date.now(),
            },
            (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            }
          );
      });

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  /**
   * Lascia un canale
   * @param {string} channelId - ID del canale
   * @param {Function} callback - Callback con la risposta
   */
  leave: async (channelId, callback) => {
    try {
      if (!user?.is) throw new Error("Utente non autenticato");

      // Recupera alias utente
      const userAlias = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("users")
          .get(user.is.pub)
          .get("alias")
          .once((alias) => resolve(alias || "Utente"));
      });

      // Rimuovi membro
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .get(channelId)
          .get("members")
          .get(user.is.pub)
          .put(null, (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          });
      });

      // Aggiungi messaggio di sistema
      const messageId = `system_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      await gun
        .get(DAPP_NAME)
        .get("channels")
        .get(channelId)
        .get("messages")
        .get(messageId)
        .put({
          id: messageId,
          type: "system",
          content: `${userAlias} ha lasciato il canale`,
          sender: "system",
          timestamp: Date.now(),
        });

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  /**
   * Elimina un canale
   * @param {string} channelId - ID del canale
   * @param {Function} callback - Callback con la risposta
   */
  delete: async (channelId, callback) => {
    try {
      if (!user?.is) throw new Error("Utente non autenticato");

      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .get(channelId)
          .once((channel) => {
            if (!channel) {
              reject(new Error("Canale non trovato"));
              return;
            }
            if (channel.creator !== user.is.pub) {
              reject(new Error("Solo il creatore può eliminare il canale"));
              return;
            }

            // Elimina messaggi
            gun
              .get(DAPP_NAME)
              .get("channels")
              .get(channelId)
              .get("messages")
              .map()
              .once((msg, key) => {
                if (msg) {
                  gun
                    .get(DAPP_NAME)
                    .get("channels")
                    .get(channelId)
                    .get("messages")
                    .get(key)
                    .put(null);
                }
              });

            // Elimina canale
            gun
              .get(DAPP_NAME)
              .get("channels")
              .get(channelId)
              .put(null, (ack) => {
                if (ack.err) reject(new Error(ack.err));
                else resolve();
              });
          });
      });

      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  /**
   * Cerca canali
   * @param {string} query - Query di ricerca
   * @param {Function} callback - Callback con la risposta
   */
  search: async (query, callback) => {
    try {
      const channels = await new Promise((resolve) => {
        const results = [];
        gun
          .get(DAPP_NAME)
          .get("channels")
          .map()
          .once((data, id) => {
            if (
              data &&
              data.name &&
              data.name.toLowerCase().includes(query.toLowerCase())
            ) {
              results.push({ ...data, id });
            }
          });
        setTimeout(() => resolve(results), 1000);
      });

      callback({ success: true, channels });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },
};

export default channelService;
