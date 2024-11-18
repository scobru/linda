import { gun, user, DAPP_NAME,SEA } from '../useGun.js';
import { certificateManager } from './certificateManager.js';

/**
 * Creates a friend request certificate that allows a user to send friend requests
 *
 * @async
 * @function createFriendRequestCertificate
 * @param {string} targetPub - Public key of the user to add as friend
 * @returns {Promise<string>} The created certificate
 * @throws {Error} If user is not authenticated
 */
export const createFriendRequestCertificate = async (targetPub) => {
  if (!user.is) throw new Error('User not authenticated');

  // Crea un certificato di autorizzazione specifico per le richieste di amicizia
  const authCertificate = await certificateManager.createAuthorizationCertificate(
    targetPub,
    ['write_friend_requests']
  );

  // Salva il certificato nello spazio privato del destinatario in modo cifrato
  const encryptedCert = await SEA.encrypt(
    authCertificate,
    await SEA.secret(user._.sea.epub, targetPub)
  );

  await gun
    .user(targetPub)
    .get(DAPP_NAME)
    .get('private_certificates')
    .get(user.is.pub)
    .get('friend_requests')
    .put(encryptedCert);

  return authCertificate;
};

export const createNotificationCertificate = async () => {
  if (!user.is) throw new Error('User not authenticated');

  const certificate = await certificateManager.createCertificate({
    type: 'notification',
    pub: user.is.pub,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  });

  gun
    .user()
    .get(DAPP_NAME)
    .get('certificates')
    .get('notifications')
    .put(certificate);

  return certificate;
};

/**
 * Generates a certificate for adding a specific user as a friend
 *
 * @async
 * @function generateAddFriendCertificate
 * @param {string} targetPub - Public key of the user to add as friend
 * @returns {Promise<string>} The created certificate
 * @throws {Error} If user is not authenticated
 */
export const generateAddFriendCertificate = async (targetPub) => {
  if (!user.is) throw new Error('User not authenticated');

  try {
    const certificate = await certificateManager.createCertificate({
      type: 'addFriend',
      pub: user.is.pub,
      target: targetPub,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log('Certificate generated:', certificate);

    // Salva il certificato con verifica
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout nel salvataggio del certificato'));
      }, 5000);

      gun
        .user()
        .get(DAPP_NAME)
        .get('certificates')
        .get(targetPub)
        .get('addFriend')
        .put(certificate, (ack) => {
          clearTimeout(timeoutId);
          if (ack.err) {
            reject(new Error(ack.err));
          } else {
            resolve(true);
          }
        });
    });

    console.log('Certificate saved successfully');
    return { errorMessage: null, errCode: null, success: true };
  } catch (error) {
    console.error('Error generating certificate:', error);
    return {
      errorMessage: error.message,
      errCode: 'certificate-error',
      success: false,
    };
  }
};
