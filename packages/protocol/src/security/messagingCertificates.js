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
  try {
    console.log('Creazione certificato chat per:', publicKey);

    const certPair = await SEA.pair();
    const certificate = {
      type: 'chat',
      pub: user.is.pub,
      target: publicKey,
      timestamp: Date.now(),
      certKey: certPair.pub,
      permissions: ['send', 'receive'],
    };

    const signedCert = await SEA.sign(certificate, user._.sea);
    console.log('Certificato chat generato:', signedCert);

    // Salva il certificato
    await Promise.all([
      // Pubblico
      new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('certificates')
          .get('chats')
          .get(publicKey)
          .put(signedCert, (ack) => {
            console.log('Certificato chat pubblico salvato:', ack);
            callback({
              errMessage: undefined,
              errCode: undefined,
              certificate: signedCert,
              success: 'Generated new chats certificate.',
            });
            resolve(ack);
          });
      }),
      // Privato
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('private_certificates')
          .get('chats')
          .get(publicKey)
          .put(signedCert, (ack) => {
            console.log('Certificato chat privato salvato:', ack);
            resolve(ack);
          });
      }),
    ]);

    return signedCert;
  } catch (error) {
    console.error('Errore creazione certificato chat:', error);
    callback({
      errMessage: error.message,
      errCode: 'chats-certificate-creation-error',
      success: undefined,
    });
    return null;
  }
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
  try {
    console.log('Creazione certificato messaggi per:', publicKey);

    const certPair = await SEA.pair();
    const certificate = {
      type: 'message',
      pub: user.is.pub,
      target: publicKey,
      timestamp: Date.now(),
      certKey: certPair.pub,
      permissions: ['send', 'receive'],
    };

    const signedCert = await SEA.sign(certificate, user._.sea);
    console.log('Certificato messaggi generato:', signedCert);

    // Salva il certificato
    await Promise.all([
      // Pubblico
      new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('certificates')
          .get('messages')
          .get(publicKey)
          .put(signedCert, (ack) => {
            console.log('Certificato messaggi pubblico salvato:', ack);
            callback({
              errMessage: undefined,
              errCode: undefined,
              certificate: signedCert,
              success: 'Generated new messages certificate.',
            });
            resolve(ack);
          });
      }),
      // Privato
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('private_certificates')
          .get('messages')
          .get(publicKey)
          .put(signedCert, (ack) => {
            console.log('Certificato messaggi privato salvato:', ack);
            resolve(ack);
          });
      }),
    ]);

    return signedCert;
  } catch (error) {
    console.error('Errore creazione certificato messaggi:', error);
    callback({
      errMessage: error.message,
      errCode: 'messages-certificate-creation-error',
      success: undefined,
    });
    return null;
  }
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
