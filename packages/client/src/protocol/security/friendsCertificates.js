import { gun, user, DAPP_NAME } from '../useGun.js';
import SEA from 'gun/sea.js';
import {
  createChatsCertificate,
  createMessagesCertificate,
} from './chatCertificates.js';

/**
 * Crea un certificato per le richieste di amicizia
 */
export const createFriendRequestCertificate = async () => {
  if (!user?.is) {
    console.error('Utente non autenticato');
    return null;
  }

  try {
    // Verifica che l'utente abbia una chiave di firma valida
    if (!user._.sea) {
      console.error('Chiave di firma mancante');
      return null;
    }

    // Genera una nuova coppia di chiavi per il certificato
    const certPair = await SEA.pair();
    if (!certPair) {
      console.error(
        'Impossibile generare la coppia di chiavi per il certificato'
      );
      return null;
    }

    // Prepara i dati del certificato
    const certificate = {
      type: 'friendRequest',
      pub: user.is.pub,
      alias: user.is.alias || user.is.pub,
      timestamp: Date.now(),
      certKey: certPair.pub,
      permissions: ['send', 'receive'],
    };

    // Verifica che tutti i campi necessari siano presenti
    if (!certificate.pub || !certificate.certKey) {
      console.error('Dati certificato incompleti');
      return null;
    }

    // Firma il certificato
    let signedCert;
    try {
      signedCert = await SEA.sign(JSON.stringify(certificate), user._.sea);
    } catch (error) {
      console.error('Errore durante la firma del certificato:', error);
      return null;
    }

    if (!signedCert) {
      console.error('Firma del certificato fallita');
      return null;
    }

    // Verifica la firma
    const verified = await SEA.verify(signedCert, user._.sea.pub);
    if (!verified) {
      console.error('Verifica firma fallita');
      return null;
    }

    // Salva il certificato con retry
    const saveCertificate = async (path, maxRetries = 3) => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          await new Promise((resolve, reject) => {
            path.put(signedCert, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve(ack);
            });
          });
          return true;
        } catch (error) {
          console.warn(`Tentativo ${i + 1} fallito:`, error);
          if (i === maxRetries - 1) throw error;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      return false;
    };

    // Salva sia nella sezione pubblica che privata
    try {
      await Promise.all([
        saveCertificate(
          gun.user().get(DAPP_NAME).get('certificates').get('friendRequests')
        ),
        saveCertificate(
          gun
            .user()
            .get(DAPP_NAME)
            .get('private_certificates')
            .get('friendRequests')
        ),
      ]);
    } catch (error) {
      console.error('Errore durante il salvataggio dei certificati:', error);
      return null;
    }

    // Verifica il salvataggio
    const [publicCert, privateCert] = await Promise.all([
      gun
        .user()
        .get(DAPP_NAME)
        .get('certificates')
        .get('friendRequests')
        .then(),
      gun
        .user()
        .get(DAPP_NAME)
        .get('private_certificates')
        .get('friendRequests')
        .then(),
    ]);

    if (!publicCert || !privateCert) {
      console.error('Verifica salvataggio certificati fallita');
      return null;
    }

    console.log('Certificato creato e salvato con successo');
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
  if (!user?.is) {
    console.error('Utente non autenticato');
    return null;
  }

  try {
    // Verifica che l'utente abbia una chiave di firma valida
    if (!user._.sea) {
      console.error('Chiave di firma mancante');
      return null;
    }

    // Genera una nuova coppia di chiavi per il certificato
    const certPair = await SEA.pair();
    if (!certPair) {
      console.error(
        'Impossibile generare la coppia di chiavi per il certificato'
      );
      return null;
    }

    // Prepara i dati del certificato
    const certificate = {
      type: 'notification',
      pub: user.is.pub,
      alias: user.is.alias || user.is.pub,
      timestamp: Date.now(),
      certKey: certPair.pub,
      permissions: ['receive'],
    };

    // Verifica che tutti i campi necessari siano presenti
    if (!certificate.pub || !certificate.certKey) {
      console.error('Dati certificato incompleti');
      return null;
    }

    // Firma il certificato
    let signedCert;
    try {
      signedCert = await SEA.sign(JSON.stringify(certificate), user._.sea);
    } catch (error) {
      console.error('Errore durante la firma del certificato:', error);
      return null;
    }

    if (!signedCert) {
      console.error('Firma del certificato fallita');
      return null;
    }

    // Verifica la firma
    const verified = await SEA.verify(signedCert, user._.sea.pub);
    if (!verified) {
      console.error('Verifica firma fallita');
      return null;
    }

    // Salva il certificato con retry
    const saveCertificate = async (maxRetries = 3) => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          await new Promise((resolve, reject) => {
            gun
              .user()
              .get(DAPP_NAME)
              .get('certificates')
              .get('notifications')
              .put(signedCert, (ack) => {
                if (ack.err) reject(new Error(ack.err));
                else resolve(ack);
              });
          });
          return true;
        } catch (error) {
          console.warn(`Tentativo ${i + 1} fallito:`, error);
          if (i === maxRetries - 1) throw error;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      return false;
    };

    // Salva il certificato
    try {
      const saved = await saveCertificate();
      if (!saved) {
        console.error('Salvataggio certificato fallito');
        return null;
      }
    } catch (error) {
      console.error('Errore durante il salvataggio del certificato:', error);
      return null;
    }

    // Verifica il salvataggio
    const savedCert = await gun
      .user()
      .get(DAPP_NAME)
      .get('certificates')
      .get('notifications')
      .then();

    if (!savedCert) {
      console.error('Verifica salvataggio certificato fallita');
      return null;
    }

    console.log('Certificato notifiche creato e salvato con successo');
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

