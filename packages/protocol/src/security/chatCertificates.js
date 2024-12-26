import { gun, user, DAPP_NAME } from '../useGun.js';
import { certificateManager } from './certificateManager.js';

/**
 * Creates a chat certificate for communicating with a target user
 *
 * @async
 * @param {string} targetPub - Public key of the target user
 * @returns {Promise<string>} The created certificate
 * @throws {Error} If user is not authenticated
 */
export const createChatsCertificate = async (targetPub) => {
  if (!user.is) throw new Error('User not authenticated');

  const certificate = await certificateManager.createCertificate({
    type: 'chats',
    pub: user.is.pub,
    target: targetPub,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  await gun
    .user()
    .get(DAPP_NAME)
    .get('certificates')
    .get(targetPub)
    .get('chats')
    .put(certificate);

  return certificate;
};

/**
 * Creates a messages certificate for exchanging messages with a target user
 *
 * @async
 * @param {string} targetPub - Public key of the target user
 * @returns {Promise<string>} The created certificate
 * @throws {Error} If user is not authenticated
 */
export const createMessagesCertificate = async (targetPub) => {
  if (!user.is) throw new Error('User not authenticated');

  const certificate = await certificateManager.createCertificate({
    type: 'messages',
    pub: user.is.pub,
    target: targetPub,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  await gun
    .user()
    .get(DAPP_NAME)
    .get('certificates')
    .get(targetPub)
    .get('messages')
    .put(certificate);

  return certificate;
};

/**
 * Revokes an existing chats certificate for a target user
 *
 * @async
 * @param {string} targetPub - Public key of the target user
 * @throws {Error} If user is not authenticated
 */
export const revokeChatsCertificate = async (targetPub) => {
  if (!user.is) throw new Error('User not authenticated');
  if (!targetPub) throw new Error('Target public key is required');

  try {
    await new Promise((resolve, reject) => {
      gun
        .user()
        .get(DAPP_NAME)
        .get('certificates')
        .get(targetPub)
        .get('chats')
        .put(null, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });
  } catch (error) {
    console.error('Error revoking chats certificate:', error);
    throw error;
  }
};

/**
 * Revokes an existing messages certificate for a target user
 *
 * @async
 * @param {string} targetPub - Public key of the target user
 * @throws {Error} If user is not authenticated
 */
export const revokeMessagesCertificate = async (targetPub) => {
  if (!user.is) throw new Error('User not authenticated');
  if (!targetPub) throw new Error('Target public key is required');

  try {
    await new Promise((resolve, reject) => {
      gun
        .user()
        .get(DAPP_NAME)
        .get('certificates')
        .get(targetPub)
        .get('messages')
        .put(null, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });
  } catch (error) {
    console.error('Error revoking messages certificate:', error);
    throw error;
  }
};
