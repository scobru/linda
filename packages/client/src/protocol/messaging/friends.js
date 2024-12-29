import { gun, user, DAPP_NAME } from '../useGun.js';

export const friends = {
  sendRequest: async (recipientPub) => {
    if (!user.is) throw new Error('User not authenticated');
    if (recipientPub === user.is.pub)
      throw new Error('Cannot send friend request to yourself');

    try {
      await gun
        .get(DAPP_NAME)
        .get('friendRequests')
        .get(recipientPub)
        .get(user.is.pub)
        .put({
          from: user.is.pub,
          to: recipientPub,
          status: 'pending',
          timestamp: Date.now(),
        });
      return { success: true };
    } catch (error) {
      console.error('Error sending friend request:', error);
      throw error;
    }
  },

  acceptRequest: async (senderPub) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      // Mark request as accepted
      await gun
        .get(DAPP_NAME)
        .get('friendRequests')
        .get(user.is.pub)
        .get(senderPub)
        .put({
          status: 'accepted',
          acceptedAt: Date.now(),
        });

      // Add to friends list for both users
      await gun
        .get(DAPP_NAME)
        .get('friends')
        .get(user.is.pub)
        .get(senderPub)
        .put(true);
      await gun
        .get(DAPP_NAME)
        .get('friends')
        .get(senderPub)
        .get(user.is.pub)
        .put(true);

      return { success: true };
    } catch (error) {
      console.error('Error accepting friend request:', error);
      throw error;
    }
  },

  rejectRequest: async (senderPub) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      await gun
        .get(DAPP_NAME)
        .get('friendRequests')
        .get(user.is.pub)
        .get(senderPub)
        .put({
          status: 'rejected',
          rejectedAt: Date.now(),
        });
      return { success: true };
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      throw error;
    }
  },

  removeFriend: async (friendPub) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      await gun
        .get(DAPP_NAME)
        .get('friends')
        .get(user.is.pub)
        .get(friendPub)
        .put(null);
      await gun
        .get(DAPP_NAME)
        .get('friends')
        .get(friendPub)
        .get(user.is.pub)
        .put(null);
      return { success: true };
    } catch (error) {
      console.error('Error removing friend:', error);
      throw error;
    }
  },

  blockUser: async (userPub) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      await gun
        .get(DAPP_NAME)
        .get('blockedUsers')
        .get(user.is.pub)
        .get(userPub)
        .put(true);
      return { success: true };
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  },

  unblockUser: async (userPub) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      await gun
        .get(DAPP_NAME)
        .get('blockedUsers')
        .get(user.is.pub)
        .get(userPub)
        .put(null);
      return { success: true };
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  },

  /**
   * Pulisce i duplicati dalla lista amici
   * @async
   * @param {string} userPub - Public key dell'utente
   * @returns {Promise<void>}
   */
  cleanupFriendsList: async (userPub) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      const seenPubs = new Set();
      const duplicates = new Set();

      // Prima passiamo attraverso tutti gli amici per trovare i duplicati
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('friends')
          .get(userPub)
          .map()
          .once((friendData, friendPub) => {
            if (seenPubs.has(friendPub)) {
              duplicates.add(friendPub);
            } else {
              seenPubs.add(friendPub);
            }
          });

        setTimeout(resolve, 1000); // Diamo tempo per processare tutti i dati
      });

      // Ora rimuoviamo i duplicati
      for (const dupPub of duplicates) {
        await gun
          .get(DAPP_NAME)
          .get('friends')
          .get(userPub)
          .get(dupPub)
          .put(null);

        // Manteniamo solo una connessione valida
        await gun.get(DAPP_NAME).get('friends').get(userPub).get(dupPub).put({
          pub: dupPub,
          status: 'accepted',
          timestamp: Date.now(),
          blocked: false,
          blockedBy: false,
        });
      }

      return {
        success: true,
        cleaned: duplicates.size,
        message: `Rimossi ${duplicates.size} duplicati`,
      };
    } catch (error) {
      console.error('Errore durante la pulizia della lista amici:', error);
      throw error;
    }
  },
};
