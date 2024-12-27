import { gun, user, DAPP_NAME } from '../useGun.js';
import { userBlocking } from '../blocking/index.js';
import { Observable } from 'rxjs';
import { userUtils } from '../utils/userUtils.js';
import removeFriend from './removeFriend.js';

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
        let found = false;
        gun
          .get(`${DAPP_NAME}/friendships`)
          .map()
          .once((data, key) => {
            if (
              data &&
              ((data.user1 === userPub1 && data.user2 === userPub2) ||
                (data.user1 === userPub2 && data.user2 === userPub1))
            ) {
              found = true;
            }
          });
        setTimeout(() => resolve(found), 2000);
      });

      return friendship;
    } catch (error) {
      console.error('Errore nella verifica amicizia:', error);
      return false;
    }
  },

  /**
   * Verifica se esiste già una richiesta di amicizia pendente
   * @param {string} userPub1 - Chiave pubblica del primo utente
   * @param {string} userPub2 - Chiave pubblica del secondo utente
   * @returns {Promise<boolean>}
   */
  hasPendingRequest: async (userPub1, userPub2) => {
    try {
      const pendingRequest = await new Promise((resolve) => {
        let found = false;
        gun
          .get(`${DAPP_NAME}/all_friend_requests`)
          .map()
          .once((request) => {
            if (
              request &&
              !request._ &&
              ((request.from === userPub1 && request.to === userPub2) ||
                (request.from === userPub2 && request.to === userPub1)) &&
              request.status === 'pending'
            ) {
              found = true;
            }
          });
        setTimeout(() => resolve(found), 2000);
      });

      return pendingRequest;
    } catch (error) {
      console.error('Errore verifica richieste pendenti:', error);
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
      // Verifica blocchi usando userBlocking
      const blockStatus = await userBlocking.getBlockStatus(targetPub);
      if (blockStatus.blocked || blockStatus.blockedBy) {
        return {
          canInteract: false,
          reason: blockStatus.blocked ? 'user_blocked' : 'blocked_by_user',
        };
      }

      // Verifica amicizia solo se non ci sono blocchi
      if (!blockStatus.blocked && !blockStatus.blockedBy) {
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
      // 1. Verifica se l'utente è bloccato
      const blockStatus = await userBlocking.getBlockStatus(targetPub);
      if (blockStatus.blocked || blockStatus.blockedBy) {
        throw new Error('Non puoi inviare richieste a questo utente');
      }

      // 2. Verifica se sono già amici
      const areAlreadyFriends = await friendsService.areFriends(
        user.is.pub,
        targetPub
      );
      if (areAlreadyFriends) {
        // Se sono già amici, aggiorna solo la lista amici locale
        return {
          success: true,
          message: 'Siete già amici',
          alreadyFriends: true,
        };
      }

      // 3. Verifica se esiste già una richiesta pendente
      const hasPending = await friendsService.hasPendingRequest(
        user.is.pub,
        targetPub
      );
      if (hasPending) {
        throw new Error('Esiste già una richiesta di amicizia pendente');
      }

      // 4. Crea un ID univoco per la richiesta
      const requestId = `${user.is.pub}_${targetPub}_${Date.now()}`;

      // 5. Salva la richiesta di amicizia
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
              fromAlias: user.is.alias,
              senderInfo: {
                alias: user.is.alias,
                pub: user.is.pub,
              },
            },
            (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            }
          );
      });

      return {
        success: true,
        message: 'Richiesta di amicizia inviata con successo',
      };
    } catch (error) {
      console.error('Error adding friend request:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  },

  removeFriend,

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
};

export default friendsService;
