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
        gun.get(`${DAPP_NAME}/friendships`)
          .map()
          .once((data, key) => {
            if (data && 
                ((data.user1 === userPub1 && data.user2 === userPub2) ||
                 (data.user1 === userPub2 && data.user2 === userPub1))) {
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
          reason: blockStatus.blocked ? 'user_blocked' : 'blocked_by_user'
        };
      }

      // Verifica amicizia
      const areFriends = await friendsService.areFriends(user.is.pub, targetPub);
      if (!areFriends) {
        return {
          canInteract: false,
          reason: 'not_friends'
        };
      }

      return {
        canInteract: true,
        reason: null
      };
    } catch (error) {
      console.error('Errore nella verifica interazione:', error);
      return {
        canInteract: false,
        reason: 'error'
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
        gun.get(`${DAPP_NAME}/friendships`)
          .map()
          .once((data) => {
            if (data && (data.user1 === userPub || data.user2 === userPub)) {
              const friendPub = data.user1 === userPub ? data.user2 : data.user1;
              friendsList.push({
                pub: friendPub,
                timestamp: data.timestamp,
                status: 'accepted'
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
            blockedBy: blockStatus.blockedBy
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
      if (!user.is) {
        subscriber.error(new Error('Utente non autenticato'));
        return;
      }

      // Monitora le richieste in arrivo
      const incomingHandler = gun
        .get(`${DAPP_NAME}/all_friend_requests`)
        .map()
        .on((request) => {
          if (!request || !request.to || request.to !== user.is.pub) return;
          
          subscriber.next({
            type: 'incoming',
            data: request
          });
        });

      // Monitora le richieste inviate
      const outgoingHandler = gun
        .get(`${DAPP_NAME}/all_friend_requests`)
        .map()
        .on((request) => {
          if (!request || !request.from || request.from !== user.is.pub) return;
          
          subscriber.next({
            type: 'outgoing',
            data: request
          });
        });

      // Cleanup
      return () => {
        gun.get(`${DAPP_NAME}/all_friend_requests`).map().off(incomingHandler);
        gun.get(`${DAPP_NAME}/all_friend_requests`).map().off(outgoingHandler);
      };
    });
  },

  /**
   * Osserva la lista amici
   * @returns {Observable} Observable che emette gli aggiornamenti della lista amici
   */
  observeFriendsList: () => {
    return new Observable((subscriber) => {
      if (!user.is) {
        subscriber.error(new Error('Utente non autenticato'));
        return;
      }

      const friendsHandler = gun
        .get(`${DAPP_NAME}/friendships`)
        .map()
        .on(async (friendship) => {
          if (!friendship) return;
          
          // Verifica se l'utente è coinvolto nell'amicizia
          if (friendship.user1 === user.is.pub || friendship.user2 === user.is.pub) {
            const friendPub = friendship.user1 === user.is.pub ? 
              friendship.user2 : friendship.user1;

            // Verifica lo stato di blocco
            const blockStatus = await userBlocking.getBlockStatus(friendPub);
            
            subscriber.next({
              pub: friendPub,
              timestamp: friendship.timestamp,
              status: 'accepted',
              blocked: blockStatus.blocked,
              blockedBy: blockStatus.blockedBy
            });
          }
        });

      // Cleanup
      return () => {
        gun.get(`${DAPP_NAME}/friendships`).map().off(friendsHandler);
      };
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

          friendsService.areFriends(user.is.pub, userPub).then(isFriend => {
            if (isFriend) {
              subscriber.next({
                pub: userPub,
                status: userData.status,
                lastSeen: userData.lastSeen
              });
            }
          });
        });

      // Cleanup
      return () => {
        gun.get(`${DAPP_NAME}/users`).map().off(statusHandler);
      };
    });
  }
};

export default friendsService;
