import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  revokeChatsCertificate,
  revokeMessagesCertificate,
  friendsCertificates,
  createChatsCertificate,
  createMessagesCertificate,
  createFriendRequestCertificate,
} from '../security/index.js';
import { Observable } from 'rxjs';

// Cache per gli stati di blocco
const blockStatusCache = new Map();
const CACHE_DURATION = 30000; // 30 secondi di cache

export const userBlocking = {
  /**
   * Pulisce la cache per un utente specifico o tutta la cache
   * @param {string} [targetPub] - Chiave pubblica dell'utente da rimuovere dalla cache
   */
  clearCache: (targetPub) => {
    if (targetPub) {
      blockStatusCache.delete(targetPub);
    } else {
      blockStatusCache.clear();
    }
  },

  /**
   * Blocca un utente
   * @param {string} targetPub - Chiave pubblica dell'utente da bloccare
   */
  blockUser: async (targetPub) => {
    if (!user.is) throw new Error('Utente non autenticato');
    if (!targetPub) throw new Error('Utente target non specificato');

    try {
      // 1. Salva il blocco nel nodo dell'utente corrente
      await new Promise((resolve, reject) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('blocked_users')
          .get(targetPub)
          .put(
            {
              timestamp: Date.now(),
              type: 'blocked',
              blocker: user.is.pub,
            },
            (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            }
          );
      });

      // Invalida la cache per questo utente
      userBlocking.clearCache(targetPub);

      // 2. Revoca tutti i certificati
      await Promise.all([
        new Promise((resolve) => revokeChatsCertificate(targetPub, resolve)),
        new Promise((resolve) => revokeMessagesCertificate(targetPub, resolve)),
      ]);

      // 3. Rimuovi l'amicizia se esiste
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('friendships')
          .map()
          .once((friendship, key) => {
            if (
              friendship &&
              ((friendship.user1 === user.is.pub &&
                friendship.user2 === targetPub) ||
                (friendship.user2 === user.is.pub &&
                  friendship.user1 === targetPub))
            ) {
              gun.get(DAPP_NAME).get('friendships').get(key).put(null);
            }
          });
        setTimeout(resolve, 1000);
      });

      // 4. Rimuovi eventuali chat esistenti
      const chatId = [user.is.pub, targetPub].sort().join('_');
      gun.get(DAPP_NAME).get('chats').get(chatId).put(null);

      // 5. Notifica l'utente bloccato
      gun.get(`~${targetPub}`).get('notifications').get('blocks').set({
        type: 'block',
        from: user.is.pub,
        timestamp: Date.now(),
      });

      return { success: true };
    } catch (error) {
      console.error('Errore nel blocco utente:', error);
      throw error;
    }
  },

  /**
   * Sblocca un utente
   * @param {string} targetPub - Chiave pubblica dell'utente da sbloccare
   */
  unblockUser: async (targetPub) => {
    if (!user.is) throw new Error('Utente non autenticato');
    if (!targetPub) throw new Error('Utente target non specificato');

    try {
      // Verifica che l'utente corrente sia quello che ha fatto il blocco
      const blockData = await new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('blocked_users')
          .get(targetPub)
          .once((data) => resolve(data));
      });

      if (!blockData || blockData.blocker !== user.is.pub) {
        throw new Error('Non hai i permessi per sbloccare questo utente');
      }

      // Rimuovi il blocco
      await new Promise((resolve, reject) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('blocked_users')
          .get(targetPub)
          .put(null, (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          });
      });

      // Invalida la cache per questo utente
      userBlocking.clearCache(targetPub);

      // Rigenera tutti i certificati
      await Promise.all([
        createChatsCertificate(targetPub),
        createMessagesCertificate(targetPub),
        createFriendRequestCertificate(targetPub),
      ]);

      // Notifica l'utente sbloccato
      gun.get(`~${targetPub}`).get('notifications').get('blocks').set({
        type: 'unblock',
        from: user.is.pub,
        timestamp: Date.now(),
      });

      return { success: true };
    } catch (error) {
      console.error('Errore nello sblocco utente:', error);
      throw error;
    }
  },

  /**
   * Verifica lo stato di blocco tra due utenti
   * @param {string} targetPub - Chiave pubblica dell'utente da verificare
   */
  getBlockStatus: async (targetPub) => {
    if (!user.is) throw new Error('Utente non autenticato');
    if (!targetPub) throw new Error('Utente target non specificato');

    try {
      // Controlla la cache
      const cachedStatus = blockStatusCache.get(targetPub);
      if (
        cachedStatus &&
        Date.now() - cachedStatus.timestamp < CACHE_DURATION
      ) {
        return cachedStatus.status;
      }

      // Verifica se l'utente corrente ha bloccato il target
      const myBlockData = await new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('blocked_users')
          .get(targetPub)
          .once((data) => {
            resolve(data);
          });
        setTimeout(() => resolve(null), 1000);
      });

      // Verifica se il target ha bloccato l'utente corrente
      const theirBlockData = await new Promise((resolve) => {
        gun
          .user(targetPub)
          .get(DAPP_NAME)
          .get('blocked_users')
          .get(user.is.pub)
          .once((data) => {
            resolve(data);
          });
        setTimeout(() => resolve(null), 1000);
      });

      const status = {
        blocked: !!myBlockData,
        blockedBy: !!theirBlockData,
        canInteract: !myBlockData && !theirBlockData,
        canUnblock: myBlockData?.blocker === user.is.pub,
      };

      // Salva nella cache
      blockStatusCache.set(targetPub, {
        status,
        timestamp: Date.now(),
      });

      return status;
    } catch (error) {
      console.error('Errore nella verifica stato blocco:', error);
      return {
        blocked: false,
        blockedBy: false,
        canInteract: true,
        canUnblock: false,
      };
    }
  },

  /**
   * Osserva i cambiamenti nello stato di blocco
   * @param {string} targetPub - Chiave pubblica dell'utente da osservare
   */
  observeBlockStatus: (targetPub) => {
    if (!user.is) throw new Error('Utente non autenticato');
    if (!targetPub) throw new Error('Utente target non specificato');

    return new Observable((subscriber) => {
      let lastMyStatus = null;
      let lastTheirStatus = null;

      // Osserva i blocchi dell'utente corrente
      const myBlockHandler = gun
        .user()
        .get(DAPP_NAME)
        .get('blocked_users')
        .get(targetPub)
        .on((data) => {
          const newStatus = {
            type: 'my_block_status',
            blocked: !!data,
            canUnblock: data?.blocker === user.is.pub,
          };

          // Emetti solo se lo stato è cambiato
          if (JSON.stringify(newStatus) !== JSON.stringify(lastMyStatus)) {
            lastMyStatus = newStatus;
            subscriber.next(newStatus);
            userBlocking.clearCache(targetPub);
          }
        });

      // Osserva i blocchi dell'utente target
      const theirBlockHandler = gun
        .user(targetPub)
        .get(DAPP_NAME)
        .get('blocked_users')
        .get(user.is.pub)
        .on((data) => {
          const newStatus = {
            type: 'their_block_status',
            blockedBy: !!data,
            canUnblock: false,
          };

          // Emetti solo se lo stato è cambiato
          if (JSON.stringify(newStatus) !== JSON.stringify(lastTheirStatus)) {
            lastTheirStatus = newStatus;
            subscriber.next(newStatus);
            userBlocking.clearCache(targetPub);
          }
        });

      // Cleanup
      return () => {
        if (typeof myBlockHandler === 'function') myBlockHandler();
        if (typeof theirBlockHandler === 'function') theirBlockHandler();
      };
    });
  },

  /**
   * Ottiene la lista degli utenti bloccati
   * @returns {Promise<Array>} Lista degli utenti bloccati
   */
  getBlockedUsers: async () => {
    if (!user.is) throw new Error('Utente non autenticato');

    try {
      const blockedUsers = await new Promise((resolve) => {
        const users = [];
        gun
          .user()
          .get(DAPP_NAME)
          .get('blocked_users')
          .map()
          .once((data, pub) => {
            if (data && data.blocker === user.is.pub) {
              users.push({
                pub,
                timestamp: data.timestamp,
                type: data.type,
              });
            }
          });
        setTimeout(() => resolve(users), 1000);
      });

      return blockedUsers;
    } catch (error) {
      console.error('Errore nel recupero utenti bloccati:', error);
      return [];
    }
  },

  /**
   * Osserva i cambiamenti nella lista degli utenti bloccati
   * @returns {Observable} Observable che emette la lista aggiornata degli utenti bloccati
   */
  observeBlockedUsers: () => {
    if (!user.is) throw new Error('Utente non autenticato');

    return new Observable((subscriber) => {
      const handler = gun
        .user()
        .get(DAPP_NAME)
        .get('blocked_users')
        .map()
        .on((data, pub) => {
          if (data && data.blocker === user.is.pub) {
            subscriber.next({
              type: 'blocked_user',
              pub,
              timestamp: data.timestamp,
              blockType: data.type,
            });
          } else if (data === null && pub !== '_') {
            subscriber.next({
              type: 'unblocked_user',
              pub,
            });
          }
        });

      return () => {
        if (typeof handler === 'function') handler();
      };
    });
  },
};

export default userBlocking;
