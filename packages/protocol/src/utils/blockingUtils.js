import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Verifica se è possibile interagire con un utente
 * @param {string} targetPub - Chiave pubblica dell'utente da verificare
 * @returns {Promise<{canInteract: boolean, reason: string}>}
 */
export const canInteractWithUser = async (targetPub) => {
  if (!user.is) {
    return { canInteract: false, reason: 'not_authenticated' };
  }

  try {
    // Verifica nel database principale
    const blockStatus = await new Promise((resolve) => {
      gun.get(`${DAPP_NAME}/users`)
        .get(user.is.pub)
        .get('blocked')
        .get(targetPub)
        .once((data) => {
          resolve(data);
        });
    });

    if (blockStatus && blockStatus.status === 'blocked') {
      return { canInteract: false, reason: 'user_blocked' };
    }

    // Verifica se siamo stati bloccati
    const blockedByStatus = await new Promise((resolve) => {
      gun.get(`${DAPP_NAME}/users`)
        .get(targetPub)
        .get('blocked')
        .get(user.is.pub)
        .once((data) => {
          resolve(data);
        });
    });

    if (blockedByStatus && blockedByStatus.status === 'blocked') {
      return { canInteract: false, reason: 'blocked_by_user' };
    }

    return { canInteract: true, reason: null };
  } catch (error) {
    console.error('Errore nella verifica delle interazioni:', error);
    return { canInteract: false, reason: 'error' };
  }
}; 