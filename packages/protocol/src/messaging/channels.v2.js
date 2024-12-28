import { gun, user, DAPP_NAME } from '../useGun.js';

export const channelsV2 = {
  /**
   * Crea un nuovo canale
   */
  create: async (channelData, callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      const channelId = `channel_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const channel = {
        id: channelId,
        name: channelData.name,
        description: channelData.description,
        creator: user.is.pub,
        created: Date.now(),
        members: {},
        messages: {},
        type: channelData.type || 'public',
      };

      await gun.get(DAPP_NAME).get('channels').get(channelId).put(channel);

      // Aggiungi il creatore come primo membro
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('members')
        .set({
          pub: user.is.pub,
          role: 'admin',
          joined: Date.now(),
        });

      return callback({ success: true, channel });
    } catch (error) {
      console.error('Errore creazione canale:', error);
      return callback({ success: false, error: error.message });
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
      if (channel.type === 'private') throw new Error('Canale privato');

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

      return callback({ success: true });
    } catch (error) {
      console.error('Errore partecipazione al canale:', error);
      return callback({ success: false, error: error.message });
    }
  },

  /**
   * Lista tutti i canali pubblici
   */
  list: async (callback = () => {}) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      const channels = [];

      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('channels')
          .map()
          .once((channel, id) => {
            if (channel && channel.type === 'public') {
              channels.push({ ...channel, id });
            }
          });

        // Diamo un po' di tempo per raccogliere i risultati
        setTimeout(resolve, 1000);
      });

      return callback({ success: true, channels });
    } catch (error) {
      console.error('Errore lista canali:', error);
      return callback({ success: false, error: error.message });
    }
  },
};
