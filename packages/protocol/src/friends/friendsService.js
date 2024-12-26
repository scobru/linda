import { gun, user, DAPP_NAME } from '../useGun.js';
import { userBlocking } from '../blocking/index.js';
import { Observable } from 'rxjs';
import { userUtils } from '../utils/userUtils.js';
import {
  revokeChatsCertificate,
  revokeMessagesCertificate,
} from '../security/index.js';

const friendsService = {
  /**
   * Verifica se due utenti sono amici
   * @param {string} userPub1 - Chiave pubblica del primo utente
   * @param {string} userPub2 - Chiave pubblica del secondo utente
   * @returns {Promise<boolean>}
   */
  areFriends: async (userPub1, userPub2) => {
    try {
      const friendship = await new Promise((resolve) => {
        gun
          .get(`${DAPP_NAME}/friendships`)
          .map()
          .once((data, key) => {
            if (
              data &&
              ((data.user1 === userPub1 && data.user2 === userPub2) ||
                (data.user1 === userPub2 && data.user2 === userPub1))
            ) {
              resolve(data);
            }
          });
        setTimeout(() => resolve(null), 2000);
      });

      return !!friendship;
    } catch (error) {
      console.error('Errore nella verifica amicizia:', error);
      return false;
    }
  },

  /**
   * Verifica se è possibile interagire con un utente
   * @param {string} targetPub - Chiave pubblica dell'utente target
   * @returns {Promise<{canInteract: boolean, reason: string}>}
   */
  canInteractWith: async (targetPub) => {
    try {
      // Verifica blocchi
      const blockStatus = await userBlocking.getBlockStatus(targetPub);
      if (blockStatus.blocked || blockStatus.blockedBy) {
        return {
          canInteract: false,
          reason: blockStatus.blocked ? 'user_blocked' : 'blocked_by_user',
        };
      }

      // Verifica amicizia
      const areFriends = await friendsService.areFriends(
        user.is.pub,
        targetPub
      );
      if (!areFriends) {
        return {
          canInteract: false,
          reason: 'not_friends',
        };
      }

      return {
        canInteract: true,
        reason: null,
      };
    } catch (error) {
      console.error('Errore nella verifica interazione:', error);
      return {
        canInteract: false,
        reason: 'error',
      };
    }
  },

  /**
   * Ottiene la lista degli amici di un utente
   * @param {string} userPub - Chiave pubblica dell'utente
   * @returns {Promise<Array>}
   */
  getFriendsList: async (userPub) => {
    try {
      const friends = await new Promise((resolve) => {
        const friendsList = [];
        gun
          .get(`${DAPP_NAME}/friendships`)
          .map()
          .once((data) => {
            if (data && (data.user1 === userPub || data.user2 === userPub)) {
              const friendPub =
                data.user1 === userPub ? data.user2 : data.user1;
              friendsList.push({
                pub: friendPub,
                timestamp: data.timestamp,
                status: 'accepted',
              });
            }
          });
        setTimeout(() => resolve(friendsList), 2000);
      });

      // Verifica lo stato di blocco per ogni amico
      const friendsWithStatus = await Promise.all(
        friends.map(async (friend) => {
          const blockStatus = await userBlocking.getBlockStatus(friend.pub);
          return {
            ...friend,
            blocked: blockStatus.blocked,
            blockedBy: blockStatus.blockedBy,
          };
        })
      );

      return friendsWithStatus;
    } catch (error) {
      console.error('Errore nel recupero amici:', error);
      return [];
    }
  },

  /**
   * Invia una richiesta di amicizia
   * @param {string} targetPub - Chiave pubblica dell'utente target
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  addFriendRequest: async (targetPub) => {
    if (!user.is) {
      throw new Error('User not authenticated');
    }

    try {
      // Crea un ID univoco per la richiesta
      const requestId = `${user.is.pub}_${targetPub}_${Date.now()}`;

      // Salva la richiesta di amicizia
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('all_friend_requests')
          .get(requestId)
          .put(
            {
              from: user.is.pub,
              to: targetPub,
              timestamp: Date.now(),
              status: 'pending',
            },
            (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            }
          );
      });

      return { success: true };
    } catch (error) {
      console.error('Error adding friend request:', error);
      return { success: false, message: error.message };
    }
  },

  /**
   * Rimuove un amico
   * @param {string} targetPub - Chiave pubblica dell'amico da rimuovere
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  removeFriend: async (targetPub) => {
    if (!user.is) {
      throw new Error('User not authenticated');
    }

    try {
      // Revoca tutti i certificati associati
      await Promise.all([
        revokeChatsCertificate(targetPub),
        revokeMessagesCertificate(targetPub),
      ]);

      console.log('Revoca certificati completata');

      // Cerca e rimuovi l'amicizia
      const friendship = await new Promise((resolve) => {
        let found = null;
        gun
          .get(DAPP_NAME)
          .get('friendships')
          .map()
          .once((data, key) => {
            if (
              data &&
              ((data.user1 === user.is.pub && data.user2 === targetPub) ||
                (data.user2 === user.is.pub && data.user1 === targetPub))
            ) {
              found = { key, data };
            }
          });

        setTimeout(() => resolve(found), 1000);
      });

      if (friendship) {
        // Rimuovi l'amicizia
        await new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('friendships')
            .get(friendship.key)
            .put(null, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        });

        // Rimuovi la chat associata
        const chatId = [user.is.pub, targetPub].sort().join('_');
        gun.get(DAPP_NAME).get('chats').get(chatId).put(null);
      }

      return { success: true };
    } catch (error) {
      console.error('Error removing friend:', error);
      return { success: false, message: error.message };
    }
  },

  /**
   * Osserva le richieste di amicizia
   * @returns {Observable} Observable che emette le richieste di amicizia
   */
  observeFriendRequests: () => {
    return new Observable((subscriber) => {
      setTimeout(() => {
        if (!user.is) {
          subscriber.error(new Error('Utente non autenticato'));
          return;
        }

        try {
          // Monitora le richieste in arrivo
          const incomingHandler = gun
            .get(`${DAPP_NAME}/all_friend_requests`)
            .map()
            .on((request) => {
              if (!request || !request.to || request.to !== user.is.pub) return;

              subscriber.next({
                type: 'incoming',
                data: request,
              });
            });

          // Cleanup
          return () => {
            if (typeof incomingHandler === 'function') {
              incomingHandler();
            }
          };
        } catch (error) {
          subscriber.error(error);
        }
      }, 1000);
    });
  },

  /**
   * Osserva la lista amici
   * @returns {Observable} Observable che emette gli aggiornamenti della lista amici
   */
  observeFriendsList: () => {
    return new Observable((subscriber) => {
      setTimeout(() => {
        if (!user.is) {
          subscriber.error(new Error('Utente non autenticato'));
          return;
        }

        try {
          const friendsHandler = gun
            .get(`${DAPP_NAME}/friendships`)
            .map()
            .on(async (friendship) => {
              if (!friendship) return;

              // Verifica se l'utente è coinvolto nell'amicizia
              if (
                friendship.user1 === user.is.pub ||
                friendship.user2 === user.is.pub
              ) {
                const friendPub =
                  friendship.user1 === user.is.pub
                    ? friendship.user2
                    : friendship.user1;

                // Verifica lo stato di blocco
                const blockStatus = await userBlocking.getBlockStatus(
                  friendPub
                );

                subscriber.next({
                  pub: friendPub,
                  timestamp: friendship.timestamp,
                  status: 'accepted',
                  blocked: blockStatus.blocked,
                  blockedBy: blockStatus.blockedBy,
                });
              }
            });

          // Cleanup
          return () => {
            if (typeof friendsHandler === 'function') {
              friendsHandler();
            }
          };
        } catch (error) {
          subscriber.error(error);
        }
      }, 1000);
    });
  },

  /**
   * Osserva gli aggiornamenti di stato degli amici
   * @returns {Observable} Observable che emette gli aggiornamenti di stato degli amici
   */
  observeFriendsStatus: () => {
    return new Observable((subscriber) => {
      if (!user.is) {
        subscriber.error(new Error('Utente non autenticato'));
        return;
      }

      const statusHandler = gun
        .get(`${DAPP_NAME}/users`)
        .map()
        .on((userData, userPub) => {
          if (!userData || !userData.status) return;

          friendsService.areFriends(user.is.pub, userPub).then((isFriend) => {
            if (isFriend) {
              subscriber.next({
                pub: userPub,
                status: userData.status,
                lastSeen: userData.lastSeen,
              });
            }
          });
        });

      // Cleanup
      return () => {
        gun.get(`${DAPP_NAME}/users`).map().off(statusHandler);
      };
    });
  },

  /**
   * Blocca un utente
   * @param {string} targetPub - Chiave pubblica dell'utente da bloccare
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  blockUser: async (targetPub) => {
    if (!user.is) {
      throw new Error('User not authenticated');
    }

    try {
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('friendships')
          .map()
          .once((friendship, id) => {
            if (
              friendship &&
              ((friendship.user1 === targetPub &&
                friendship.user2 === user.is.pub) ||
                (friendship.user2 === targetPub &&
                  friendship.user1 === user.is.pub))
            ) {
              gun
                .get(DAPP_NAME)
                .get('friendships')
                .get(id)
                .get('isBlocked')
                .put(true, (ack) => {
                  if (ack.err) reject(new Error(ack.err));
                  else resolve();
                });
            }
          });
      });

      return { success: true };
    } catch (error) {
      console.error('Error blocking user:', error);
      return { success: false, message: error.message };
    }
  },

  /**
   * Sblocca un utente
   * @param {string} targetPub - Chiave pubblica dell'utente da sbloccare
   * @returns {Promise<{success: boolean, message?: string}>}
   */
  unblockUser: async (targetPub) => {
    if (!user.is) {
      throw new Error('User not authenticated');
    }

    try {
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('friendships')
          .map()
          .once((friendship, id) => {
            if (
              friendship &&
              ((friendship.user1 === targetPub &&
                friendship.user2 === user.is.pub) ||
                (friendship.user2 === targetPub &&
                  friendship.user1 === user.is.pub))
            ) {
              gun
                .get(DAPP_NAME)
                .get('friendships')
                .get(id)
                .get('isBlocked')
                .put(false, (ack) => {
                  if (ack.err) reject(new Error(ack.err));
                  else resolve();
                });
            }
          });
      });

      return { success: true };
    } catch (error) {
      console.error('Error unblocking user:', error);
      return { success: false, message: error.message };
    }
  },
};

export default friendsService;
