import { gun, SEA } from '../../../state';

let createChatsCertificate = async (publicKey, callback = () => {}) => {
  let certificateExists = gun
    .user()
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

let createMessagesCertificate = async (publicKey, callback = () => {}) => {
  let certificateExists = gun
    .user()
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

let revokeChatsCertificate = async (publicKey, callback = () => {}) => {
  try {
    // Verifica lo stato attuale del certificato
    const currentCert =  gun.user()
      .get('certificates')
      .get(publicKey)
      .get('chats')
      .once();

    if (!currentCert) {
      return callback({
        success: true,
        message: 'Certificato già revocato'
      });
    }

    // Revoca il certificato e tutti i certificati correlati
    await Promise.all([
      gun.user().get('certificates').get(publicKey).get('chats').put(null),
      gun.user().get('certificates').get(publicKey).get('messages').put(null),
      gun.user().get('certificates').get(publicKey).get('groups').put(null)
    ]);

    return callback({
      success: true,
      message: 'Certificati revocati con successo'
    });
  } catch (err) {
    return callback({
      errMessage: err.message,
      errCode: 'certificate-revocation-error'
    });
  }
};

let revokeMessagesCertificate = async (publicKey, callback = () => {}) => {
  try {
    gun.user().get('certificates').get(publicKey).get('messages').put(null);

    return callback({
      errMessage: undefined,
      errCode: undefined,
      success: 'Certificato messaggi revocato con successo.',
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
