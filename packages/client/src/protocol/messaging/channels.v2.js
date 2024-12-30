import { gun, user, DAPP_NAME } from "../useGun.js";

export const channelsV2 = {
  /**
   * Crea un nuovo canale
   */
  create: async (channelData, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      if (!channelData.name) {
        callback({
          success: false,
          error: "Il nome del canale è obbligatorio",
        });
        return;
      }

      // Verifica se esiste già un canale con lo stesso nome
      const exists = await channelExists(channelData.name);
      if (exists) {
        callback({
          success: false,
          error: "Esiste già un canale con questo nome",
        });
        return;
      }

      // Genera un nuovo ID univoco per il canale
      const channelId = `channel_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Crea il canale con i dati forniti
      const channel = {
        id: channelId,
        name: channelData.name,
        description: channelData.description || "",
        type: channelData.type || "public",
        creator: user.is.pub,
        members: {
          [user.is.pub]: {
            role: "creator",
            joinedAt: Date.now(),
          },
        },
        createdAt: Date.now(),
      };

      // Salva il canale
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .get(channelId)
          .put(channel, (ack) => {
            if (ack.err) {
              reject(ack.err);
            } else {
              resolve();
            }
          });
      });

      // Aggiungi il canale alla lista dei canali dell'utente
      await new Promise((resolve, reject) => {
        gun
          .user()
          .get("channels")
          .get(channelId)
          .put({ joined: Date.now() }, (ack) => {
            if (ack.err) {
              reject(ack.err);
            } else {
              resolve();
            }
          });
      });

      // Aggiungi un messaggio di sistema per la creazione del canale
      const messageId = `system_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const systemMessage = {
        id: messageId,
        type: "system",
        content: `✨ Canale "${channelData.name}" creato da ${formatUserName(
          user.is.pub
        )}`,
        sender: "system",
        timestamp: Date.now(),
      };

      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .get(channelId)
          .get("messages")
          .get(messageId)
          .put(systemMessage, () => resolve());
      });

      callback({ success: true, channel });
    } catch (error) {
      console.error("Errore creazione canale:", error);
      callback({ success: false, error: error.message });
    }
  },

  /**
   * Unisciti a un canale
   */
  join: async (channelId, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const channel = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .get(channelId)
          .once((data) => resolve(data));
      });

      if (!channel) throw new Error("Canale non trovato");

      // Aggiungi l'utente ai membri del canale
      await gun
        .get(DAPP_NAME)
        .get("channels")
        .get(channelId)
        .get("members")
        .set({
          pub: user.is.pub,
          role: "member",
          joined: Date.now(),
        });

      // Aggiungi il canale alla lista dei canali dell'utente
      await gun.user().get("channels").get(channelId).put({
        id: channelId,
        joined: Date.now(),
        role: "member",
      });

      // Notifica gli altri membri
      await gun
        .get(DAPP_NAME)
        .get("channels")
        .get(channelId)
        .get("messages")
        .set({
          id: `system_${Date.now()}`,
          type: "system",
          content: `🧹 ${formatUserName(user.is.pub)} si è unito al canale`,
          timestamp: Date.now(),
          sender: "system",
        });

      return callback({ success: true });
    } catch (error) {
      console.error("Errore partecipazione al canale:", error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Lista solo i canali a cui l'utente è iscritto
   */
  list: async (callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      // Recupera i canali dell'utente e i loro dettagli in un'unica Promise
      const channels = await new Promise((resolve) => {
        const result = [];
        let pendingChannels = 0;
        let hasStartedLoading = false;

        gun
          .user()
          .get("channels")
          .map()
          .once(async (data, id) => {
            hasStartedLoading = true;
            if (!data) return;

            pendingChannels++;

            gun
              .get(DAPP_NAME)
              .get("channels")
              .get(id)
              .once((channelData) => {
                if (channelData) {
                  result.push({ ...channelData, id });
                }
                pendingChannels--;
                if (pendingChannels === 0) {
                  resolve(result);
                }
              });
          });

        // Se dopo 1 secondo non abbiamo trovato canali, risolvi con array vuoto
        setTimeout(() => {
          if (
            !hasStartedLoading ||
            (hasStartedLoading && pendingChannels === 0)
          ) {
            resolve(result);
          }
        }, 1000);
      });

      return callback({ success: true, channels });
    } catch (error) {
      console.error("Errore lista canali:", error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Cerca canali pubblici per nome
   */
  search: async (query = "", callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const searchQuery = query.toLowerCase();
      const results = await new Promise((resolve) => {
        const channels = [];
        gun
          .get(DAPP_NAME)
          .get("channels")
          .map()
          .once((channel, id) => {
            if (
              channel?.type === "public" &&
              channel?.name?.toLowerCase().includes(searchQuery)
            ) {
              const isMember =
                channel.members &&
                Object.values(channel.members).some(
                  (member) => member?.pub === user.is.pub
                );

              channels.push({
                ...channel,
                id,
                isMember,
              });
            }
          });

        setTimeout(() => resolve(channels), 500);
      });

      // Ordina: non membri prima, poi per nome
      results.sort((a, b) =>
        a.isMember === b.isMember
          ? a.name.localeCompare(b.name)
          : a.isMember
          ? 1
          : -1
      );

      callback({
        success: true,
        channels: results,
      });
    } catch (error) {
      console.error("Errore ricerca canali:", error);
      callback({ success: false, error: error.message });
    }
  },

  /**
   * Lascia un canale
   */
  leave: async (channelId, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const channel = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .get(channelId)
          .once((data) => resolve(data));
      });

      if (!channel) throw new Error("Canale non trovato");

      // Recupera l'alias dell'utente
      const userAlias = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("users")
          .get(user.is.pub)
          .get("alias")
          .once((alias) => {
            resolve(alias || "Utente");
          });
      });

      // Rimuovi l'utente dai membri del canale
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

      // Rimuovi il canale dalla lista dei canali dell'utente
      await new Promise((resolve, reject) => {
        gun
          .user()
          .get("channels")
          .get(channelId)
          .put(null, (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          });
      });

      // Aggiungi un messaggio di sistema per l'uscita
      const messageId = `system_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      gun
        .get(DAPP_NAME)
        .get("channels")
        .get(channelId)
        .get("messages")
        .get(messageId)
        .put({
          id: messageId,
          type: "system",
          content: `👋 ${userAlias} ha lasciato il canale`,
          sender: "system",
          timestamp: Date.now(),
        });

      callback({ success: true });
    } catch (error) {
      console.error("Errore uscita dal canale:", error);
      callback({ success: false, error: error.message });
    }
  },

  /**
   * Elimina un canale (solo il creatore può farlo)
   */
  delete: async (channelId, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const channel = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .get(channelId)
          .once((data) => resolve(data));
      });

      if (!channel) throw new Error("Canale non trovato");
      if (channel.creator !== user.is.pub) {
        throw new Error("Solo il creatore può eliminare il canale");
      }

      // Rimuovi tutti i messaggi
      await gun
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

      // Rimuovi tutti i membri
      await gun
        .get(DAPP_NAME)
        .get("channels")
        .get(channelId)
        .get("members")
        .map()
        .once((member, key) => {
          if (member) {
            gun
              .get(DAPP_NAME)
              .get("channels")
              .get(channelId)
              .get("members")
              .get(key)
              .put(null);
          }
        });

      // Rimuovi il canale
      await gun.get(DAPP_NAME).get("channels").get(channelId).put(null);

      return callback({ success: true });
    } catch (error) {
      console.error("Errore eliminazione canale:", error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Cancella i messaggi di un canale (solo il creatore può farlo)
   */
  clearMessages: async (channelId, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const channel = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .get(channelId)
          .once((data) => resolve(data));
      });

      if (!channel) throw new Error("Canale non trovato");

      // Verifica che l'utente sia il creatore
      if (channel.creator !== user.is.pub) {
        throw new Error(
          "Solo il creatore può cancellare i messaggi del canale"
        );
      }

      // Cancella tutti i messaggi
      await gun
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

      // Aggiungi messaggio di sistema
      await gun
        .get(DAPP_NAME)
        .get("channels")
        .get(channelId)
        .get("messages")
        .set({
          id: `system_${Date.now()}`,
          type: "system",
          content: `🧹 ${formatUserName(
            user.is.pub
          )} ha cancellato tutti i messaggi`,
          timestamp: Date.now(),
          sender: "system",
        });

      return callback({ success: true });
    } catch (error) {
      console.error("Errore cancellazione messaggi:", error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Invia un messaggio in un canale
   */
  sendMessage: async (channelId, content, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const channel = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .get(channelId)
          .once((data) => resolve(data));
      });

      if (!channel) throw new Error("Canale non trovato");

      // Verifica che l'utente sia membro del canale
      const isMember =
        channel.members &&
        Object.values(channel.members).some(
          (member) => member?.pub === user.is.pub
        );

      if (!isMember) {
        throw new Error("Non sei membro di questo canale");
      }

      // Genera ID messaggio
      const messageId = `msg_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Prepara il messaggio
      const messageData = {
        id: messageId,
        content,
        sender: user.is.pub,
        senderAlias: user.is.alias || "Unknown",
        timestamp: Date.now(),
        type: typeof content === "string" ? "text" : content.type || "text",
      };

      // Salva il messaggio
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get("channels")
          .get(channelId)
          .get("messages")
          .get(messageId)
          .put(messageData, (ack) => {
            if (ack.err) {
              reject(new Error(ack.err));
            } else {
              resolve();
            }
          });
      });

      return callback({
        success: true,
        messageId,
        message: messageData,
      });
    } catch (error) {
      console.error("Errore invio messaggio:", error);
      return callback({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * Invia un messaggio vocale in un canale
   */
  sendVoiceMessage: async (channelId, audioBlob, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      // Converti l'audio in base64
      const base64Audio = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(audioBlob);
      });

      const messageId = `msg_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const messageData = {
        id: messageId,
        content: base64Audio,
        sender: user.is.pub,
        senderAlias: user.is.alias || "Unknown",
        timestamp: Date.now(),
        type: "voice",
      };

      await gun
        .get(DAPP_NAME)
        .get("channels")
        .get(channelId)
        .get("messages")
        .get(messageId)
        .put(messageData);

      return callback({
        success: true,
        messageId,
        message: messageData,
      });
    } catch (error) {
      console.error("Errore invio messaggio vocale:", error);
      return callback({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * Invia un'immagine in un canale
   */
  sendImageMessage: async (channelId, imageData, callback = () => {}) => {
    if (!user?.is) throw new Error("Utente non autenticato");

    try {
      const messageId = `msg_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const messageData = {
        id: messageId,
        content: imageData,
        sender: user.is.pub,
        senderAlias: user.is.alias || "Unknown",
        timestamp: Date.now(),
        type: "image",
      };

      await gun
        .get(DAPP_NAME)
        .get("channels")
        .get(channelId)
        .get("messages")
        .get(messageId)
        .put(messageData);

      return callback({
        success: true,
        messageId,
        message: messageData,
      });
    } catch (error) {
      console.error("Errore invio immagine:", error);
      return callback({
        success: false,
        error: error.message,
      });
    }
  },
};

// Funzione per verificare se esiste già un canale con lo stesso nome
const channelExists = async (name) => {
  return new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get("channels")
      .map()
      .once((channel, id) => {
        if (
          channel &&
          channel.name &&
          channel.name.toLowerCase() === name.toLowerCase()
        ) {
          resolve(true);
        }
      });
    // Se dopo 1 secondo non troviamo match, assumiamo che non esista
    setTimeout(() => resolve(false), 1000);
  });
};

// Funzione per ottenere l'ID del canale dal nome
const getChannelIdByName = async (name) => {
  return new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get("channels")
      .map()
      .once((channel, id) => {
        if (
          channel &&
          channel.name &&
          channel.name.toLowerCase() === name.toLowerCase()
        ) {
          resolve(id);
        }
      });
    // Se dopo 1 secondo non troviamo match, restituiamo null
    setTimeout(() => resolve(null), 1000);
  });
};

// Funzione per formattare il nome utente in modo leggibile
const formatUserName = (pub) => {
  const alias = user.is.alias || "Utente";
  return pub === user.is.pub ? `${alias} (tu)` : alias;
};
