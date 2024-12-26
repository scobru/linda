import { gun, user, DAPP_NAME } from '../useGun.js';
import { userBlocking } from '../blocking/index.js';
import { Observable } from 'rxjs';

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
   * Osserva le richieste di amicizia
   * @returns {Observable} Observable che emette le richieste di amicizia
   */
  observeFriendRequests: () => {
    return new Observable((subscriber) => {
      // Aggiungi un delay per permettere l'inizializzazione
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
      }, 1000); // Delay di 1 secondo
    });
  },

  /**
   * Osserva la lista amici
   * @returns {Observable} Observable che emette gli aggiornamenti della lista amici
   */
  observeFriendsList: () => {
    return new Observable((subscriber) => {
      // Aggiungi un delay per permettere l'inizializzazione
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
      }, 1000); // Delay di 1 secondo
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
   * Migra le amicizie esistenti aggiungendo i dati mancanti
   * @returns {Promise<{success: boolean, message: string}>}
   */
  migrateExistingFriendships: async () => {
    try {
      if (!user?.is) {
        throw new Error('Utente non autenticato');
      }

      console.log('Inizio migrazione amicizie esistenti...');

      // Recupera tutte le amicizie esistenti
      const friendships = await new Promise((resolve) => {
        const list = [];
        gun
          .get(DAPP_NAME)
          .get('friendships')
          .map()
          .once((friendship) => {
            if (
              friendship &&
              (friendship.user1 === user.is.pub ||
                friendship.user2 === user.is.pub)
            ) {
              list.push(friendship);
            }
          });
        setTimeout(() => resolve(list), 2000);
      });

      console.log('Amicizie trovate:', friendships.length);

      // Per ogni amicizia
      for (const friendship of friendships) {
        const friendPub =
          friendship.user1 === user.is.pub
            ? friendship.user2
            : friendship.user1;

        // Recupera i dati dell'amico
        const friendData = await new Promise((resolve) => {
          gun.get(`~${friendPub}`).once((data) => {
            resolve(data);
          });
        });

        if (friendData) {
          console.log('Aggiornamento dati per amico:', friendPub);

          // Salva i dati dell'amico in userList
          await gun
            .get(DAPP_NAME)
            .get('userList')
            .get('users')
            .get(friendPub)
            .put({
              pub: friendPub,
              alias: friendData.alias,
              displayName: friendData.alias,
              lastSeen: Date.now(),
              timestamp: Date.now(),
            });

          // Aggiorna il record di amicizia con gli alias
          const updatedFriendship = {
            ...friendship,
            user1Alias:
              friendship.user1 === user.is.pub
                ? user.is.alias
                : friendData.alias,
            user2Alias:
              friendship.user2 === user.is.pub
                ? user.is.alias
                : friendData.alias,
            chatId: [friendship.user1, friendship.user2].sort().join('_'),
          };

          await gun
            .get(DAPP_NAME)
            .get('friendships')
            .get(friendship.created)
            .put(updatedFriendship);

          // Assicurati che esista la chat
          const chatData = {
            id: updatedFriendship.chatId,
            created: friendship.created || Date.now(),
            status: 'active',
            user1: friendship.user1,
            user2: friendship.user2,
            type: 'private',
          };

          await gun
            .get(DAPP_NAME)
            .get('chats')
            .get(updatedFriendship.chatId)
            .put(chatData);
        }
      }

      // Salva anche i dati dell'utente corrente
      await gun
        .get(DAPP_NAME)
        .get('userList')
        .get('users')
        .get(user.is.pub)
        .put({
          pub: user.is.pub,
          alias: user.is.alias,
          displayName: user.is.alias,
          lastSeen: Date.now(),
          timestamp: Date.now(),
        });

      console.log('Migrazione completata con successo');
      return { success: true, message: 'Migrazione completata' };
    } catch (error) {
      console.error('Errore durante la migrazione:', error);
      return { success: false, message: error.message };
    }
  },
};

export default friendsService;
