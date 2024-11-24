import { gun, DAPP_NAME } from '../useGun.js';

export const userUtils = {
  // Ottiene tutte le informazioni dell'utente
  async getUserInfo(userPub) {
    try {
      // Cerca nei dati utente
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

      // Se abbiamo i dati dell'utente nel nodo userList
      if (userData) {
        // Se l'utente ha un nickname, lo usiamo come displayName
        if (userData.nickname) {
          return {
            nickname: userData.nickname,
            username: userData.username || '',
            displayName: userData.nickname,
            pub: userPub,
            authType: userData.authType
          };
        }
        // Altrimenti usiamo lo username
        if (userData.username) {
          return {
            nickname: '',
            username: userData.username,
            displayName: userData.username,
            pub: userPub,
            authType: userData.authType
          };
        }
      }

      // Se non troviamo i dati nel nodo userList, proviamo a recuperare l'alias originale
      const user = await gun.get(`~${userPub}`).once();
      if (user?.alias) {
        const username = user.alias.split('.')[0];
        return {
          nickname: '',
          username: username,
          displayName: username,
          pub: userPub,
          authType: 'gun'
        };
      }

      // Fallback finale alla chiave pubblica abbreviata
      const shortPub = `${userPub.slice(0, 6)}...${userPub.slice(-4)}`;
      return {
        nickname: '',
        username: shortPub,
        displayName: shortPub,
        pub: userPub,
        authType: 'unknown'
      };
    } catch (error) {
      console.error('Errore nel recupero info utente:', error);
      const shortPub = `${userPub.slice(0, 6)}...${userPub.slice(-4)}`;
      return {
        nickname: '',
        username: shortPub,
        displayName: shortPub,
        pub: userPub,
        authType: 'unknown'
      };
    }
  },

  // Sottoscrizione ai cambiamenti del profilo utente
  subscribeToUserUpdates(userPub, callback) {
    // Sottoscrizione ai dati utente completi
    return gun.get(DAPP_NAME)
      .get('userList')
      .get('users')
      .get(userPub)
      .on((userData) => {
        if (userData) {
          callback({
            nickname: userData.nickname || '',
            username: userData.username || '',
            displayName: userData.nickname || userData.username || `${userPub.slice(0, 6)}...${userPub.slice(-4)}`,
            authType: userData.authType
          });
        }
      });
  },

  // Aggiorna il profilo utente (solo nickname)
  async updateUserProfile(userPub, profileData) {
    try {
      // Recupera i dati utente esistenti
      const existingData = await new Promise((resolve) => {
        gun.get(DAPP_NAME)
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
        lastSeen: Date.now()
      };

      // Aggiorna il nodo principale dell'utente
      await gun.get(DAPP_NAME)
        .get('userList')
        .get('users')
        .get(userPub)
        .put(updatedData);

      // Aggiorna anche il nodo del profilo privato
      await gun.user()
        .get(DAPP_NAME)
        .get('profile')
        .put({
          nickname: profileData.nickname,
          timestamp: Date.now()
        });

      return true;
    } catch (error) {
      console.error('Errore aggiornamento profilo:', error);
      return false;
    }
  }
}; 