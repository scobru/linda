import { gun, user, DAPP_NAME } from '../gun';
import { userUtils } from './userUtils';

export const friendsService = {
  async addFriendRequest(targetPub) {
    if (!user.is) {
      throw new Error('User not authenticated');
    }

    try {
      // Crea un ID univoco per la richiesta
      const requestId = `${user.is.pub}_${targetPub}_${Date.now()}`;

      // Salva la richiesta di amicizia
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('all_friend_requests')
          .get(requestId)
          .put(
            {
              from: user.is.pub,
              to: targetPub,
              timestamp: Date.now(),
              status: 'pending',
            },
            (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            }
          );
      });

      return { success: true };
    } catch (error) {
      console.error('Error adding friend request:', error);
      return { success: false, message: error.message };
    }
  },

  async removeFriend(targetPub) {
    if (!user.is) {
      throw new Error('User not authenticated');
    }

    try {
      // Cerca l'amicizia esistente
      const friendship = await new Promise((resolve) => {
        let found = null;
        gun
          .get(DAPP_NAME)
          .get('friendships')
          .map()
          .once((data, key) => {
            if (
              data &&
              ((data.user1 === user.is.pub && data.user2 === targetPub) ||
                (data.user2 === user.is.pub && data.user1 === targetPub))
            ) {
              found = { key, data };
            }
          });

        setTimeout(() => resolve(found), 1000);
      });

      if (friendship) {
        // Rimuovi l'amicizia
        await new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('friendships')
            .get(friendship.key)
            .put(null, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Error removing friend:', error);
      return { success: false, message: error.message };
    }
  },
};
