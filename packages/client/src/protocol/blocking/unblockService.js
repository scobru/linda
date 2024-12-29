/**
 * @fileoverview Service to handle user unblocking
 */

import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Servizio per sbloccare un utente
 * @param {string} targetPub - Chiave pubblica dell'utente da sbloccare
 * @returns {Promise<{success: boolean, message: string}>}
 */
const unblockService = async (targetPub) => {
  if (!user.is) {
    return { success: false, message: 'Utente non autenticato' };
  }

  try {
    // Rimuovi il blocco dal database
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Timeout')), 5000);

      gun.get(`${DAPP_NAME}/users`)
        .get(user.is.pub)
        .get('blocked')
        .get(targetPub)
        .put(null, (ack) => {
          clearTimeout(timeoutId);
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // Aggiorna lo stato di blocco locale
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Timeout')), 5000);

      gun.get(`${DAPP_NAME}/blockStatus`)
        .get(`${user.is.pub}_${targetPub}`)
        .put({
          blocker: user.is.pub,
          blocked: targetPub,
          status: 'unblocked',
          timestamp: Date.now()
        }, (ack) => {
          clearTimeout(timeoutId);
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // Notifica l'utente sbloccato
    gun.get(`~${targetPub}`)
      .get('notifications')
      .get('blocks')
      .set({
        type: 'unblock',
        from: user.is.pub,
        timestamp: Date.now()
      });

    console.log(`Utente ${targetPub} sbloccato con successo`);
    return { success: true, message: 'Utente sbloccato con successo' };

  } catch (error) {
    console.error('Errore nello sblocco:', error);
    return { success: false, message: error.message };
  }
};

export default unblockService;
