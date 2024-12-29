import { gun, user, DAPP_NAME } from '../useGun.js';
import userBlocking from '../blocking/userBlocking.js';

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
    // Utilizza il servizio userBlocking per una verifica completa
    const { blocked, blockedBy } = await userBlocking.getBlockStatus(targetPub);

    if (blocked) {
      return { canInteract: false, reason: 'user_blocked' };
    }

    if (blockedBy) {
      return { canInteract: false, reason: 'blocked_by_user' };
    }

    return { canInteract: true, reason: null };
  } catch (error) {
    console.error('Errore nella verifica delle interazioni:', error);
    return { canInteract: false, reason: 'error' };
  }
};
