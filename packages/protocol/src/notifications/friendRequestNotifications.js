import { gun, user, DAPP_NAME } from '../useGun.js';
import { Observable } from 'rxjs';

/**
 * Servizio per la gestione delle notifiche delle richieste di amicizia
 */
const friendRequestNotifications = {
  /**
   * Osserva le nuove richieste di amicizia
   * @returns {Observable} Observable che emette le nuove richieste
   */
  observeFriendRequests: () => {
    return new Observable((subscriber) => {
      if (!user?.is) {
        subscriber.error(new Error('Utente non autenticato'));
        return;
      }

      const processedRequests = new Set();

      // Funzione per caricare i dati dell'utente
      const loadUserData = async (pub) => {
        return new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('userList')
            .get('users')
            .map()
            .once((userData) => {
              if (userData && userData.pub === pub) {
                resolve({
                  alias: userData.nickname || userData.username || pub,
                  displayName: userData.nickname,
                  username: userData.username,
                  avatarSeed: userData.avatarSeed,
                });
              }
            });

          // Timeout di sicurezza
          setTimeout(() => resolve({ alias: pub }), 2000);
        });
      };

      // Funzione per processare una richiesta
      const processRequest = async (request, id, type) => {
        if (!request || !request.to || processedRequests.has(id)) return;

        // Verifica che la richiesta sia per l'utente corrente e sia pendente
        if (request.to === user.is.pub && request.status === 'pending') {
          console.log(`Nuova richiesta ${type} trovata:`, request);

          // Se mancano i dati dell'utente, li recuperiamo
          if (!request.alias || !request.from) {
            const userData = await loadUserData(request.from);
            request = { ...request, ...userData };
          }

          processedRequests.add(id);
          subscriber.next({
            ...request,
            type,
            id,
          });
        }
      };

      // Osserva le richieste private
      const privateHandler = gun
        .user()
        .get(DAPP_NAME)
        .get('private_requests')
        .map()
        .on((request, id) => processRequest(request, id, 'private'));

      // Osserva le richieste pubbliche
      const publicHandler = gun
        .get(DAPP_NAME)
        .get('friendRequests')
        .map()
        .on((request, id) => processRequest(request, id, 'public'));

      // Cleanup function
      return () => {
        if (typeof privateHandler === 'function') privateHandler();
        if (typeof publicHandler === 'function') publicHandler();
        processedRequests.clear();
      };
    });
  },

  /**
   * Marca una richiesta come letta
   * @param {string} requestId - ID della richiesta
   * @param {string} type - Tipo di richiesta ('private' o 'public')
   */
  markAsRead: async (requestId, type) => {
    if (!user?.is) {
      throw new Error('Utente non autenticato');
    }

    try {
      if (type === 'private') {
        await gun
          .user()
          .get(DAPP_NAME)
          .get('private_requests')
          .get(requestId)
          .get('status')
          .put('read');
      } else {
        await gun
          .get(DAPP_NAME)
          .get('friendRequests')
          .get(requestId)
          .get('status')
          .put('read');
      }

      return true;
    } catch (error) {
      console.error('Errore aggiornamento stato richiesta:', error);
      return false;
    }
  },
};

export default friendRequestNotifications;
