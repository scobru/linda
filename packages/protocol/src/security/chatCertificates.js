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

    const certPair = await SEA.pair();
    const certificate = {
      type: 'chats',
      pub: user.is.pub,
      target: targetPub,
      timestamp: Date.now(),
      certKey: certPair.pub,
      permissions: ['read', 'write'],
    };

    const signedCert = await SEA.sign(certificate, user._.sea);
    console.log('Certificato chat generato:', signedCert);

    // Salva il certificato pubblico
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('certificates')
        .get('chats')
        .get(user.is.pub)
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

      // Prepara il certificato per il salvataggio privato
      const privateCertData = {
        cert: signedCert,
        timestamp: Date.now(),
        type: 'chats',
      };

      // Cifra il certificato
      SEA.encrypt(
        JSON.stringify(privateCertData),
        user._.sea,
        async (encryptedData) => {
          try {
            // Salva il certificato cifrato
            await new Promise((innerResolve, innerReject) => {
              user
                .get('private_certificates')
                .get('chats')
                .get(user.is.pub)
                .put(encryptedData, (ack) => {
                  console.log(
                    'Tentativo salvataggio certificato chat privato:',
                    ack
                  );
                  if (ack.err) {
                    console.error(
                      'Errore salvataggio certificato privato:',
                      ack.err
                    );
                    innerReject(new Error(ack.err));
                  } else {
                    innerResolve(ack);
                  }
                });
            });

            // Attendi un momento per la propagazione
            await new Promise((r) => setTimeout(r, 100));

            // Verifica il salvataggio
            const savedData = await new Promise((verifyResolve) => {
              user
                .get('private_certificates')
                .get('chats')
                .get(user.is.pub)
                .once(async (data) => {
                  if (!data) {
                    console.error('Nessun dato salvato trovato');
                    verifyResolve(null);
                    return;
                  }
                  try {
                    const decrypted = await SEA.decrypt(data, user._.sea);
                    if (!decrypted) {
                      console.error(
                        'Impossibile decifrare il certificato salvato'
                      );
                      verifyResolve(null);
                      return;
                    }
                    const parsedData = JSON.parse(decrypted);
                    verifyResolve(parsedData);
                  } catch (err) {
                    console.error('Errore durante la decifratura:', err);
                    verifyResolve(null);
                  }
                });
            });

            if (savedData && savedData.cert === signedCert) {
              console.log('Certificato privato verificato con successo');
              resolve();
            } else {
              console.error('Verifica certificato fallita:', {
                saved: savedData?.cert,
                original: signedCert,
              });
              reject(
                new Error('Certificato privato non salvato correttamente')
              );
            }
          } catch (error) {
            console.error('Errore durante il salvataggio/verifica:', error);
            reject(error);
          }
        }
      );
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

    const certPair = await SEA.pair();
    const certificate = {
      type: 'messages',
      pub: user.is.pub,
      target: targetPub,
      timestamp: Date.now(),
      certKey: certPair.pub,
      permissions: ['send', 'receive'],
    };

    const signedCert = await SEA.sign(certificate, user._.sea);
    console.log('Certificato messaggi generato:', signedCert);

    // Salva il certificato pubblico
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('certificates')
        .get('messages')
        .get(user.is.pub)
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

      // Prepara il certificato per il salvataggio privato
      const privateCertData = {
        cert: signedCert,
        timestamp: Date.now(),
        type: 'messages',
      };

      // Cifra il certificato
      SEA.encrypt(
        JSON.stringify(privateCertData),
        user._.sea,
        async (encryptedData) => {
          try {
            // Salva il certificato cifrato
            await new Promise((innerResolve, innerReject) => {
              user
                .get('private_certificates')
                .get('messages')
                .get(user.is.pub)
                .put(encryptedData, (ack) => {
                  console.log(
                    'Tentativo salvataggio certificato messaggi privato:',
                    ack
                  );
                  if (ack.err) {
                    console.error(
                      'Errore salvataggio certificato privato:',
                      ack.err
                    );
                    innerReject(new Error(ack.err));
                  } else {
                    innerResolve(ack);
                  }
                });
            });

            // Attendi un momento per la propagazione
            await new Promise((r) => setTimeout(r, 100));

            // Verifica il salvataggio
            const savedData = await new Promise((verifyResolve) => {
              user
                .get('private_certificates')
                .get('messages')
                .get(user.is.pub)
                .once(async (data) => {
                  if (!data) {
                    console.error('Nessun dato salvato trovato');
                    verifyResolve(null);
                    return;
                  }
                  try {
                    const decrypted = await SEA.decrypt(data, user._.sea);
                    if (!decrypted) {
                      console.error(
                        'Impossibile decifrare il certificato salvato'
                      );
                      verifyResolve(null);
                      return;
                    }
                    const parsedData = JSON.parse(decrypted);
                    verifyResolve(parsedData);
                  } catch (err) {
                    console.error('Errore durante la decifratura:', err);
                    verifyResolve(null);
                  }
                });
            });

            if (savedData && savedData.cert === signedCert) {
              console.log(
                'Certificato privato messaggi verificato con successo'
              );
              resolve();
            } else {
              console.error('Verifica certificato messaggi fallita:', {
                saved: savedData?.cert,
                original: signedCert,
              });
              reject(
                new Error(
                  'Certificato privato messaggi non salvato correttamente'
                )
              );
            }
          } catch (error) {
            console.error('Errore durante il salvataggio/verifica:', error);
            reject(error);
          }
        }
      );
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
