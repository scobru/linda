import { gun, user, DAPP_NAME } from '../useGun.js';
import { handleFriendRequestAccepted } from '../security/friendsCertificates.js';

export const acceptFriendRequest = async (requestId, senderPub) => {
  try {
    console.log('Accettazione richiesta:', { requestId, senderPub });

    // 1. Genera i certificati necessari
    const success = await handleFriendRequestAccepted(senderPub);
    if (!success) {
      throw new Error('Errore nella generazione dei certificati');
    }

    // 2. Rimuovi la richiesta pendente
    await new Promise((resolve, reject) => {
      gun
        .user()
        .get(DAPP_NAME)
        .get('friend_requests')
        .get(requestId)
        .put(null, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // 3. Aggiungi alla lista amici
    await Promise.all([
      // Aggiungi alla nostra lista
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('friends')
          .get(senderPub)
          .put(
            {
              added: Date.now(),
              status: 'active',
            },
            (ack) => resolve(!ack.err)
          );
      }),
      // Aggiungi alla loro lista
      new Promise((resolve) => {
        gun
          .get(`~${senderPub}`)
          .get(DAPP_NAME)
          .get('friends')
          .get(user.is.pub)
          .put(
            {
              added: Date.now(),
              status: 'active',
            },
            (ack) => resolve(!ack.err)
          );
      }),
    ]);

    return { success: true };
  } catch (error) {
    console.error('Errore accettazione richiesta:', error);
    return {
      success: false,
      error: error.message || "Errore durante l'accettazione della richiesta",
    };
  }
};
