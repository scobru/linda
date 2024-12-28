import { gun, user, DAPP_NAME } from '../useGun.js';
import { updateGlobalMetrics } from '../system/systemService.js';

/**
 * Nuova implementazione delle board con struttura dati ottimizzata
 * Struttura in Gun:
 * - boards/
 *   - metadata/
 *     - {boardId}/
 *       - name
 *       - description
 *       - creator
 *       - created
 *       - settings
 *   - members/
 *     - {boardId}/
 *       - {userPub}: { role: 'reader' | 'writer' | 'admin' }
 *   - posts/
 *     - {boardId}/
 *       - {postId}/
 *         - content
 *         - author
 *         - timestamp
 *         - attachments
 */

export const boardsV2 = {
  /**
   * Crea una nuova board
   */
  create: async (boardData) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    const { name, description = '', settings = {} } = boardData;

    try {
      // Verifica nome univoco
      const exists = await boardsV2.nameExists(name);
      if (exists) {
        throw new Error('Una board con questo nome esiste già');
      }

      const boardId = `bd_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Metadata della board
      const metadata = {
        id: boardId,
        name,
        description,
        creator: user.is.pub,
        created: Date.now(),
        type: 'board',
        settings: {
          isPublic: true,
          requireApproval: false,
          allowComments: true,
          ...settings,
        },
      };

      // Salva metadata
      await gun
        .get(DAPP_NAME)
        .get('boards')
        .get('metadata')
        .get(boardId)
        .put(metadata);

      // Aggiungi creatore come primo membro con ruolo admin
      await gun
        .get(DAPP_NAME)
        .get('boards')
        .get('members')
        .get(boardId)
        .get(user.is.pub)
        .put({ role: 'admin', joined: Date.now() });

      // Aggiungi alla lista board dell'utente
      await gun.user().get('boards').get(boardId).put({
        joined: Date.now(),
        role: 'admin',
      });

      // Aggiorna metriche
      await updateGlobalMetrics('totalBoards', 1);

      return {
        success: true,
        boardId,
        metadata,
      };
    } catch (error) {
      console.error('Errore creazione board:', error);
      throw error;
    }
  },

  /**
   * Unisciti a una board
   */
  join: async (boardId) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      // Verifica esistenza board
      const metadata = await boardsV2.getMetadata(boardId);
      if (!metadata) {
        throw new Error('Board non trovata');
      }

      // Verifica se già membro
      const membership = await boardsV2.getMemberRole(boardId, user.is.pub);
      if (membership) {
        throw new Error('Sei già membro di questa board');
      }

      // Se la board richiede approvazione, imposta ruolo pending
      const role = metadata.settings.requireApproval ? 'pending' : 'reader';

      // Aggiungi alla lista membri
      await gun
        .get(DAPP_NAME)
        .get('boards')
        .get('members')
        .get(boardId)
        .get(user.is.pub)
        .put({ role, joined: Date.now() });

      // Aggiungi alla lista board dell'utente
      await gun.user().get('boards').get(boardId).put({
        joined: Date.now(),
        role,
      });

      return {
        success: true,
        metadata,
        role,
      };
    } catch (error) {
      console.error('Errore partecipazione board:', error);
      throw error;
    }
  },

  /**
   * Lascia una board
   */
  leave: async (boardId) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      // Verifica se membro
      const role = await boardsV2.getMemberRole(boardId, user.is.pub);
      if (!role) {
        throw new Error('Non sei membro di questa board');
      }

      // Non permettere all'admin di lasciare se è l'unico
      if (role === 'admin') {
        const admins = await boardsV2.getMembersByRole(boardId, 'admin');
        if (admins.length === 1) {
          throw new Error(
            "Non puoi lasciare la board: sei l'unico amministratore"
          );
        }
      }

      // Rimuovi dalla lista membri
      await gun
        .get(DAPP_NAME)
        .get('boards')
        .get('members')
        .get(boardId)
        .get(user.is.pub)
        .put(null);

      // Rimuovi dalla lista board dell'utente
      await gun.user().get('boards').get(boardId).put(null);

      return { success: true };
    } catch (error) {
      console.error('Errore abbandono board:', error);
      throw error;
    }
  },

  /**
   * Elimina una board (solo per admin)
   */
  delete: async (boardId) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      // Verifica permessi
      const role = await boardsV2.getMemberRole(boardId, user.is.pub);
      if (role !== 'admin') {
        throw new Error('Non autorizzato a eliminare questa board');
      }

      // Elimina metadata
      await gun
        .get(DAPP_NAME)
        .get('boards')
        .get('metadata')
        .get(boardId)
        .put(null);

      // Elimina membri
      await gun
        .get(DAPP_NAME)
        .get('boards')
        .get('members')
        .get(boardId)
        .put(null);

      // Elimina posts
      await gun
        .get(DAPP_NAME)
        .get('boards')
        .get('posts')
        .get(boardId)
        .put(null);

      // Aggiorna metriche
      await updateGlobalMetrics('totalBoards', -1);

      return { success: true };
    } catch (error) {
      console.error('Errore eliminazione board:', error);
      throw error;
    }
  },

  /**
   * Ottieni il ruolo di un membro
   */
  getMemberRole: async (boardId, userPub) => {
    return new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('boards')
        .get('members')
        .get(boardId)
        .get(userPub)
        .once((membership) => {
          resolve(membership?.role || null);
        });
    });
  },

  /**
   * Ottieni membri con un determinato ruolo
   */
  getMembersByRole: async (boardId, targetRole) => {
    return new Promise((resolve) => {
      const members = [];

      gun
        .get(DAPP_NAME)
        .get('boards')
        .get('members')
        .get(boardId)
        .map()
        .once((membership, userPub) => {
          if (membership?.role === targetRole) {
            members.push({
              pub: userPub,
              ...membership,
            });
          }
        });

      setTimeout(() => resolve(members), 500);
    });
  },

  /**
   * Cambia ruolo di un membro (solo admin)
   */
  changeMemberRole: async (boardId, targetUserPub, newRole) => {
    if (!user?.is) throw new Error('Utente non autenticato');

    try {
      // Verifica permessi
      const currentUserRole = await boardsV2.getMemberRole(
        boardId,
        user.is.pub
      );
      if (currentUserRole !== 'admin') {
        throw new Error('Non autorizzato a cambiare ruoli');
      }

      // Non permettere di cambiare il proprio ruolo se si è l'unico admin
      if (targetUserPub === user.is.pub && newRole !== 'admin') {
        const admins = await boardsV2.getMembersByRole(boardId, 'admin');
        if (admins.length === 1) {
          throw new Error(
            "Non puoi cambiare il tuo ruolo: sei l'unico amministratore"
          );
        }
      }

      // Aggiorna ruolo
      await gun
        .get(DAPP_NAME)
        .get('boards')
        .get('members')
        .get(boardId)
        .get(targetUserPub)
        .get('role')
        .put(newRole);

      return { success: true };
    } catch (error) {
      console.error('Errore cambio ruolo:', error);
      throw error;
    }
  },

  /**
   * Ottieni metadata della board
   */
  getMetadata: async (boardId) => {
    return new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('boards')
        .get('metadata')
        .get(boardId)
        .once((metadata) => {
          resolve(metadata);
        });
    });
  },

  /**
   * Verifica se esiste una board con lo stesso nome
   */
  nameExists: async (name) => {
    return new Promise((resolve) => {
      let exists = false;
      gun
        .get(DAPP_NAME)
        .get('boards')
        .get('metadata')
        .map()
        .once((metadata) => {
          if (metadata?.name?.toLowerCase() === name.toLowerCase()) {
            exists = true;
          }
        });

      setTimeout(() => resolve(exists), 500);
    });
  },

  /**
   * Cerca board
   */
  search: async (query, options = {}) => {
    const { limit = 20, offset = 0 } = options;

    return new Promise((resolve) => {
      const results = [];

      gun
        .get(DAPP_NAME)
        .get('boards')
        .get('metadata')
        .map()
        .once((metadata) => {
          if (metadata?.name?.toLowerCase().includes(query.toLowerCase())) {
            results.push(metadata);
          }
        });

      setTimeout(() => {
        const sorted = results.sort((a, b) => b.created - a.created);
        const paginated = sorted.slice(offset, offset + limit);
        resolve(paginated);
      }, 500);
    });
  },
};
