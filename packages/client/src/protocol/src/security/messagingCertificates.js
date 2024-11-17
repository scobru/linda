import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Creates a chat certificate for a given public key
 *
 * @async
 * @param {string} publicKey - Public key of the target user
 * @param {Function} callback - Callback function to handle result
 * @returns {void}
 */
let createChatsCertificate = async (publicKey, callback = () => {}) => {
  let certificateExists = gun
    .user()
    .get(DAPP_NAME)
    .get('certificates')
    .get(publicKey)
    .get('chats')
    .once();

  if (certificateExists) return;

  let certificate = await SEA.certify(
    [publicKey],
    [{ '*': 'chats' }],
    await gun.user().pair(),
    null
  );

  gun
    .user()
    .get(DAPP_NAME)
    .get('certificates')
    .get(publicKey)
    .get('chats')
    .put(certificate, ({ err }) => {
      if (err)
        return callback({
          errMessage: err,
          errCode: 'chats-certificate-creation-error',
          success: undefined,
        });
      else
        return callback({
          errMessage: undefined,
          errCode: undefined,
          certificate,
          success: 'Generated new chats certificate.',
        });
    });
};

/**
 * Creates a messages certificate for a given public key
 *
 * @async
 * @param {string} publicKey - Public key of the target user
 * @param {Function} callback - Callback function to handle result
 * @returns {void}
 */
let createMessagesCertificate = async (publicKey, callback = () => {}) => {
  let certificateExists = gun
    .user()
    .get(DAPP_NAME)
    .get('certificates')
    .get(publicKey)
    .get('messages')
    .once();

  if (certificateExists) return;

  let certificate = await SEA.certify(
    [publicKey],
    [{ '*': 'messages' }],
    await gun.user().pair(),
    null
  );

  gun
    .user()
    .get(DAPP_NAME)
    .get('certificates')
    .get(publicKey)
    .get('messages')
    .put(certificate, ({ err }) => {
      if (err)
        return callback({
          errMessage: err,
          errCode: 'messages-certificate-creation-error',
          success: undefined,
        });
      else
        return callback({
          errMessage: undefined,
          errCode: undefined,
          certificate,
          success: 'Generated new messages certificate.',
        });
    });
};

/**
 * Revokes chat certificates for a given public key
 *
 * @async
 * @param {string} publicKey - Public key of the target user
 * @param {Function} callback - Callback function to handle result
 * @returns {void}
 */
let revokeChatsCertificate = async (publicKey, callback = () => {}) => {
  try {
    // Verify current certificate status
    const currentCert = gun
      .user()
      .get(DAPP_NAME)
      .get('certificates')
      .get(publicKey)
      .get('chats')
      .once();

    if (!currentCert) {
      return callback({
        success: true,
        message: 'Certificate already revoked',
      });
    }

    // Revoke certificate and all related certificates
    await Promise.all([
      gun
        .user()
        .get(DAPP_NAME)
        .get('certificates')
        .get(publicKey)
        .get('chats')
        .put(null),
      gun
        .user()
        .get(DAPP_NAME)
        .get('certificates')
        .get(publicKey)
        .get('messages')
        .put(null),
      gun
        .user()
        .get(DAPP_NAME)
        .get('certificates')
        .get(publicKey)
        .get('groups')
        .put(null),
    ]);

    return callback({
      success: true,
      message: 'Certificates successfully revoked',
    });
  } catch (err) {
    return callback({
      errMessage: err.message,
      errCode: 'certificate-revocation-error',
    });
  }
};

/**
 * Revokes messages certificate for a given public key
 *
 * @async
 * @param {string} publicKey - Public key of the target user
 * @param {Function} callback - Callback function to handle result
 * @returns {void}
 */
let revokeMessagesCertificate = async (publicKey, callback = () => {}) => {
  try {
    gun
      .user()
      .get(DAPP_NAME)
      .get('certificates')
      .get(publicKey)
      .get('messages')
      .put(null);

    return callback({
      errMessage: undefined,
      errCode: undefined,
      success: 'Messages certificate successfully revoked.',
    });
  } catch (err) {
    return callback({
      errMessage: err.message,
      errCode: 'messages-certificate-revocation-error',
      success: undefined,
    });
  }
};

export {
  createChatsCertificate,
  createMessagesCertificate,
  revokeChatsCertificate,
  revokeMessagesCertificate,
};
