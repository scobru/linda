import { gun, DAPP_NAME } from '../useGun.js';

export const userUtils = {
  // Ottiene lo username/nickname dell'utente
  async getUserDisplayName(userPub) {
    try {
      // Prima cerca nel nodo nicknames
      const nickname = await new Promise((resolve) => {
        gun.get(DAPP_NAME)
          .get('userList')
          .get('nicknames')
          .get(userPub)
          .once((data) => {
            resolve(data);
          });
        setTimeout(() => resolve(null), 1000);
      });

      if (nickname) {
        return nickname;
      }

      // Se non c'è un nickname, cerca nei dati utente
      const userData = await new Promise((resolve) => {
        gun.get(DAPP_NAME)
          .get('userList')
          .get('users')
          .get(userPub)
          .once((data) => {
            resolve(data);
          });
        setTimeout(() => resolve(null), 1000);
      });

      if (userData?.username) {
        return userData.username;
      }

      // Fallback all'alias originale
      const user = await gun.get(`~${userPub}`).once();
      if (user?.alias) {
        return user.alias.split('.')[0];
      }

      // Fallback finale alla chiave pubblica abbreviata
      return `${userPub.slice(0, 6)}...${userPub.slice(-4)}`;
    } catch (error) {
      console.error('Errore nel recupero del nome utente:', error);
      return `${userPub.slice(0, 6)}...${userPub.slice(-4)}`;
    }
  },

  // Sottoscrizione ai cambiamenti del nickname/username
  subscribeToUserUpdates(userPub, callback) {
    const unsubscribers = [];

    // Sottoscrizione ai nickname
    const unsubNickname = gun.get(DAPP_NAME)
      .get('userList')
      .get('nicknames')
      .get(userPub)
      .on((nickname) => {
        if (nickname) {
          callback(nickname);
        }
      });
    unsubscribers.push(unsubNickname);

    // Sottoscrizione ai dati utente
    const unsubUser = gun.get(DAPP_NAME)
      .get('userList')
      .get('users')
      .get(userPub)
      .on((userData) => {
        if (userData?.username) {
          callback(userData.username);
        }
      });
    unsubscribers.push(unsubUser);

    // Ritorna una funzione per cancellare tutte le sottoscrizioni
    return () => {
      unsubscribers.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
      });
    };
  },

  // Aggiorna il profilo utente
  async updateUserProfile(userPub, profileData) {
    try {
      // Aggiorna il nickname
      await gun.get(DAPP_NAME)
        .get('userList')
        .get('nicknames')
        .get(userPub)
        .put(profileData.nickname);

      // Aggiorna i dati utente
      await gun.get(DAPP_NAME)
        .get('userList')
        .get('users')
        .get(userPub)
        .put({
          pub: userPub,
          username: profileData.username,
          timestamp: Date.now(),
          lastSeen: Date.now()
        });

      // Aggiorna il profilo privato
      await gun.user()
        .get(DAPP_NAME)
        .get('profile')
        .put({
          nickname: profileData.nickname,
          avatarSeed: profileData.avatarSeed
        });

      return true;
    } catch (error) {
      console.error('Errore aggiornamento profilo:', error);
      return false;
    }
  }
}; 