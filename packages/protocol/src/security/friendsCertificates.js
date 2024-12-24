import { gun, user, DAPP_NAME } from '../useGun.js';
import SEA from 'gun/sea.js';

/**
 * Crea un certificato per le richieste di amicizia
 */
export const createFriendRequestCertificate = async () => {
  if (!user?.is) return null;

  try {
    const certPair = await SEA.pair();
    const certificate = {
      type: 'friendRequest',
      pub: user?.is?.pub,
      alias: user?.is?.alias,
      timestamp: Date.now(),
      certKey: certPair.pub,
      permissions: ['send', 'receive'],
    };

    const signedCert = await SEA.sign(certificate, user?._.sea);

    // Salva sia nella sezione pubblica che privata
    await Promise.resolve([
      // Certificato pubblico
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get('friendRequests')
          .put(signedCert, (ack) => {
            resolve(ack);
          });
      }),
      // Certificato privato
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('private_certificates')
          .get('friendRequests')
          .put(signedCert, (ack) => {
            resolve(ack);
          });
      }),
    ]);

    return signedCert;
  } catch (error) {
    console.error('Errore creazione certificato richieste amicizia:', error);
    return null;
  }
};

/**
 * Genera un certificato per l'aggiunta di amici
 */
export const generateAddFriendCertificate = async (targetPub) => {
  if (!user?.is) return null;

  try {
    const certPair = await SEA.pair();
    const certificate = {
      type: 'addFriend',
      pub: user?.is?.pub,
      target: targetPub,
      timestamp: Date.now(),
      certKey: certPair.pub,
      permissions: ['add'],
    };

    const signedCert = await SEA.sign(certificate, user?._.sea);
    return { success: true, signedCert };
  } catch (error) {
    console.error('Errore generazione certificato add friend:', error);
    return { success: false, errorMessage: error.message };
  }
};

/**
 * Crea un certificato per le notifiche
 */
export const createNotificationCertificate = async () => {
  if (!user?.is) return null;

  try {
    const certPair = await SEA.pair();
    const certificate = {
      type: 'notification',
      pub: user?.is?.pub,
      alias: user?.is?.alias,
      timestamp: Date.now(),
      certKey: certPair.pub,
      permissions: ['receive'],
    };

    const signedCert = await SEA.sign(certificate, user._.sea);

    await new Promise((resolve) => {
      gun
        .user()
        .get(DAPP_NAME)
        .get('certificates')
        .get('notifications')
        .put(signedCert, (ack) => {
          resolve(ack);
        });
    });

    return signedCert;
  } catch (error) {
    console.error('Errore creazione certificato notifiche:', error);
    return null;
  }
};

/**
 * Verifica se esiste un certificato di autorizzazione
 */
export const checkAuthorizationCertificate = async (type) => {
  if (!user?.is) return false;

  try {
    const cert = await gun
      .user()
      .get(DAPP_NAME)
      .get('certificates')
      .get(type)
      .then();

    return !!cert;
  } catch (error) {
    console.error('Errore verifica certificato:', error);
    return false;
  }
};

export const friendsCertificates = {
  generateAuthCertificate: async () => {
    if (!user?.is) return null;

    try {
      const certPair = await SEA.pair();
      const certificate = {
        pub: user.is.pub,
        alias: user.is.alias,
        timestamp: Date.now(),
        certKey: certPair.pub,
      };

      const signedCert = await SEA.sign(certificate, user._.sea);

      await new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('authCertificate')
          .put(signedCert, (ack) => {
            resolve(ack);
          });
      });

      return signedCert;
    } catch (error) {
      console.error('Errore generazione certificato:', error);
      return null;
    }
  },

  getAuthCertificate: async () => {
    if (!user.is) return null;

    try {
      const cert = await new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('authCertificate')
          .once((data) => {
            resolve(data);
          });
      });

      if (!cert) {
        return await friendsCertificates.generateAuthCertificate();
      }

      return cert;
    } catch (error) {
      console.error('Errore recupero certificato:', error);
      return null;
    }
  },

  verifyCertificate: async (cert, pubKey) => {
    try {
      if (!cert) return false;
      const verified = await SEA.verify(cert, pubKey);
      if (!verified) return false;
      const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - verified.timestamp > MAX_AGE) return false;
      return true;
    } catch (error) {
      console.error('Errore verifica certificato:', error);
      return false;
    }
  },
};

export default {
  createFriendRequestCertificate,
  generateAddFriendCertificate,
  createNotificationCertificate,
  friendsCertificates,
};
