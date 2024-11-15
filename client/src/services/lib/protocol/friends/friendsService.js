import { gun, user } from '../../../state';
import { Observable } from 'rxjs';

const LOCK_TIMEOUT = 10000; // 10 secondi invece di 30

const acquireLock = async (lockKey) => {
  const lock = await gun.get('locks').get(lockKey).once();
  if (lock && Date.now() - lock.timestamp < LOCK_TIMEOUT) {
    throw new Error('Operazione in corso, riprova più tardi');
  }
  
  await gun.get('locks').get(lockKey).put({
    timestamp: Date.now(),
    user: user.is.pub
  });
};

const releaseLock = async (lockKey) => {
  await gun.get('locks').get(lockKey).put(null);
};

const friendsService = {
  // Osservabile per monitorare le richieste di amicizia
  observeFriendRequests: () => {
    return new Observable((subscriber) => {
      if (!user.is) {
        subscriber.error(new Error('User not authenticated'));
        return;
      }

      console.log('Starting friend requests monitoring');
      const processedRequests = new Set();

      const unsub = gun.get('all_friend_requests')
        .map()
        .on((request) => {
          if (!request || !request.to || request.to !== user.is.pub) return;
          
          const requestId = `${request.from}-${request.timestamp}`;
          if (processedRequests.has(requestId)) return;
          
          processedRequests.add(requestId);
          subscriber.next({
            pub: request.from,
            alias: request.data?.senderInfo?.alias || 
                   request.data?.alias || 
                   request.senderInfo?.alias || 
                   request.alias || 
                   'Sconosciuto',
            timestamp: request.timestamp,
            data: request.data,
            senderInfo: request.data?.senderInfo || request.senderInfo
          });
        });

      return () => {
        console.log('Cleaning up friend requests monitoring');
        if (typeof unsub === 'function') unsub();
        processedRequests.clear();
      };
    });
  },

  // Osservabile per monitorare la lista amici
  observeFriendsList: () => {
    return new Observable((subscriber) => {
      if (!user.is) {
        subscriber.error(new Error('User not authenticated'));
        return;
      }

      const processedFriends = new Set();
      const emittedFriends = new Map();

      // Funzione per emettere un amico
      const emitFriend = (friendData, userData) => {
        const friend = {
          pub: friendData.pub,
          alias: userData?.alias || friendData.alias || 'Unknown',
          added: friendData.added || friendData.timestamp || Date.now(),
          chatId: friendData.chatId,
          isFriend: true,
          type: 'friend'
        };

        const key = `${friend.pub}-${friend.added}`;
        if (!emittedFriends.has(key)) {
          emittedFriends.set(key, friend);
          subscriber.next(friend);
        }
      };

      // Monitora friendships
      const unsubFriendships = gun.get('friendships')
        .map()
        .on((friendship, id) => {
          if (!friendship) return;
          
          if (friendship.user1 === user.is.pub || friendship.user2 === user.is.pub) {
            const friendPub = friendship.user1 === user.is.pub ? friendship.user2 : friendship.user1;
            const friendId = `${friendPub}-${friendship.created}`;
            
            if (!processedFriends.has(friendId)) {
              processedFriends.add(friendId);
              
              gun.get(`~${friendPub}`).once((userData) => {
                if (userData) {
                  emitFriend({
                    pub: friendPub,
                    added: friendship.created,
                    friendshipId: id
                  }, userData);
                }
              });
            }
          }
        });

      // Monitora my_friends come backup
      const unsubMyFriends = gun.user()
        .get('my_friends')
        .map()
        .on((friendData, key) => {
          if (!friendData || !friendData.pub) return;
          
          const friendId = `${friendData.pub}-${friendData.added}`;
          if (!processedFriends.has(friendId)) {
            processedFriends.add(friendId);
            
            gun.get(`~${friendData.pub}`).once((userData) => {
              if (userData) {
                emitFriend(friendData, userData);
              }
            });
          }
        });

      return () => {
        if (typeof unsubFriendships === 'function') unsubFriendships();
        if (typeof unsubMyFriends === 'function') unsubMyFriends();
        processedFriends.clear();
        emittedFriends.clear();
      };
    });
  },

  handleAcceptRequest: async (request) => {
    if (!user.is) throw new Error('User not authenticated');
    const lockKey = `friend_request_${request.id}`;
    
    try {
      await acquireLock(lockKey);
      // Rimuovi immediatamente la richiesta dal nodo pubblico
      await new Promise((resolve) => {
        gun.get('all_friend_requests')
          .map()
          .once((data, key) => {
            if (data && (data.from === request.pub || data.to === request.pub)) {
              gun.get('all_friend_requests')
                .get(key)
                .put(null);
            }
          });
        setTimeout(resolve, 1000);
      });

      return { success: true, message: 'Richiesta accettata con successo' };
    } finally {
      await releaseLock(lockKey);
    }
  },

  handleRejectRequest: async (request) => {
    if (!user.is) throw new Error('User not authenticated');

    await new Promise((resolve) => {
      gun.get('all_friend_requests')
        .map()
        .once((data, key) => {
          if (data && 
             ((data.from === request.pub && data.to === user.is.pub) ||
              (data.from === user.is.pub && data.to === request.pub))) {
            gun.get('all_friend_requests')
              .get(key)
              .put(null);
          }
        });
      setTimeout(resolve, 500);
    });

    return { success: true, message: 'Richiesta rifiutata' };
  },

  unblockUser: async (userPub) => {
    if (!user.is) throw new Error('User not authenticated');

    await new Promise((resolve) => {
      gun.user()
        .get('blocked_users')
        .map()
        .once((data, key) => {
          if (data && data.pub === userPub) {
            gun.user()
              .get('blocked_users')
              .get(key)
              .put(null);
          }
        });
      setTimeout(resolve, 500);
    });

    return { success: true, message: 'Utente sbloccato' };
  },

  getRequestAlias: async (request) => {
    const existingAlias = 
      request?.data?.senderInfo?.alias ||
      request?.senderInfo?.alias ||
      request?.data?.alias ||
      request?.alias;

    if (existingAlias && existingAlias !== 'Unknown') {
      return existingAlias;
    }

    try {
      const userData = await new Promise((resolve) => {
        gun.get(`~${request.pub || request.from}`)
          .once((data) => resolve(data));
        setTimeout(() => resolve(null), 1000);
      });

      if (userData?.alias) return userData.alias;

      const aliasData = await new Promise((resolve) => {
        gun.get('~@')
          .map()
          .once((data, alias) => {
            if (data && data[`~${request.pub || request.from}`]) {
              resolve(alias);
            }
          });
        setTimeout(() => resolve(null), 1000);
      });

      if (aliasData) return aliasData;
    } catch (error) {
      console.error('Error getting alias:', error);
    }

    const shortPub = (request.pub || request.from || '').substring(0, 8);
    return `User-${shortPub}`;
  },

  // Aggiungi questo metodo all'oggetto friendsService
  observeFriendRequestAccepted: (targetPub) => {
    return new Observable((subscriber) => {
      if (!user.is) {
        subscriber.error(new Error('User not authenticated'));
        return;
      }

      // Invece di osservare all_friend_requests, osserviamo my_friends
      const unsub = gun.user()
        .get('my_friends')
        .map()
        .on((friendData, key) => {
          if (!friendData) return;
          
          // Verifichiamo se questo è il nuovo amico che stavamo aspettando
          if (friendData.pub === targetPub) {
            gun.get(`~${targetPub}`)
              .once((userData) => {
                if (userData) {
                  subscriber.next({
                    pub: targetPub,
                    alias: userData.alias || friendData.alias || 'Unknown',
                    timestamp: friendData.added || Date.now()
                  });
                }
              });
          }
        });

      // Pulizia dopo 30 secondi
      setTimeout(() => {
        if (typeof unsub === 'function') unsub();
        subscriber.complete();
      }, 30000);

      return () => {
        if (typeof unsub === 'function') unsub();
      };
    });
  }
};

export default friendsService; 