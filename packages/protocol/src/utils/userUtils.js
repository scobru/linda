import { gun, user, DAPP_NAME } from '../useGun.js';

// Cache per gli utenti
const userCache = new Map();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minuti di cache

export const getUserInfo = async (userPub) => {
  try {
    // Verifica che userPub sia valido
    if (!userPub) {
      console.log('userPub non valido:', userPub);
      return {
        nickname: '',
        username: 'Utente sconosciuto',
        displayName: 'Utente sconosciuto',
        pub: '',
        authType: 'unknown',
      };
    }

    // Controlla se l'utente è in cache e non è scaduto
    const cachedUser = userCache.get(userPub);
    if (cachedUser && Date.now() - cachedUser.timestamp < CACHE_EXPIRY) {
      return cachedUser.data;
    }

    // Cerca nei dati utente
    const userData = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('userList')
        .get('users')
        .get(userPub)
        .once((data) => {
          resolve(data);
        });
      setTimeout(() => resolve(null), 1000);
    });

    let result;

    // Se abbiamo i dati dell'utente nel nodo userList
    if (userData) {
      // Se l'utente ha un nickname, lo usiamo come displayName
      if (userData.nickname) {
        result = {
          nickname: userData.nickname,
          username: userData.username || '',
          displayName: userData.nickname,
          pub: userPub,
          authType: userData.authType,
        };
      }
      // Altrimenti usiamo lo username
      else if (userData.username) {
        result = {
          nickname: '',
          username: userData.username,
          displayName: userData.username,
          pub: userPub,
          authType: userData.authType,
        };
      }
    }

    // Se non troviamo i dati nel nodo userList, proviamo a recuperare l'alias originale
    if (!result) {
      const user = await gun.get(`~${userPub}`).once();
      if (user?.alias) {
        const username = user.alias.split('.')[0];
        result = {
          nickname: '',
          username: username,
          displayName: username,
          pub: userPub,
          authType: 'gun',
        };
      }
    }

    // Fallback finale alla chiave pubblica abbreviata
    if (!result) {
      const shortPub =
        userPub && typeof userPub === 'string'
          ? `${userPub.slice(0, 6)}...${userPub.slice(-4)}`
          : 'Utente sconosciuto';

      result = {
        nickname: '',
        username: shortPub,
        displayName: shortPub,
        pub: userPub,
        authType: 'unknown',
      };
    }

    // Salva il risultato in cache
    userCache.set(userPub, {
      data: result,
      timestamp: Date.now(),
    });

    return result;
  } catch (error) {
    console.error('Errore nel recupero info utente:', error);
    return {
      nickname: '',
      username: 'Utente sconosciuto',
      displayName: 'Utente sconosciuto',
      pub: userPub || '',
      authType: 'unknown',
    };
  }
};

// Funzione per invalidare la cache di un utente specifico
export const invalidateUserCache = (userPub) => {
  if (userPub) {
    userCache.delete(userPub);
  }
};

// Funzione per pulire la cache scaduta
export const cleanExpiredCache = () => {
  const now = Date.now();
  for (const [key, value] of userCache.entries()) {
    if (now - value.timestamp > CACHE_EXPIRY) {
      userCache.delete(key);
    }
  }
};

// Pulisci la cache ogni 5 minuti
setInterval(cleanExpiredCache, CACHE_EXPIRY);

export const subscribeToUserUpdates = (userPub, callback) => {
  // Sottoscrizione ai dati utente completi
  return gun
    .get(DAPP_NAME)
    .get('userList')
    .get('users')
    .get(userPub)
    .on((userData) => {
      if (userData) {
        callback({
          nickname: userData.nickname || '',
          username: userData.username || '',
          displayName:
            userData.nickname ||
            userData.username ||
            `${userPub.slice(0, 6)}...${userPub.slice(-4)}`,
          authType: userData.authType,
        });
      }
    });
};

export const updateUserProfile = async (userPub, profileData) => {
  try {
    // Recupera i dati utente esistenti
    const existingData = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('userList')
        .get('users')
        .get(userPub)
        .once(resolve);
    });

    // Crea l'oggetto con i dati aggiornati
    const updatedData = {
      ...existingData,
      pub: userPub,
      nickname: profileData.nickname,
      username: existingData?.username || '', // Mantieni lo username esistente
      timestamp: Date.now(),
      lastSeen: Date.now(),
    };

    // Aggiorna il nodo principale dell'utente
    await gun
      .get(DAPP_NAME)
      .get('userList')
      .get('users')
      .get(userPub)
      .put(updatedData);

    // Aggiorna anche il nodo del profilo privato
    await gun.user().get(DAPP_NAME).get('profile').put({
      nickname: profileData.nickname,
      timestamp: Date.now(),
    });

    return true;
  } catch (error) {
    console.error('Errore aggiornamento profilo:', error);
    return false;
  }
};

