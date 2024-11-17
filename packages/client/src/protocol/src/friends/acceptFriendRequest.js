import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createMessagesCertificate,
  createChatsCertificate,
} from '../security/index.js';

/**
 * Accepts a friend request and establishes friendship between users
 *
 * This function:
 * 1. Creates necessary certificates for messaging and chat
 * 2. Cleans up any existing chat/friendship data
 * 3. Creates a new chat room
 * 4. Establishes friendship record
 * 5. Updates friend lists for both users
 * 6. Removes pending friend requests
 *
 * @param {Object} request - The friend request to accept
 * @param {string} request.pub - Public key of requesting user
 * @param {string} request.alias - Display name of requesting user
 * @param {Object} request.senderInfo - Additional sender information
 * @param {Function} callback - Optional callback function
 * @returns {Promise<void>}
 * @throws {Error} If user is not authenticated or acceptance fails
 */
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
    // Create necessary certificates upfront
    await Promise.all([
      createMessagesCertificate(request.pub),
      createChatsCertificate(request.pub),
    ]);

    // Generate unique chat ID
    const chatId = [user.is.pub, request.pub].sort().join('_');

    // 1. First check for and clean up any existing data
    await new Promise((resolve) => {
      // Clean old chats
      gun
        .get(DAPP_NAME)
        .get('chats')
        .get(chatId)
        .once((chat) => {
          if (chat) {
            gun.get('chats').get(chatId).put(null);
          }
        });

      // Clean old friendships
      gun
        .get(DAPP_NAME)
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

    // 3. Create new clean chat
    const newChat = {
      id: chatId,
      user1: user.is.pub,
      user2: request.pub,
      created: Date.now(),
      status: 'active',
    };

    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('chats')
        .get(chatId)
        .put(newChat, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // 4. Create new friendship
    const friendship = {
      user1: user.is.pub,
      user2: request.pub,
      created: Date.now(),
      status: 'active',
      chatId: chatId,
    };

    // Save friendship with specific ID
    const friendshipId = `friendship_${chatId}`;
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('friendships')
        .get(friendshipId)
        .put(friendship, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // 5. Update friend lists for both users
    await gun
      .user()
      .get(DAPP_NAME)
      .get('my_friends')
      .set({
        pub: request.pub,
        alias: request.alias || request.senderInfo?.alias || 'Unknown',
        added: Date.now(),
        chatId: chatId,
        friendshipId: friendshipId,
      });

    // 6. Remove all pending requests
    await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
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
            .get(DAPP_NAME)
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
                  .get(DAPP_NAME)
                  .get('certificates')
                  .get(user.is.pub)
                  .get('addFriend');

                gun
                  .user(request.pub)
                  .get(DAPP_NAME)
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
                          .get(DAPP_NAME)
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
      message: 'Request accepted and friendship created',
    });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    callback({
      success: false,
      errMessage: error.message || 'Error accepting request',
    });
  }
};

export default acceptFriendRequest;
