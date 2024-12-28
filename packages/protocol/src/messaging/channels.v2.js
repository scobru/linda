import { gun, user, DAPP_NAME } from '../useGun.js';
import { updateGlobalMetrics } from '../system/systemService.js';

/**
 * Nuova implementazione dei canali con struttura dati ottimizzata
 * Struttura in Gun:
 * - channels/
 *   - metadata/
 *     - {channelId}/
 *       - name
 *       - description
 *       - creator
 *       - created
 *       - settings
 *   - members/
 *     - {channelId}/
 *       - {userPub}: true
 *   - messages/
 *     - {channelId}/
 *       - {messageId}/
 *         - content
 *         - sender
 *         - timestamp
 */

export const channelsV2 = {
  /**
   * Crea un nuovo canale
   */
  create: async (channelData) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    const { name, description = '', settings = {} } = channelData;

    try {
      // Verifica nome univoco
      const exists = await channelsV2.nameExists(name);
      if (exists) {
        throw new Error('Un canale con questo nome esiste già');
      }

      const channelId = `ch_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Metadata del canale
      const metadata = {
        id: channelId,
        name,
        description,
        creator: user.is.pub,
        created: Date.now(),
        type: 'channel',
        settings: {
          isPublic: true,
          canWrite: true,
          ...settings,
        },
      };

      // Salva metadata
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get('metadata')
        .get(channelId)
        .put(metadata);

      // Aggiungi creatore come primo membro
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get('members')
        .get(channelId)
        .get(user.is.pub)
        .put(true);

      // Aggiungi alla lista canali dell'utente
      await gun.user().get('channels').get(channelId).put({
        joined: Date.now(),
        role: 'creator',
      });

      // Aggiorna metriche
      await updateGlobalMetrics('totalChannels', 1);

      return {
        success: true,
        channelId,
        metadata,
      };
    } catch (error) {
      console.error('Errore creazione canale:', error);
      throw error;
    }
  },

  /**
   * Unisciti a un canale
   */
  join: async (channelId) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      // Verifica esistenza canale
      const metadata = await channelsV2.getMetadata(channelId);
      if (!metadata) {
        throw new Error('Canale non trovato');
      }

      // Verifica se già membro
      const isMember = await channelsV2.isMember(channelId, user.is.pub);
      if (isMember) {
        throw new Error('Sei già membro di questo canale');
      }

      // Aggiungi alla lista membri
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get('members')
        .get(channelId)
        .get(user.is.pub)
        .put(true);

      // Aggiungi alla lista canali dell'utente
      await gun.user().get('channels').get(channelId).put({
        joined: Date.now(),
        role: 'member',
      });

      return {
        success: true,
        metadata,
      };
    } catch (error) {
      console.error('Errore partecipazione canale:', error);
      throw error;
    }
  },

  /**
   * Lascia un canale
   */
  leave: async (channelId) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      // Verifica se membro
      const isMember = await channelsV2.isMember(channelId, user.is.pub);
      if (!isMember) {
        throw new Error('Non sei membro di questo canale');
      }

      // Rimuovi dalla lista membri
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get('members')
        .get(channelId)
        .get(user.is.pub)
        .put(null);

      // Rimuovi dalla lista canali dell'utente
      await gun.user().get('channels').get(channelId).put(null);

      return { success: true };
    } catch (error) {
      console.error('Errore abbandono canale:', error);
      throw error;
    }
  },

  /**
   * Elimina un canale (solo per il creatore)
   */
  delete: async (channelId) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      // Verifica permessi
      const metadata = await channelsV2.getMetadata(channelId);
      if (!metadata || metadata.creator !== user.is.pub) {
        throw new Error('Non autorizzato a eliminare questo canale');
      }

      // Elimina metadata
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get('metadata')
        .get(channelId)
        .put(null);

      // Elimina membri
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get('members')
        .get(channelId)
        .put(null);

      // Elimina messaggi
      await gun
        .get(DAPP_NAME)
        .get('channels')
        .get('messages')
        .get(channelId)
        .put(null);

      // Aggiorna metriche
      await updateGlobalMetrics('totalChannels', -1);

      return { success: true };
    } catch (error) {
      console.error('Errore eliminazione canale:', error);
      throw error;
    }
  },

  /**
   * Verifica se un utente è membro
   */
  isMember: async (channelId, userPub) => {
    return new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('channels')
        .get('members')
        .get(channelId)
        .get(userPub)
        .once((isMember) => {
          resolve(!!isMember);
        });
    });
  },

  /**
   * Ottieni metadata del canale
   */
  getMetadata: async (channelId) => {
    return new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('channels')
        .get('metadata')
        .get(channelId)
        .once((metadata) => {
          resolve(metadata);
        });
    });
  },

  /**
   * Verifica se esiste un canale con lo stesso nome
   */
  nameExists: async (name) => {
    return new Promise((resolve) => {
      let exists = false;
      gun
        .get(DAPP_NAME)
        .get('channels')
        .get('metadata')
        .map()
        .once((metadata) => {
          if (metadata?.name?.toLowerCase() === name.toLowerCase()) {
            exists = true;
          }
        });

      // Timeout per assicurarsi di controllare tutti i canali
      setTimeout(() => resolve(exists), 500);
    });
  },

  /**
   * Cerca canali
   */
  search: async (query, options = {}) => {
    const { limit = 20, offset = 0 } = options;

    return new Promise((resolve) => {
      const results = [];

      gun
        .get(DAPP_NAME)
        .get('channels')
        .get('metadata')
        .map()
        .once((metadata) => {
          if (metadata?.name?.toLowerCase().includes(query.toLowerCase())) {
            results.push(metadata);
          }
        });

      // Timeout per raccogliere tutti i risultati
      setTimeout(() => {
        // Ordina per data creazione (più recenti prima)
        const sorted = results.sort((a, b) => b.created - a.created);
        // Applica paginazione
        const paginated = sorted.slice(offset, offset + limit);
        resolve(paginated);
      }, 500);
    });
  },

  /**
   * Ottieni lista membri di un canale
   */
  getMembers: async (channelId) => {
    return new Promise((resolve) => {
      const members = new Set();

      gun
        .get(DAPP_NAME)
        .get('channels')
        .get('members')
        .get(channelId)
        .map()
        .once((isMember, userPub) => {
          if (isMember) {
            members.add(userPub);
          }
        });

      setTimeout(() => resolve(Array.from(members)), 500);
    });
  },
};