export const getFriends = async () => {
  try {
    if (!user?.is) {
      return [];
    }

    return new Promise((resolve) => {
      const friends = new Map();
      let pendingUpdates = new Set();
      let processingBatch = false;
      let resolveCallback = null;
      const BATCH_DELAY = 2000; // Attendi 2 secondi per processare il batch
      let batchTimeout = null;

      // Funzione per ordinare gli amici in modo stabile
      const getSortKey = (friend) => {
        const lastSeen = friend.lastSeen || 0;
        const displayName = friend.displayName || '';
        // Combina lastSeen e displayName per creare una chiave di ordinamento stabile
        return `${lastSeen.toString().padStart(20, '0')}_${displayName}`;
      };

      const processFriendsBatch = async () => {
        if (processingBatch || pendingUpdates.size === 0) return;

        processingBatch = true;
        const currentBatch = new Set(pendingUpdates);
        pendingUpdates.clear();

        // Processa tutti gli aggiornamenti in sospeso
        for (const friendPub of currentBatch) {
          try {
            const friendInfo = await getUserInfo(friendPub);
            if (friendInfo) {
              const existingFriend = friends.get(friendPub);
              // Aggiorna solo se i dati sono effettivamente cambiati
              if (
                !existingFriend ||
                existingFriend.lastSeen !== friendInfo.lastSeen ||
                existingFriend.displayName !== friendInfo.displayName
              ) {
                friends.set(friendPub, {
                  ...friendInfo,
                  pub: friendPub,
                  sortKey: getSortKey(friendInfo),
                });
              }
            }
          } catch (error) {
            console.error('Errore nel recupero info amico:', error);
          }
        }

        // Ordina gli amici una volta sola dopo aver processato il batch
        const sortedFriends = Array.from(friends.values()).sort((a, b) =>
          b.sortKey.localeCompare(a.sortKey)
        );

        processingBatch = false;

        // Notifica solo se ci sono cambiamenti effettivi
        if (resolveCallback) {
          resolveCallback(sortedFriends);
          resolveCallback = null;
        }

        // Se ci sono nuovi aggiornamenti in sospeso, pianifica il prossimo batch
        if (pendingUpdates.size > 0) {
          scheduleBatch();
        }
      };

      const scheduleBatch = () => {
        if (batchTimeout) clearTimeout(batchTimeout);
        batchTimeout = setTimeout(processFriendsBatch, BATCH_DELAY);
      };

      const handleFriendship = (friendship) => {
        if (!friendship || !friendship.user1 || !friendship.user2) return;

        if (
          friendship.user1 === user.is.pub ||
          friendship.user2 === user.is.pub
        ) {
          const friendPub =
            friendship.user1 === user.is.pub
              ? friendship.user2
              : friendship.user1;
          pendingUpdates.add(friendPub);
          scheduleBatch();
        }
      };

      // Sottoscrizione alle amicizie
      const unsub = gun
        .get(DAPP_NAME)
        .get('friendships')
        .map()
        .on((friendship) => {
          handleFriendship(friendship);
        });

      // Imposta il callback di risoluzione
      resolveCallback = resolve;

      // Timeout di sicurezza
      setTimeout(() => {
        if (typeof unsub === 'function') unsub();
        if (resolveCallback) {
          const sortedFriends = Array.from(friends.values()).sort((a, b) =>
            b.sortKey.localeCompare(a.sortKey)
          );
          resolveCallback(sortedFriends);
          resolveCallback = null;
        }
      }, 5000);
    });
  } catch (error) {
    console.error('Errore nel recupero lista amici:', error);
    return [];
  }
};

