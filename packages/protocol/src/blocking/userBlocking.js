import { gun, user, DAPP_NAME } from '../useGun.js';
import { Observable } from 'rxjs';
import { updateGlobalMetrics } from '../system/systemService.js';

const userBlocking = {
  /**
   * Blocca un utente
   * @param {string} targetPub - Chiave pubblica dell'utente da bloccare
   * @returns {Promise<{success: boolean, message: string}>}
   */
  blockUser: async (targetPub) => {
    if (!user.is) {
      return { success: false, message: 'Utente non autenticato' };
    }

    try {
      const blockData = {
        timestamp: Date.now(),
        status: 'blocked',
        reason: 'user_blocked'
      };

      // Aggiorna tutti i punti di storage
      await Promise.all([
        // Database principale
        new Promise((resolve, reject) => {
          gun.get(`${DAPP_NAME}/users`)
            .get(user.is.pub)
            .get('blocked')
            .get(targetPub)
            .put(blockData, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        }),

        // Profilo utente
        new Promise((resolve, reject) => {
          user.get('profile')
            .get('blocked')
            .set({
              pub: targetPub,
              ...blockData
            }, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        }),

        // Stato globale
        new Promise((resolve, reject) => {
          gun.get(`${DAPP_NAME}/blockStatus`)
            .get(`${user.is.pub}_${targetPub}`)
            .put({
              blocker: user.is.pub,
              blocked: targetPub,
              ...blockData
            }, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        })
      ]);

      console.log(`Utente ${targetPub} bloccato con successo`);
      updateGlobalMetrics('totalUsersBlocked', 1);
      return { success: true, message: 'Utente bloccato con successo' };
    } catch (error) {
      console.error('Errore nel blocco:', error);
      return { success: false, message: error.message };
    }
  },

  /**
   * Sblocca un utente
   * @param {string} targetPub - Chiave pubblica dell'utente da sbloccare
   * @returns {Promise<{success: boolean, message: string}>}
   */
  unblockUser: async (targetPub) => {
    if (!user.is) {
      return { success: false, message: 'Utente non autenticato' };
    }

    try {
      // Rimuovi il blocco da tutti i punti di storage
      await Promise.all([
        // Database principale
        new Promise((resolve) => {
          gun.get(`${DAPP_NAME}/users`)
            .get(user.is.pub)
            .get('blocked')
            .get(targetPub)
            .put(null, resolve);
        }),

        // Profilo utente
        new Promise((resolve) => {
          user.get('profile')
            .get('blocked')
            .map()
            .once((data, key) => {
              if (data && data.pub === targetPub) {
                user.get('profile')
                  .get('blocked')
                  .get(key)
                  .put(null);
              }
            });
          setTimeout(resolve, 1000);
        }),

        // Stato globale
        new Promise((resolve) => {
          gun.get(`${DAPP_NAME}/blockStatus`)
            .get(`${user.is.pub}_${targetPub}`)
            .put({
              blocker: user.is.pub,
              blocked: targetPub,
              status: 'unblocked',
              timestamp: Date.now()
            }, resolve);
        })
      ]);

      console.log(`Utente ${targetPub} sbloccato con successo`);
      return { success: true, message: 'Utente sbloccato con successo' };
    } catch (error) {
      console.error('Errore nello sblocco:', error);
      return { success: false, message: error.message };
    }
  },

  /**
   * Verifica se un utente è bloccato
   * @param {string} targetPub - Chiave pubblica dell'utente da verificare
   * @returns {Promise<boolean>}
   */
  isBlocked: async (targetPub) => {
    if (!user.is) return false;

    try {
      // Verifica nel database principale
      const blockStatus = await new Promise((resolve) => {
        gun.get(`${DAPP_NAME}/users`)
          .get(user.is.pub)
          .get('blocked')
          .get(targetPub)
          .once((data) => {
            resolve(data);
          });
      });

      // Se non trovato nel database principale, verifica nel profilo
      if (!blockStatus) {
        const profileBlock = await new Promise((resolve) => {
          let found = false;
          user.get('profile').get('blocked').map().once((blocked) => {
            if (blocked && blocked.pub === targetPub && blocked.status === 'blocked') {
              found = true;
            }
          });
          setTimeout(() => resolve(found), 500);
        });
        return profileBlock;
      }

      return !!blockStatus && blockStatus.status === 'blocked';
    } catch (error) {
      console.error('Errore nella verifica del blocco:', error);
      return false;
    }
  },

  /**
   * Verifica se l'utente corrente è stato bloccato da un altro utente
   * @param {string} targetPub - Chiave pubblica dell'utente da verificare
   * @returns {Promise<boolean>}
   */
  isBlockedBy: async (targetPub) => {
    if (!user.is) return false;

    try {
      // Verifica nel database principale
      const blockStatus = await new Promise((resolve) => {
        gun.get(`${DAPP_NAME}/users`)
          .get(targetPub)
          .get('blocked')
          .get(user.is.pub)
          .once((data) => {
            resolve(data);
          });
      });

      // Se non trovato nel database principale, verifica nel profilo dell'altro utente
      if (!blockStatus) {
        const profileBlock = await new Promise((resolve) => {
          let found = false;
          gun.user(targetPub)
            .get('profile')
            .get('blocked')
            .map()
            .once((blocked) => {
              if (blocked && blocked.pub === user.is.pub && blocked.status === 'blocked') {
                found = true;
              }
            });
          setTimeout(() => resolve(found), 500);
        });
        return profileBlock;
      }

      return !!blockStatus && blockStatus.status === 'blocked';
    } catch (error) {
      console.error('Errore nella verifica del blocco:', error);
      return false;
    }
  },

  /**
   * Verifica lo stato di blocco bidirezionale tra due utenti
   * @param {string} targetPub - Chiave pubblica dell'utente da verificare
   * @returns {Promise<{blocked: boolean, blockedBy: boolean}>}
   */
  getBlockStatus: async (targetPub) => {
    if (!user.is) {
      return { blocked: false, blockedBy: false };
    }

    try {
      const [blocked, blockedBy] = await Promise.all([
        userBlocking.isBlocked(targetPub),
        userBlocking.isBlockedBy(targetPub)
      ]);

      return { blocked, blockedBy };
    } catch (error) {
      console.error('Errore nella verifica dello stato di blocco:', error);
      return { blocked: false, blockedBy: false };
    }
  },

  /**
   * Verifica se è possibile interagire tra due utenti
   * @param {string} targetPub - Chiave pubblica dell'utente da verificare
   * @returns {Promise<{canInteract: boolean, reason: string}>}
   */
  canInteract: async (targetPub) => {
    try {
      const { blocked, blockedBy } = await userBlocking.getBlockStatus(targetPub);

      if (blocked) {
        return { canInteract: false, reason: 'user_blocked' };
      }
      if (blockedBy) {
        return { canInteract: false, reason: 'blocked_by_user' };
      }

      return { canInteract: true, reason: null };
    } catch (error) {
      console.error('Errore nella verifica delle interazioni:', error);
      return { canInteract: false, reason: 'error' };
    }
  },

  /**
   * Osserva lo stato di blocco di un utente
   * @param {string} targetPub - Chiave pubblica dell'utente da osservare
   * @returns {Observable} Observable che emette gli aggiornamenti dello stato di blocco
   */
  observeBlockStatus: (targetPub) => {
    return new Observable((subscriber) => {
      if (!user.is) {
        subscriber.error(new Error('Utente non autenticato'));
        return;
      }

      // Osserva il database principale
      const mainHandler = gun.get(`${DAPP_NAME}/users`)
        .get(user.is.pub)
        .get('blocked')
        .get(targetPub)
        .on((data) => {
          subscriber.next({
            isBlocked: !!data && data.status === 'blocked',
            source: 'main'
          });
        });

      // Osserva il profilo utente
      const profileHandler = user.get('profile')
        .get('blocked')
        .map()
        .on((data) => {
          if (data && data.pub === targetPub) {
            subscriber.next({
              isBlocked: data.status === 'blocked',
              source: 'profile'
            });
          }
        });

      // Cleanup
      return () => {
        gun.get(`${DAPP_NAME}/users`)
          .get(user.is.pub)
          .get('blocked')
          .get(targetPub)
          .off();
        user.get('profile')
          .get('blocked')
          .map()
          .off();
      };
    });
  },

  /**
   * Ottiene la lista degli utenti bloccati
   * @returns {Promise<Array>} Lista degli utenti bloccati
   */
  getBlockedUsers: async () => {
    if (!user.is) {
      return [];
    }

    try {
      // Ottieni i blocchi dal database principale
      const mainBlocks = await new Promise((resolve) => {
        const blockedUsers = [];
        gun.get(`${DAPP_NAME}/users`)
          .get(user.is.pub)
          .get('blocked')
          .map()
          .once((data, key) => {
            if (data && data.status === 'blocked') {
              blockedUsers.push({
                pub: key,
                timestamp: data.timestamp,
                reason: data.reason,
                source: 'main'
              });
            }
          });
        setTimeout(() => resolve(blockedUsers), 1000);
      });

      // Ottieni i blocchi dal profilo utente
      const profileBlocks = await new Promise((resolve) => {
        const blockedUsers = [];
        user.get('profile')
          .get('blocked')
          .map()
          .once((data) => {
            if (data && data.status === 'blocked') {
              blockedUsers.push({
                pub: data.pub,
                timestamp: data.timestamp,
                reason: data.reason,
                source: 'profile'
              });
            }
          });
        setTimeout(() => resolve(blockedUsers), 1000);
      });

      // Combina e deduplicizza i risultati
      const allBlocks = [...mainBlocks, ...profileBlocks];
      const uniqueBlocks = allBlocks.reduce((acc, block) => {
        if (!acc.find(b => b.pub === block.pub)) {
          acc.push(block);
        }
        return acc;
      }, []);

      // Ordina per timestamp decrescente
      return uniqueBlocks.sort((a, b) => b.timestamp - a.timestamp);

    } catch (error) {
      console.error('Errore nel recupero degli utenti bloccati:', error);
      return [];
    }
  },

  /**
   * Osserva la lista degli utenti bloccati
   * @returns {Observable} Observable che emette gli aggiornamenti della lista di blocco
   */
  observeBlockedUsers: () => {
    return new Observable((subscriber) => {
      if (!user.is) {
        subscriber.error(new Error('Utente non autenticato'));
        return;
      }

      const emitBlockedUsers = async () => {
        const blockedUsers = await userBlocking.getBlockedUsers();
        subscriber.next(blockedUsers);
      };

      // Osserva i cambiamenti nel database principale
      const mainHandler = gun.get(`${DAPP_NAME}/users`)
        .get(user.is.pub)
        .get('blocked')
        .map()
        .on(() => {
          emitBlockedUsers();
        });

      // Osserva i cambiamenti nel profilo
      const profileHandler = user.get('profile')
        .get('blocked')
        .map()
        .on(() => {
          emitBlockedUsers();
        });

      // Emetti la lista iniziale
      emitBlockedUsers();

      // Cleanup
      return () => {
        gun.get(`${DAPP_NAME}/users`)
          .get(user.is.pub)
          .get('blocked')
          .map()
          .off();
        user.get('profile')
          .get('blocked')
          .map()
          .off();
      };
    });
  }
};

export default userBlocking;
