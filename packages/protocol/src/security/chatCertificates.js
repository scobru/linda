import { gun, user, DAPP_NAME } from '../useGun.js';
import SEA from 'gun/sea.js';

/**
 * Creates a chat certificate for communicating with a target user
 *
 * @async
 * @param {string} targetPub - Public key of the target user
 * @returns {Promise<string>} The created certificate
 * @throws {Error} If user is not authenticated
 */
export const createChatsCertificate = async (targetPub) => {
  try {
    if (!user.is) {
      throw new Error('Utente non autenticato');
    }

    console.log('Creazione certificato chat per:', targetPub);

    // Crea il certificato usando SEA.certify
    const certificate = {
      '*': 'chats', // tipo di certificato
      '+': targetPub, // per chi è il certificato
      '-': user.is.pub, // chi ha creato il certificato
      '>': Date.now() + 24 * 60 * 60 * 1000, // timestamp di scadenza (24 ore)
      '?': ['read', 'write'], // permessi
    };

    const signedCert = await SEA.certify([targetPub], certificate, user._.sea);
    if (!signedCert) {
      throw new Error('Impossibile creare il certificato');
    }
    console.log('Certificato chat generato:', signedCert);

    // Salva il certificato pubblico
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('certificates')
        .get('chats')
        .get(targetPub)
        .put(signedCert, (ack) => {
          console.log('Certificato chat pubblico salvato:', ack);
          if (ack.err) {
            console.error('Errore salvataggio certificato pubblico:', ack.err);
            reject(new Error(ack.err));
          } else {
            resolve(ack);
          }
        });
    });

    // Salva il certificato privato
    await new Promise((resolve, reject) => {
      if (!user.is) {
        reject(
          new Error('Utente non autenticato durante il salvataggio privato')
        );
        return;
      }

      // Salva direttamente nel nodo privato dell'utente
      user
        .get('private_certificates')
        .get('chats')
        .get(targetPub)
        .put(signedCert, (ack) => {
          console.log('Tentativo salvataggio certificato chat privato:', ack);
          if (ack.err) {
            console.error('Errore salvataggio certificato privato:', ack.err);
            reject(new Error(ack.err));
          } else {
            // Verifica il salvataggio
            user
              .get('private_certificates')
              .get('chats')
              .get(targetPub)
              .once((data) => {
                if (data === signedCert) {
                  console.log('Certificato privato verificato con successo');
                  resolve();
                } else {
                  reject(
                    new Error('Certificato privato non salvato correttamente')
                  );
                }
              });
          }
        });
    });

    return signedCert;
  } catch (error) {
    console.error('Errore creazione certificato chat:', error);
    throw error;
  }
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
  try {
    if (!user.is) {
      throw new Error('Utente non autenticato');
    }

    console.log('Creazione certificato messaggi per:', targetPub);

    // Crea il certificato usando SEA.certify
    const certificate = {
      '*': 'messages', // tipo di certificato
      '+': targetPub, // per chi è il certificato
      '-': user.is.pub, // chi ha creato il certificato
      '>': Date.now() + 24 * 60 * 60 * 1000, // timestamp di scadenza (24 ore)
      '?': ['send', 'receive'], // permessi
    };

    const signedCert = await SEA.certify([targetPub], certificate, user._.sea);
    if (!signedCert) {
      throw new Error('Impossibile creare il certificato');
    }
    console.log('Certificato messaggi generato:', signedCert);

    // Salva il certificato pubblico
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('certificates')
        .get('messages')
        .get(targetPub)
        .put(signedCert, (ack) => {
          console.log('Certificato messaggi pubblico salvato:', ack);
          if (ack.err) {
            console.error('Errore salvataggio certificato pubblico:', ack.err);
            reject(new Error(ack.err));
          } else {
            resolve(ack);
          }
        });
    });

    // Salva il certificato privato
    await new Promise((resolve, reject) => {
      if (!user.is) {
        reject(
          new Error('Utente non autenticato durante il salvataggio privato')
        );
        return;
      }

      // Salva direttamente nel nodo privato dell'utente
      user
        .get('private_certificates')
        .get('messages')
        .get(targetPub)
        .put(signedCert, (ack) => {
          console.log(
            'Tentativo salvataggio certificato messaggi privato:',
            ack
          );
          if (ack.err) {
            console.error('Errore salvataggio certificato privato:', ack.err);
            reject(new Error(ack.err));
          } else {
            // Verifica il salvataggio
            user
              .get('private_certificates')
              .get('messages')
              .get(targetPub)
              .once((data) => {
                if (data === signedCert) {
                  console.log('Certificato privato verificato con successo');
                  resolve();
                } else {
                  reject(
                    new Error(
                      'Certificato privato messaggi non salvato correttamente'
                    )
                  );
                }
              });
          }
        });
    });

    return signedCert;
  } catch (error) {
    console.error('Errore creazione certificato messaggi:', error);
    throw error;
  }
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
    console.log('Inizio revoca certificati per:', targetPub);

    // Revoca tutti i certificati
    const revocationPromises = [
      // Revoca certificati chat
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get('chats')
          .get(targetPub)
          .put(null, (ack) => {
            console.log('Certificato chat pubblico revocato:', ack);
            resolve(ack);
          });
      }),
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('private_certificates')
          .get('chats')
          .get(targetPub)
          .put(null, (ack) => {
            console.log('Certificato chat privato revocato:', ack);
            resolve(ack);
          });
      }),
      // Revoca certificati messaggi
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get('messages')
          .get(targetPub)
          .put(null, (ack) => {
            console.log('Certificato messaggi pubblico revocato:', ack);
            resolve(ack);
          });
      }),
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('private_certificates')
          .get('messages')
          .get(targetPub)
          .put(null, (ack) => {
            console.log('Certificato messaggi privato revocato:', ack);
            resolve(ack);
          });
      }),
      // Revoca certificati amicizia
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get('friends')
          .get(targetPub)
          .put(null, (ack) => {
            console.log('Certificato amicizia pubblico revocato:', ack);
            resolve(ack);
          });
      }),
      new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('private_certificates')
          .get('friends')
          .get(targetPub)
          .put(null, (ack) => {
            console.log('Certificato amicizia privato revocato:', ack);
            resolve(ack);
          });
      }),
    ];

    // Aspetta che tutte le revoche siano completate
    await Promise.all(revocationPromises);
    console.log('Revoca certificati completata');

    // Attendi un momento per permettere la propagazione
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verifica la revoca con timeout
    const verifyWithTimeout = async (path) => {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout verifica')), 2000)
      );

      const verifyPromise = new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get(path)
          .get(targetPub)
          .once((data) => resolve(data));
      });

      try {
        const result = await Promise.race([verifyPromise, timeoutPromise]);
        return result;
      } catch (error) {
        console.log('Timeout verifica per', path);
        return null;
      }
    };

    const [verifyChat, verifyMsg, verifyFriend] = await Promise.all([
      verifyWithTimeout('chats'),
      verifyWithTimeout('messages'),
      verifyWithTimeout('friends'),
    ]);

    console.log('Verifica revoca certificati:', {
      verifyChat,
      verifyMsg,
      verifyFriend,
    });

    // Considera la revoca riuscita se i certificati sono null o non esistono
    const isRevoked = !verifyChat && !verifyMsg && !verifyFriend;

    if (!isRevoked) {
      console.warn(
        'Alcuni certificati potrebbero non essere stati revocati completamente'
      );
    }

    console.log('Processo di revoca completato');
    return true;
  } catch (error) {
    console.error('Errore revoca certificati:', error);
    return false;
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

export const ensureCertificates = async (targetPub) => {
  try {
    console.log('Verifica certificati per:', targetPub);

    // Genera sempre entrambi i certificati
    console.log('Generazione certificato chat...');
    const chatCert = await createChatsCertificate(targetPub);
    if (!chatCert) {
      throw new Error('Errore generazione certificato chat');
    }

    // Attendi un momento per la propagazione
    await new Promise((resolve) => setTimeout(resolve, 300));

    console.log('Generazione certificato messaggi...');
    const msgCert = await createMessagesCertificate(targetPub);
    if (!msgCert) {
      throw new Error('Errore generazione certificato messaggi');
    }

    // Attendi un momento per la propagazione
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verifica finale con timeout
    const verifyWithTimeout = async (path) => {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout verifica')), 2000)
      );

      const verifyPromise = new Promise((resolve) => {
        gun
          .user()
          .get(DAPP_NAME)
          .get('certificates')
          .get(path)
          .get(targetPub)
          .once((data) => resolve(data));
      });

      try {
        const result = await Promise.race([verifyPromise, timeoutPromise]);
        return result;
      } catch (error) {
        console.log('Timeout verifica per', path);
        return null;
      }
    };

    const [finalChatCert, finalMsgCert] = await Promise.all([
      verifyWithTimeout('chats'),
      verifyWithTimeout('messages'),
    ]);

    console.log('Verifica finale certificati:', {
      finalChatCert,
      finalMsgCert,
      chatCert: !!chatCert,
      msgCert: !!msgCert,
    });

    // Verifica che almeno uno dei certificati sia presente
    const hasChatCert = finalChatCert || chatCert;
    const hasMsgCert = finalMsgCert || msgCert;

    if (!hasChatCert || !hasMsgCert) {
      console.error('Certificati mancanti dopo la generazione:', {
        hasChatCert,
        hasMsgCert,
      });
      throw new Error('Verifica finale certificati fallita');
    }

    return true;
  } catch (error) {
    console.error('Errore verifica/generazione certificati:', error);
    return false;
  }
};
