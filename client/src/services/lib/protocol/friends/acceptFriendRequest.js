import { gun, user } from '../../../state';
import { createMessagesCertificate, createChatsCertificate } from '../security';

const acceptFriendRequest = async (request, callback = () => {}) => {
  console.log('Accepting friend request:', request);

  if (!user || !user.is) {
    callback({
      success: false,
      errMessage: 'User not authenticated',
    });
    return;
  }

  try {
    // Crea i certificati necessari all'inizio
    await Promise.all([
      createMessagesCertificate(request.pub),
      createChatsCertificate(request.pub)
    ]);

    // Genera un ID univoco per la chat
    const chatId = [user.is.pub, request.pub].sort().join('_');

    // 1. Prima verifica se esistono vecchi dati e puliscili
    await new Promise((resolve) => {
      // Pulisci vecchie chat
      gun
        .get('chats')
        .get(chatId)
        .once((chat) => {
          if (chat) {
            gun.get('chats').get(chatId).put(null);
          }
        });

      // Pulisci vecchie amicizie
      gun
        .get('friendships')
        .map()
        .once((friendship, friendshipId) => {
          if (friendship && friendshipId) {
            const isMatch =
              (friendship.user1 === request.pub &&
                friendship.user2 === user.is.pub) ||
              (friendship.user2 === request.pub &&
                friendship.user1 === user.is.pub);

            if (isMatch) {
              gun.get('friendships').get(friendshipId).put(null);
            }
          }
        });

      setTimeout(resolve, 500);
    });

    // 3. Crea una nuova chat pulita
    const newChat = {
      id: chatId,
      user1: user.is.pub,
      user2: request.pub,
      created: Date.now(),
      status: 'active',
    };

    await new Promise((resolve, reject) => {
      gun
        .get('chats')
        .get(chatId)
        .put(newChat, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // 4. Crea una nuova amicizia
    const friendship = {
      user1: user.is.pub,
      user2: request.pub,
      created: Date.now(),
      status: 'active',
      chatId: chatId,
    };

    // Salva l'amicizia con un ID specifico
    const friendshipId = `friendship_${chatId}`;
    await new Promise((resolve, reject) => {
      gun
        .get('friendships')
        .get(friendshipId)
        .put(friendship, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // 5. Aggiorna le liste amici di entrambi gli utenti
    await gun
      .user()
      .get('my_friends')
      .set({
        pub: request.pub,
        alias: request.alias || request.senderInfo?.alias || 'Unknown',
        added: Date.now(),
        chatId: chatId,
        friendshipId: friendshipId,
      });

    // 6. Rimuovi tutte le richieste pendenti
    await new Promise((resolve) => {
      gun
        .get('all_friend_requests')
        .map()
        .once((req, key) => {
          if (
            req &&
            key &&
            ((req.from === request.pub && req.to === user.is.pub) ||
              (req.to === request.pub && req.from === user.is.pub))
          ) {
            gun.get('all_friend_requests').get(key).put(null);
          }

          gun
            .user()
            .get('friendRequests')
            .get(key)
            .put(null, async ({ err }) => {
              if (err)
                return callback({
                  errMessage: err,
                  errCode: 'accept-friend-request-failed',
                  success: undefined,
                });
              else {
                let addFriendCertificate = await gun
                  .user(request.pub)
                  .get('certificates')
                  .get(user.is.pub)
                  .get('addFriend');

                gun
                  .user(request.pub)
                  .get('friends')
                  .set(
                    user.is.pub,
                    ({ err }) => {
                      if (err)
                        return callback({
                          errMessage: err,
                          errCode: 'add-friend-failed',
                          success: undefined,
                        });
                      else
                        gun
                          .user()
                          .get('friends')
                          .set(request.pub, ({ err }) => {
                            if (err)
                              return callback({
                                errMessage: err,
                                errCode: 'add-friend-failed',
                                success: undefined,
                              });
                            else
                              return callback({
                                errMessage: undefined,
                                errCode: undefined,
                                success: 'Added friend successfully.',
                              });
                          });
                    },
                    {
                      opt: { cert: addFriendCertificate },
                    }
                  );
              }
            });
        });
      setTimeout(resolve, 500);
    });

    callback({
      success: true,
      message: 'Richiesta accettata e amicizia creata',
    });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    callback({
      success: false,
      errMessage: error.message || "Errore nell'accettare la richiesta",
    });
  }
};

export default acceptFriendRequest;
