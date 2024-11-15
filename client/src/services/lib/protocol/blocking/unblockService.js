import { user } from '../../../state';
import { userBlocking } from './index';
import { createChatsCertificate, createMessagesCertificate } from '../security';

const unblockService = {
  unblockUser: async (userPub) => {
    if (!user.is || !userPub) {
      throw new Error('Parametri non validi');
    }

    try {
      await userBlocking.unblockUser(userPub);

      await createChatsCertificate(userPub);
      await createMessagesCertificate(userPub);
      
      // Emetti l'evento di sblocco
      window.dispatchEvent(new CustomEvent('userStatusChanged', {
        detail: {
          type: 'unblock',
          userPub: userPub
        }
      }));

      return {
        success: true,
        message: 'Utente sbloccato con successo'
      };
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  }
};

export default unblockService; 