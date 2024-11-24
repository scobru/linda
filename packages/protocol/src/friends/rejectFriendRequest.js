import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  revokeChatsCertificate,
  revokeMessagesCertificate,
} from '../security/index.js';

/**
 * Rejects a friend request from another user
 *
 * This function:
 * 1. Validates the current user is authenticated
 * 2. Revokes any existing certificates with the requesting user
 * 3. Removes all related friend requests
 * 4. Cleans up temporary request data
 *
 * @async
 * @param {Object} request - The friend request to reject
 * @param {string} request.from - Public key of requesting user
 * @param {string} [request.id] - Optional request ID
 * @param {Function} callback - Optional callback function
 * @returns {Promise<void>} Resolves when request is rejected
 * @throws {Error} If user not authenticated or rejection fails
 */
const rejectFriendRequest = async (request, callback = () => {}) => {
  if (!user.is) {
    return callback({
      success: false,
      errMessage: 'Utente non autenticato',
    });
  }

  try {
    console.log('Rejecting friend request:', request);

    if (!request || (!request.from && !request.id)) {
      throw new Error('Dati richiesta non validi');
    }

    // Revoca i certificati se esistono
    try {
      await revokeChatsCertificate(request.from);
      await revokeMessagesCertificate(request.from);
    } catch (error) {
      console.warn('Errore durante la revoca dei certificati:', error);
    }

    // Rimuovi tutte le richieste correlate
    await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('all_friend_requests')
        .map()
        .once((data, key) => {
          if (
            data &&
            ((data.from === request.from && data.to === user.is.pub) ||
              (data.from === user.is.pub && data.to === request.from))
          ) {
            gun.get(DAPP_NAME).get('all_friend_requests').get(key).put(null);
          }
        });
      setTimeout(resolve, 500);
    });

    // Pulisci eventuali dati temporanei
    await gun
      .user()
      .get(DAPP_NAME)
      .get('friend_requests_data')
      .get(request.from)
      .put(null);

    callback({
      success: true,
      message: 'Richiesta rifiutata con successo',
    });
  } catch (error) {
    console.error('Error rejecting friend request:', error);
    callback({
      success: false,
      errMessage: error.message || 'Errore nel rifiutare la richiesta',
    });
  }
};

export default rejectFriendRequest;
