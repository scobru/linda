import { gun, DAPP_NAME } from '../useGun.js';

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

    // Cerca nei dati utente
    const userData = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('userList')
        .get('users')
        .get(userPub)
        .once((data) => {
          console.log('Dati utente trovati:', data);
          resolve(data);
        });
      setTimeout(() => resolve(null), 1000);
    });

    // Se abbiamo i dati dell'utente nel nodo userList
    if (userData) {
      console.log('Usando dati da userList:', userData);
      // Se l'utente ha un nickname, lo usiamo come displayName
      if (userData.nickname) {
        return {
          nickname: userData.nickname,
          username: userData.username || '',
          displayName: userData.nickname,
          pub: userPub,
          authType: userData.authType,
        };
      }
      // Altrimenti usiamo lo username
      if (userData.username) {
        return {
          nickname: '',
          username: userData.username,
          displayName: userData.username,
          pub: userPub,
          authType: userData.authType,
        };
      }
    }

    // Se non troviamo i dati nel nodo userList, proviamo a recuperare l'alias originale
    console.log('Tentativo recupero alias per:', userPub);
    const user = await gun.get(`~${userPub}`).once();
    if (user?.alias) {
      const username = user.alias.split('.')[0];
      console.log('Alias trovato:', username);
      return {
        nickname: '',
        username: username,
        displayName: username,
        pub: userPub,
        authType: 'gun',
      };
    }

    // Fallback finale alla chiave pubblica abbreviata
    try {
      console.log('Creazione shortPub per:', userPub);
      const shortPub =
        userPub && typeof userPub === 'string'
          ? `${userPub.slice(0, 6)}...${userPub.slice(-4)}`
          : 'Utente sconosciuto';

      return {
        nickname: '',
        username: shortPub,
        displayName: shortPub,
        pub: userPub,
        authType: 'unknown',
      };
    } catch (error) {
      console.error('Errore nella creazione shortPub:', error);
      return {
        nickname: '',
        username: 'Utente sconosciuto',
        displayName: 'Utente sconosciuto',
        pub: userPub,
        authType: 'unknown',
      };
    }
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

export const getFriends = async (userPub) => {
  try {
    if (!userPub) {
      console.log('userPub non valido per getFriends');
      return [];
    }

    return new Promise((resolve) => {
      const friends = [];
      let checked = false;

      gun
        .get(DAPP_NAME)
        .get('userList')
        .get('users')
        .get(userPub)
        .get('friends')
        .map()
        .once(async (friendData, friendPub) => {
          if (friendData && !checked) {
            try {
              const friendInfo = await getUserInfo(friendPub);
              if (friendInfo) {
                friends.push({
                  ...friendInfo,
                  pub: friendPub,
                  lastSeen: friendData.lastSeen || Date.now(),
                });
              }
            } catch (error) {
              console.error('Errore nel recupero info amico:', error);
            }
          }
        });

      // Timeout per evitare attese infinite
      setTimeout(() => {
        checked = true;
        console.log('Lista amici recuperata:', friends);
        resolve(friends);
      }, 2000);
    });
  } catch (error) {
    console.error('Errore nel recupero lista amici:', error);
    return [];
  }
};

export const handleFriendRequest = async (request, action = 'accept') => {
  try {
    console.log('Gestione richiesta amicizia:', request);

    if (!request || !request.from) {
      console.error('Dati richiesta invalidi:', request);
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

    console.log('Recupero info mittente:', request.from);

    // Verifica che l'utente esista
    const senderInfo = await getUserInfo(request.from);
    if (!senderInfo) {
      throw new Error('Informazioni mittente non trovate');
    }

    console.log('Info mittente trovate:', senderInfo);

    // Aggiorna lo stato della richiesta
    const requestId = request.id || `${request.from}_${request.timestamp}`;
    console.log('ID richiesta:', requestId);

    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('friend_requests')
        .get(user.is.pub)
        .get(requestId)
        .put(
          {
            status: action,
            timestamp: Date.now(),
            from: request.from,
            to: user.is.pub,
            data: request.data || {},
          },
          (ack) => {
            if (ack.err) {
              reject(new Error(ack.err));
            } else {
              resolve();
            }
          }
        );
    });

    // Se accettata, aggiungi alla lista amici
    if (action === 'accept') {
      console.log('Aggiunta alla lista amici');

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
    }

    return {
      success: true,
      userInfo: senderInfo,
    };
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