/**
 * Gestisce l'accettazione di una richiesta di amicizia
 * @param {string} senderPub - Public key del mittente
 * @returns {Promise<boolean>} True se l'accettazione è riuscita
 */
export const handleFriendRequestAccepted = async (senderPub) => {
  try {
    console.log('Inizio accettazione richiesta di amicizia da:', senderPub);

    // 1. Rimuovi eventuali vecchi certificati
    console.log('Rimozione vecchi certificati...');
    await Promise.all([
      // Rimuovi certificati chat
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get('chats')
          .get(senderPub)
          .put(null, (ack) => resolve(ack));
      }),
      // Rimuovi certificati messaggi
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get('messages')
          .get(senderPub)
          .put(null, (ack) => resolve(ack));
      }),
    ]);

    // 2. Genera nuovi certificati per la chat
    console.log('Generazione nuovi certificati chat e messaggi...');
    const chatCert = await createChatsCertificate(senderPub);
    console.log('Certificato chat generato:', chatCert);

    if (!chatCert) {
      throw new Error('Errore nella generazione del certificato chat');
    }

    const msgCert = await createMessagesCertificate(senderPub);
    console.log('Certificato messaggi generato:', msgCert);

    if (!msgCert) {
      throw new Error('Errore nella generazione del certificato messaggi');
    }

    // 3. Genera certificato di autorizzazione amicizia
    console.log('Generazione certificato amicizia...');
    const certPair = await SEA.pair();
    const certificate = {
      type: 'friendship',
      pub: user.is.pub,
      target: senderPub,
      timestamp: Date.now(),
      certKey: certPair.pub,
      permissions: ['friend', 'chat', 'message'],
      status: 'active',
    };

    const signedCert = await SEA.sign(certificate, user._.sea);
    console.log('Certificato amicizia generato:', signedCert);

    // 4. Salva il certificato di amicizia
    console.log('Salvataggio certificati...');
    await Promise.all([
      // Certificato pubblico
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get('friends')
          .get(senderPub)
          .put(signedCert, (ack) => {
            console.log('Certificato amicizia pubblico salvato:', ack);
            resolve(ack);
          });
      }),
      // Certificato privato
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('private_certificates')
          .get('friends')
          .get(senderPub)
          .put(signedCert, (ack) => {
            console.log('Certificato amicizia privato salvato:', ack);
            resolve(ack);
          });
      }),
    ]);

    // 5. Verifica che tutti i certificati siano stati creati
    const verifyChat = await gun
      .user()
      .get(DAPP_NAME)
      .get('certificates')
      .get('chats')
      .get(senderPub)
      .once();
    const verifyMsg = await gun
      .user()
      .get(DAPP_NAME)
      .get('certificates')
      .get('messages')
      .get(senderPub)
      .once();

    console.log('Verifica certificati:', { chat: verifyChat, msg: verifyMsg });

    if (!verifyChat || !verifyMsg) {
      throw new Error('Verifica certificati fallita');
    }

    console.log('Accettazione richiesta completata con successo');
    return true;
  } catch (error) {
    console.error('Errore accettazione richiesta di amicizia:', error);
    return false;
  }
};

export default {
  createFriendRequestCertificate,
  generateAddFriendCertificate,
  createNotificationCertificate,
  friendsCertificates,
};