export const handleFriendRequest = async (request, action = 'accept') => {
  try {
    if (!request || !request.from) {
      throw new Error('Dati richiesta non validi');
    }

    // Verifica che l'utente sia autenticato
    if (!user.is || !user.is.pub) {
      throw new Error('Utente non autenticato');
    }

    // Verifica che la richiesta sia destinata all'utente corrente
    if (request.to && request.to !== user.is.pub) {
      throw new Error('Richiesta non destinata a questo utente');
    }

    // Recupera info mittente
    const senderInfo = await getUserInfo(request.from);
    if (!senderInfo) {
      throw new Error('Informazioni mittente non trovate');
    }

    const requestId = request.id || `${request.from}_${request.timestamp}`;

    // Se accettata, aggiungi alla lista amici
    if (action === 'accept') {
      // Aggiungi alla lista amici dell'utente corrente
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('userList')
          .get('users')
          .get(user.is.pub)
          .get('friends')
          .get(request.from)
          .put(
            {
              pub: request.from,
              timestamp: Date.now(),
              lastSeen: Date.now(),
            },
            (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            }
          );
      });

      // Aggiungi alla lista amici del mittente
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('userList')
          .get('users')
          .get(request.from)
          .get('friends')
          .get(user.is.pub)
          .put(
            {
              pub: user.is.pub,
              timestamp: Date.now(),
              lastSeen: Date.now(),
            },
            (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            }
          );
      });

      // Rimuovi la richiesta da tutte le liste
      await Promise.all([
        // Rimuovi dalla lista pubblica
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('all_friend_requests')
            .map()
            .once((data, key) => {
              if (
                data &&
                data.from === request.from &&
                data.to === user.is.pub
              ) {
                gun
                  .get(DAPP_NAME)
                  .get('all_friend_requests')
                  .get(key)
                  .put(null);
              }
            });
          setTimeout(resolve, 500);
        }),

        // Rimuovi dalla lista privata dell'utente
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('friend_requests')
            .get(user.is.pub)
            .map()
            .once((data, key) => {
              if (data && data.from === request.from) {
                gun
                  .get(DAPP_NAME)
                  .get('friend_requests')
                  .get(user.is.pub)
                  .get(key)
                  .put(null);
              }
            });
          setTimeout(resolve, 500);
        }),

        // Rimuovi dalla lista privata del mittente
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('friend_requests')
            .get(request.from)
            .map()
            .once((data, key) => {
              if (data && data.to === user.is.pub) {
                gun
                  .get(DAPP_NAME)
                  .get('friend_requests')
                  .get(request.from)
                  .get(key)
                  .put(null);
              }
            });
          setTimeout(resolve, 500);
        }),
      ]);

      // Verifica che le richieste siano state rimosse
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const [hasPublicRequest, hasPrivateRequest] = await Promise.all([
        // Verifica richieste pubbliche
        new Promise((resolve) => {
          let found = false;
          gun
            .get(DAPP_NAME)
            .get('all_friend_requests')
            .map()
            .once((data) => {
              if (
                data &&
                data.from === request.from &&
                data.to === user.is.pub
              ) {
                found = true;
              }
            });
          setTimeout(() => resolve(found), 500);
        }),

        // Verifica richieste private
        new Promise((resolve) => {
          let found = false;
          gun
            .get(DAPP_NAME)
            .get('friend_requests')
            .get(user.is.pub)
            .map()
            .once((data) => {
              if (data && data.from === request.from) {
                found = true;
              }
            });
          setTimeout(() => resolve(found), 500);
        }),
      ]);

      if (hasPublicRequest || hasPrivateRequest) {
        console.warn(
          'Alcune richieste potrebbero non essere state rimosse completamente'
        );
      }

      // Invalida la cache dell'utente per aggiornare i dati
      invalidateUserCache(request.from);
      invalidateUserCache(user.is.pub);

      return {
        success: true,
        userInfo: senderInfo,
        message: `Richiesta accettata. ${senderInfo.displayName} è stato aggiunto ai tuoi amici.`,
      };
    } else {
      // Se rifiutata, rimuovi solo la richiesta
      await Promise.all([
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('all_friend_requests')
            .map()
            .once((data, key) => {
              if (
                data &&
                data.from === request.from &&
                data.to === user.is.pub
              ) {
                gun
                  .get(DAPP_NAME)
                  .get('all_friend_requests')
                  .get(key)
                  .put(null);
              }
            });
          setTimeout(resolve, 500);
        }),
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('friend_requests')
            .get(user.is.pub)
            .get(requestId)
            .put(null);
          setTimeout(resolve, 500);
        }),
      ]);

      return {
        success: true,
        userInfo: senderInfo,
        message: `Richiesta di ${senderInfo.displayName} rifiutata.`,
      };
    }
  } catch (error) {
    console.error('Errore nella gestione della richiesta di amicizia:', error);
    throw error;
  }
};

// Esporta l'oggetto userUtils per retrocompatibilità
export const userUtils = {
  getUserInfo,
  subscribeToUserUpdates,
  updateUserProfile,
  getFriends,
  handleFriendRequest,
};
