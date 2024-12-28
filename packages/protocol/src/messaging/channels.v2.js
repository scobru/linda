import { gun, user, DAPP_NAME } from '../useGun.js';

export const channelsV2 = {
  /**
   * Crea un nuovo canale
   */
  create: async (channelData, callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      if (!channelData.name) {
        callback({
          success: false,
          error: 'Il nome del canale è obbligatorio',
        });
        return;
      }

      // Verifica se esiste già un canale con lo stesso nome
      const exists = await channelExists(channelData.name);
      if (exists) {
        callback({
          success: false,
          error: 'Esiste già un canale con questo nome',
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
        description: channelData.description || '',
        type: channelData.type || 'public',
        creator: user.is.pub,
        members: {
          [user.is.pub]: {
            role: 'creator',
            joinedAt: Date.now(),
          },
        },
        createdAt: Date.now(),
      };

      // Salva il canale
      gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .put(channel, (ack) => {
          if (ack.err) {
            callback({ success: false, error: ack.err });
            return;
          }

          // Aggiungi un messaggio di sistema per la creazione del canale
          const messageId = `system_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          const systemMessage = {
            id: messageId,
            type: 'system',
            content: `✨ Canale "${
              channelData.name
            }" creato da ${formatUserName(user.is.pub)}`,
            sender: 'system',
            timestamp: Date.now(),
          };

          gun
            .get(DAPP_NAME)
            .get('channels')
            .get(channelId)
            .get('messages')
            .get(messageId)
            .put(systemMessage);

          callback({ success: true, channel });
        });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  },

  /**
   * Unisciti a un canale
   */
  join: async (channelId, callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      const channel = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('channels')
          .get(channelId)
          .once((data) => resolve(data));
      });

      if (!channel) throw new Error('Canale non trovato');

      // Aggiungi l'utente ai membri del canale
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('members')
        .set({
          pub: user.is.pub,
          role: 'member',
          joined: Date.now(),
        });

      // Aggiungi il canale alla lista dei canali dell'utente
      await gun.user().get('channels').get(channelId).put({
        id: channelId,
        joined: Date.now(),
        role: 'member',
      });

      // Notifica gli altri membri
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('messages')
        .set({
          id: `system_${Date.now()}`,
          type: 'system',
          content: `👋 ${formatUserName(user.is.pub)} si è unito al canale`,
          timestamp: Date.now(),
          sender: 'system',
        });

      return callback({ success: true });
    } catch (error) {
      console.error('Errore partecipazione al canale:', error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Lista solo i canali a cui l'utente è iscritto
   */
  list: async (callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      const channels = [];
      const userChannels = await new Promise((resolve) => {
        const result = [];
        gun
          .user()
          .get('channels')
          .map()
          .once((data, id) => {
            if (data) {
              result.push({ id, ...data });
            }
          });
        setTimeout(() => resolve(result), 1000);
      });

      // Recupera i dettagli completi dei canali
      await Promise.all(
        userChannels.map(async (userChannel) => {
          const channel = await new Promise((resolve) => {
            gun
              .get(DAPP_NAME)
              .get('channels')
              .get(userChannel.id)
              .once((data) => {
                if (data) {
                  resolve({ ...data, id: userChannel.id });
                } else {
                  resolve(null);
                }
              });
          });
          if (channel) {
            channels.push(channel);
          }
        })
      );

      return callback({ success: true, channels });
    } catch (error) {
      console.error('Errore lista canali:', error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Cerca canali pubblici per nome
   */
  search: async (query = '', callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      const results = [];
      const searchQuery = query.toLowerCase();

      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('channels')
          .map()
          .once((channel, id) => {
            if (
              channel &&
              channel.type === 'public' &&
              channel.name &&
              channel.name.toLowerCase().includes(searchQuery)
            ) {
              // Verifica se l'utente è già membro
              const isMember =
                channel.members &&
                Object.values(channel.members).some(
                  (member) => member && member.pub === user.is.pub
                );

              results.push({
                ...channel,
                id,
                isMember,
              });
            }
          });

        setTimeout(resolve, 1000);
      });

      // Ordina i risultati: prima i canali non iscritti, poi per nome
      results.sort((a, b) => {
        if (a.isMember === b.isMember) {
          return a.name.localeCompare(b.name);
        }
        return a.isMember ? 1 : -1;
      });

      return callback({
        success: true,
        channels: results,
      });
    } catch (error) {
      console.error('Errore ricerca canali:', error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Lascia un canale
   */
  leave: async (channelId, callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      const channel = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('channels')
          .get(channelId)
          .once((data) => resolve(data));
      });

      if (!channel) throw new Error('Canale non trovato');

      // Rimuovi l'utente dai membri del canale
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('members')
        .map()
        .once((member, key) => {
          if (member && member.pub === user.is.pub) {
            gun
              .get(DAPP_NAME)
              .get('channels')
              .get(channelId)
              .get('members')
              .get(key)
              .put(null);
          }
        });

      // Rimuovi il canale dalla lista dei canali dell'utente
      await gun.user().get('channels').get(channelId).put(null);

      // Notifica gli altri membri
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('messages')
        .set({
          id: `system_${Date.now()}`,
          type: 'system',
          content: `👋 ${formatUserName(user.is.pub)} ha lasciato il canale`,
          timestamp: Date.now(),
          sender: 'system',
        });

      return callback({ success: true });
    } catch (error) {
      console.error('Errore uscita dal canale:', error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Elimina un canale (solo il creatore può farlo)
   */
  delete: async (channelId, callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      const channel = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('channels')
          .get(channelId)
          .once((data) => resolve(data));
      });

      if (!channel) throw new Error('Canale non trovato');
      if (channel.creator !== user.is.pub) {
        throw new Error('Solo il creatore può eliminare il canale');
      }

      // Rimuovi tutti i messaggi
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('messages')
        .map()
        .once((msg, key) => {
          if (msg) {
            gun
              .get(DAPP_NAME)
              .get('channels')
              .get(channelId)
              .get('messages')
              .get(key)
              .put(null);
          }
        });

      // Rimuovi tutti i membri
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('members')
        .map()
        .once((member, key) => {
          if (member) {
            gun
              .get(DAPP_NAME)
              .get('channels')
              .get(channelId)
              .get('members')
              .get(key)
              .put(null);
          }
        });

      // Rimuovi il canale
      await gun.get(DAPP_NAME).get('channels').get(channelId).put(null);

      return callback({ success: true });
    } catch (error) {
      console.error('Errore eliminazione canale:', error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Cancella i messaggi di un canale (solo il creatore può farlo)
   */
  clearMessages: async (channelId, callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      const channel = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('channels')
          .get(channelId)
          .once((data) => resolve(data));
      });

      if (!channel) throw new Error('Canale non trovato');

      // Verifica che l'utente sia il creatore
      if (channel.creator !== user.is.pub) {
        throw new Error(
          'Solo il creatore può cancellare i messaggi del canale'
        );
      }

      // Cancella tutti i messaggi
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('messages')
        .map()
        .once((msg, key) => {
          if (msg) {
            gun
              .get(DAPP_NAME)
              .get('channels')
              .get(channelId)
              .get('messages')
              .get(key)
              .put(null);
          }
        });

      // Aggiungi messaggio di sistema
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('messages')
        .set({
          id: `system_${Date.now()}`,
          type: 'system',
          content: `🧹 ${formatUserName(
            user.is.pub
          )} ha cancellato tutti i messaggi`,
          timestamp: Date.now(),
          sender: 'system',
        });

      return callback({ success: true });
    } catch (error) {
      console.error('Errore cancellazione messaggi:', error);
      return callback({ success: false, error: error.message });
    }
  },
};

// Funzione per verificare se esiste già un canale con lo stesso nome
const channelExists = async (name) => {
  return new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get('channels')
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
      .get('channels')
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
  const alias = user.is.alias || 'Utente';
  return pub === user.is.pub ? `${alias} (tu)` : alias;
};
