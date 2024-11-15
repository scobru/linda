import { gun, user } from '../../../state';
import { revokeChatsCertificate, revokeMessagesCertificate } from '../security';

const userBlocking = {
  // Blocca un utente
  blockUser: async (pubKey) => {
    if (!user.is) throw new Error('Utente non autenticato');

    try {
      // Verifica se l'utente è già bloccato
      const isAlreadyBlocked = await new Promise((resolve) => {
        let found = false;
        gun
          .user()
          .get('blocked_users')
          .map()
          .once((data) => {
            if (data && data.pub === pubKey) {
              found = true;
            }
          });
        setTimeout(() => resolve(found), 500);
      });

      if (isAlreadyBlocked) {
        throw new Error('Utente già bloccato');
      }

      await revokeChatsCertificate(pubKey);
      await revokeMessagesCertificate(pubKey);

      // Genera un ID univoco per il blocco
      const blockId = `block_${user.is.pub}_${pubKey}_${Date.now()}`;

      // Aggiungi alla lista dei bloccati con certificato
      await new Promise((resolve, reject) => {
        gun
          .user()
          .get('blocked_users')
          .set(
            {
              id: blockId,
              pub: pubKey,
              timestamp: Date.now(),
              type: 'block',
              status: 'active',
            },
            (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            }
          );
      });

      // Revoca i certificati esistenti con l'utente bloccato
      const chatId = [user.is.pub, pubKey].sort().join('_');

      await revokeChatsCertificate(pubKey);
      await revokeMessagesCertificate(pubKey);

      // Pulisci eventuali messaggi esistenti
      await new Promise((resolve) => {
        gun
          .get('chats')
          .get(chatId)
          .get('messages')
          .map()
          .once((msg, key) => {
            if (msg) {
              gun.get('chats').get(chatId).get('messages').get(key).put(null);
            }
          });
        setTimeout(resolve, 500);
      });

      // Marca la chat come bloccata con certificato
      await new Promise((resolve, reject) => {
        gun
          .get('chats')
          .get(chatId)
          .get('blocked')
          .put(
            {
              by: user.is.pub,
              timestamp: Date.now(),
              status: 'active',
            },
            (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            }
          );
      });

      // Emetti l'evento di blocco
      window.dispatchEvent(
        new CustomEvent('userStatusChanged', {
          detail: {
            type: 'block',
            userPub: pubKey,
            timestamp: Date.now(),
          },
        })
      );

      return true;
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  },

  // Sblocca un utente
  unblockUser: async (pubKey) => {
    if (!user.is) throw new Error('Utente non autenticato');

    try {
      // Rimuovi dalla lista dei bloccati
      await new Promise((resolve) => {
        gun
          .user()
          .get('blocked_users')
          .map()
          .once((data, key) => {
            if (data && data.pub === pubKey) {
              gun.user().get('blocked_users').get(key).put(null);
            }
          });
        setTimeout(resolve, 500);
      });

      // Rimuovi il flag di blocco dalla chat
      const chatId = [user.is.pub, pubKey].sort().join('_');
      await new Promise((resolve, reject) => {
        gun
          .get('chats')
          .get(chatId)
          .get('blocked')
          .put(null, (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          });
      });

      // Emetti l'evento di sblocco
      window.dispatchEvent(
        new CustomEvent('userStatusChanged', {
          detail: {
            type: 'unblock',
            userPub: pubKey,
            timestamp: Date.now(),
          },
        })
      );

      return true;
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  },

  // Verifica se un utente è bloccato (con verifica certificato)
  isBlocked: async (pubKey) => {
    if (!user.is) return false;

    return new Promise((resolve) => {
      let isBlocked = false;
      gun
        .user()
        .get('blocked_users')
        .map()
        .once(async (data) => {
          if (data && data.pub === pubKey && data.status === 'active') {
            isBlocked = true; // Retrocompatibilità
          }
        });

      setTimeout(() => resolve(isBlocked), 500);
    });
  },

  // Verifica se siamo stati bloccati da un utente
  isBlockedBy: async (pubKey) => {
    if (!user.is) return false;

    return new Promise((resolve) => {
      let isBlocked = false;
      gun
        .get(`~${pubKey}`)
        .get('blocked_users')
        .map()
        .once((data) => {
          if (data && data.pub === user.is.pub && data.status === 'active') {
            isBlocked = true;
          }
        });

      setTimeout(() => resolve(isBlocked), 500);
    });
  },

  // Ottieni la lista degli utenti bloccati
  getBlockedUsers: async () => {
    if (!user.is) return [];

    return new Promise((resolve) => {
      const blockedUsers = [];
      gun
        .user()
        .get('blocked_users')
        .map()
        .once((data) => {
          if (data && data.pub && data.status === 'active') {
            blockedUsers.push({
              pub: data.pub,
              timestamp: data.timestamp,
              id: data.id,
            });
          }
        });

      setTimeout(() => resolve(blockedUsers), 500);
    });
  },
};

export default userBlocking;
