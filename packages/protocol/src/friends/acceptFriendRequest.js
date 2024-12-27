import { gun, user, DAPP_NAME } from '../useGun.js';
import {
  createMessagesCertificate,
  createChatsCertificate,
  certificateManager,
} from '../security/index.js';

const acceptFriendRequest = async (request) => {
  if (!user?.is) {
    throw new Error('Utente non autenticato');
  }

  console.log('Accepting friend request:', request);

  try {
    // Verifica se sono già amici
    const alreadyFriends = await new Promise((resolve) => {
      let found = false;
      gun
        .get(DAPP_NAME)
        .get('friendships')
        .map()
        .once((data) => {
          if (
            data &&
            ((data.user1 === user.is.pub && data.user2 === request.from) ||
              (data.user1 === request.from && data.user2 === user.is.pub))
          ) {
            found = true;
          }
        });
      setTimeout(() => resolve(found), 1000);
    });

    if (alreadyFriends) {
      // Se sono già amici, rimuovi solo la richiesta
      await cleanupFriendRequests(request);
      return {
        success: true,
        message: 'Siete già amici',
        alreadyFriends: true,
      };
    }

    // Verifica e rigenera i certificati se necessario
    console.log('Verifica certificati esistenti...');
    const [
      existingPublicMessagesCert,
      existingPrivateMessagesCert,
      existingPublicChatsCert,
      existingPrivateChatsCert,
    ] = await Promise.all([
      // Certificati pubblici
      gun
        .get(DAPP_NAME)
        .get('certificates')
        .get('messages')
        .get(user.is.pub)
        .then(),
      // Certificati privati
      user.get('private_certificates').get('messages').get(request.from).then(),
      // Certificati chat pubblici
      gun
        .get(DAPP_NAME)
        .get('certificates')
        .get('chats')
        .get(user.is.pub)
        .then(),
      // Certificati chat privati
      user.get('private_certificates').get('chats').get(request.from).then(),
    ]);

    let messagesCertificate =
      existingPublicMessagesCert || existingPrivateMessagesCert;
    let chatsCertificate = existingPublicChatsCert || existingPrivateChatsCert;

    // Verifica validità certificati esistenti
    const [isMessagesCertValid, isChatsCertValid] = await Promise.all([
      messagesCertificate
        ? certificateManager.verifyCertificate(
            messagesCertificate,
            request.from,
            'messages'
          )
        : Promise.resolve(false),
      chatsCertificate
        ? certificateManager.verifyCertificate(
            chatsCertificate,
            request.from,
            'chats'
          )
        : Promise.resolve(false),
    ]);

    console.log('Stato certificati:', {
      messages: {
        public: existingPublicMessagesCert,
        private: existingPrivateMessagesCert,
        valid: isMessagesCertValid,
      },
      chats: {
        public: existingPublicChatsCert,
        private: existingPrivateChatsCert,
        valid: isChatsCertValid,
      },
    });

    // Rigenera certificati non validi
    if (!isMessagesCertValid) {
      console.log('Rigenerazione certificato messaggi...');
      messagesCertificate = await createMessagesCertificate(request.from);
      if (!messagesCertificate) {
        throw new Error('Impossibile generare il certificato messaggi');
      }

      // Salva il certificato messaggi sia pubblicamente che privatamente
      await Promise.all([
        // Pubblico
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('messages')
            .get(user.is.pub)
            .put(messagesCertificate, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        }),
        // Privato
        new Promise((resolve, reject) => {
          user
            .get('private_certificates')
            .get('messages')
            .get(request.from)
            .put(messagesCertificate, (ack) => {
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        }),
      ]);

      // Verifica il salvataggio
      const [publicMessagesCert, privateMessagesCert] = await Promise.all([
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('messages')
            .get(user.is.pub)
            .once((cert) => {
              console.log('Certificato messaggi pubblico recuperato:', cert);
              resolve(cert);
            });
        }),
        new Promise((resolve) => {
          user
            .get('private_certificates')
            .get('messages')
            .get(request.from)
            .once((cert) => {
              console.log('Certificato messaggi privato recuperato:', cert);
              resolve(cert);
            });
        }),
      ]);

      if (!publicMessagesCert || !privateMessagesCert) {
        throw new Error('Errore nel salvataggio del certificato messaggi');
      }

      console.log('Certificato messaggi salvato:', {
        public: publicMessagesCert,
        private: privateMessagesCert,
      });
    }

    if (!isChatsCertValid) {
      console.log('Rigenerazione certificato chat...');
      chatsCertificate = await createChatsCertificate(request.from);
      if (!chatsCertificate) {
        throw new Error('Impossibile generare il certificato chat');
      }

      console.log('Salvataggio certificato chat...');
      // Salva il certificato chat sia pubblicamente che privatamente
      await Promise.all([
        // Pubblico
        new Promise((resolve, reject) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('chats')
            .get(user.is.pub)
            .put(chatsCertificate, (ack) => {
              console.log('Salvataggio certificato chat pubblico:', ack);
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        }),
        // Privato
        new Promise((resolve, reject) => {
          user
            .get('private_certificates')
            .get('chats')
            .get(request.from)
            .put(chatsCertificate, (ack) => {
              console.log('Salvataggio certificato chat privato:', ack);
              if (ack.err) reject(new Error(ack.err));
              else resolve();
            });
        }),
      ]);

      // Attendi un momento per la propagazione
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verifica il salvataggio
      console.log('Verifica salvataggio certificati chat...');
      const [publicChatsCert, privateChatsCert] = await Promise.all([
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get('certificates')
            .get('chats')
            .get(user.is.pub)
            .once((cert) => {
              console.log('Certificato chat pubblico recuperato:', cert);
              resolve(cert);
            });
        }),
        new Promise((resolve) => {
          user
            .get('private_certificates')
            .get('chats')
            .get(request.from)
            .once((cert) => {
              console.log('Certificato chat privato recuperato:', cert);
              resolve(cert);
            });
        }),
      ]);

      if (!publicChatsCert || !privateChatsCert) {
        console.error('Errore salvataggio certificati chat:', {
          public: publicChatsCert,
          private: privateChatsCert,
        });
        throw new Error('Errore nel salvataggio del certificato chat');
      }

      console.log('Certificato chat salvato:', {
        public: publicChatsCert,
        private: privateChatsCert,
      });

      // Verifica la validità dei certificati salvati
      const [isPublicValid, isPrivateValid] = await Promise.all([
        certificateManager.verifyCertificate(
          publicChatsCert,
          request.from,
          'chats'
        ),
        certificateManager.verifyCertificate(
          privateChatsCert,
          request.from,
          'chats'
        ),
      ]);

      if (!isPublicValid || !isPrivateValid) {
        console.error('Certificati chat non validi:', {
          isPublicValid,
          isPrivateValid,
        });
        throw new Error('I certificati chat salvati non sono validi');
      }

      console.log('Certificati chat verificati con successo');
    }

    // Verifica finale dei certificati
    const [
      finalPublicMessagesCert,
      finalPrivateMessagesCert,
      finalPublicChatsCert,
      finalPrivateChatsCert,
    ] = await Promise.all([
      // Certificati pubblici messaggi
      new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('certificates')
          .get('messages')
          .get(user.is.pub) // Cambiato da request.from a user.is.pub
          .once((cert) => resolve(cert));
      }),
      // Certificati privati messaggi
      new Promise((resolve) => {
        user
          .get('private_certificates')
          .get('messages')
          .get(request.from) // Usa request.from per i certificati privati
          .once((cert) => resolve(cert));
      }),
      // Certificati pubblici chat
      new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('certificates')
          .get('chats')
          .get(user.is.pub) // Cambiato da request.from a user.is.pub
          .once((cert) => resolve(cert));
      }),
      // Certificati privati chat
      new Promise((resolve) => {
        user
          .get('private_certificates')
          .get('chats')
          .get(request.from) // Usa request.from per i certificati privati
          .once((cert) => resolve(cert));
      }),
    ]);

    if (
      !finalPublicMessagesCert ||
      !finalPrivateMessagesCert ||
      !finalPublicChatsCert ||
      !finalPrivateChatsCert
    ) {
      console.error('Certificati mancanti nella verifica finale:', {
        finalPublicMessagesCert,
        finalPrivateMessagesCert,
        finalPublicChatsCert,
        finalPrivateChatsCert,
      });
      throw new Error(
        'Certificati non salvati correttamente dopo la verifica finale'
      );
    }

    // Verifica che i certificati siano validi
    const [
      isPublicMessagesCertValid,
      isPrivateMessagesCertValid,
      isPublicChatsCertValid,
      isPrivateChatsCertValid,
    ] = await Promise.all([
      certificateManager.verifyCertificate(
        finalPublicMessagesCert,
        request.from,
        'messages'
      ),
      certificateManager.verifyCertificate(
        finalPrivateMessagesCert,
        request.from,
        'messages'
      ),
      certificateManager.verifyCertificate(
        finalPublicChatsCert,
        request.from,
        'chats'
      ),
      certificateManager.verifyCertificate(
        finalPrivateChatsCert,
        request.from,
        'chats'
      ),
    ]);

    if (
      !isPublicMessagesCertValid ||
      !isPrivateMessagesCertValid ||
      !isPublicChatsCertValid ||
      !isPrivateChatsCertValid
    ) {
      console.error('Certificati non validi:', {
        isPublicMessagesCertValid,
        isPrivateMessagesCertValid,
        isPublicChatsCertValid,
        isPrivateChatsCertValid,
      });
      throw new Error('Certificati non validi dopo la verifica finale');
    }

    console.log('Verifica finale certificati OK:', {
      messages: {
        public: finalPublicMessagesCert,
        private: finalPrivateMessagesCert,
        isPublicValid: isPublicMessagesCertValid,
        isPrivateValid: isPrivateMessagesCertValid,
      },
      chats: {
        public: finalPublicChatsCert,
        private: finalPrivateChatsCert,
        isPublicValid: isPublicChatsCertValid,
        isPrivateValid: isPrivateChatsCertValid,
      },
    });

    // Genera certificati anche per l'utente che ha inviato la richiesta
    console.log(
      'Generazione certificati per il mittente (from):',
      request.from,
      'target:',
      user.is.pub
    );

    // Genera certificati per il mittente
    const [senderChatCertificate, senderMessageCertificate] = await Promise.all(
      [
        createChatsCertificate(request.from),
        createMessagesCertificate(request.from),
      ]
    );

    if (!senderChatCertificate || !senderMessageCertificate) {
      throw new Error('Impossibile generare i certificati per il mittente');
    }

    // Salva i certificati pubblici per il mittente
    await Promise.all([
      // Certificato chat pubblico
      new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('certificates')
          .get('chats')
          .get(user.is.pub)
          .put(senderChatCertificate, (ack) => {
            console.log(
              'Salvataggio certificato chat pubblico per mittente:',
              ack
            );
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          });
      }),
      // Certificato messaggi pubblico
      new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get('certificates')
          .get('messages')
          .get(user.is.pub)
          .put(senderMessageCertificate, (ack) => {
            console.log(
              'Salvataggio certificato messaggi pubblico per mittente:',
              ack
            );
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          });
      }),
    ]);

    // Attendi un momento per la propagazione
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verifica il salvataggio dei certificati pubblici del mittente
    console.log('Verifica salvataggio certificati pubblici del mittente...');
    const [senderPublicChatCert, senderPublicMessageCert] = await Promise.all([
      new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('certificates')
          .get('chats')
          .get(user.is.pub) // Cambiato: verifichiamo nel percorso dove li abbiamo salvati
          .once((cert) => {
            console.log(
              'Certificato chat pubblico del mittente recuperato:',
              cert
            );
            resolve(cert);
          });
      }),
      new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('certificates')
          .get('messages')
          .get(user.is.pub) // Cambiato: verifichiamo nel percorso dove li abbiamo salvati
          .once((cert) => {
            console.log(
              'Certificato messaggi pubblico del mittente recuperato:',
              cert
            );
            resolve(cert);
          });
      }),
    ]);

    if (!senderPublicChatCert || !senderPublicMessageCert) {
      console.error('Certificati pubblici del mittente mancanti:', {
        senderPublicChatCert,
        senderPublicMessageCert,
      });
      throw new Error(
        'Errore nel salvataggio dei certificati pubblici del mittente'
      );
    }

    // Verifica la validità dei certificati del mittente
    const [isSenderChatValid, isSenderMessageValid] = await Promise.all([
      certificateManager.verifyCertificate(
        senderPublicChatCert,
        request.from, // Cambiato: verifichiamo che il certificato sia stato creato dal mittente
        'chats'
      ),
      certificateManager.verifyCertificate(
        senderPublicMessageCert,
        request.from, // Cambiato: verifichiamo che il certificato sia stato creato dal mittente
        'messages'
      ),
    ]);

    if (!isSenderChatValid || !isSenderMessageValid) {
      console.error('Certificati del mittente non validi:', {
        isSenderChatValid,
        isSenderMessageValid,
      });
      throw new Error('I certificati del mittente non sono validi');
    }

    console.log('Certificati pubblici del mittente generati e salvati:', {
      chat: {
        cert: senderPublicChatCert,
        valid: isSenderChatValid,
      },
      message: {
        cert: senderPublicMessageCert,
        valid: isSenderMessageValid,
      },
    });

    // Salva i dati dell'utente che ha inviato la richiesta
    console.log('Salvataggio dati mittente:', request.senderInfo);
    await gun
      .get(DAPP_NAME)
      .get('userList')
      .get('users')
      .get(request.from)
      .put({
        pub: request.from,
        alias: request.senderInfo?.alias || request.alias,
        displayName: request.senderInfo?.alias || request.alias,
        lastSeen: Date.now(),
        timestamp: Date.now(),
      });

    // Salva i dati dell'utente che accetta la richiesta
    console.log('Salvataggio dati destinatario:', user.is);
    await gun.get(DAPP_NAME).get('userList').get('users').get(user.is.pub).put({
      pub: user.is.pub,
      alias: user.is.alias,
      displayName: user.is.alias,
      lastSeen: Date.now(),
      timestamp: Date.now(),
    });

    // Genera un ID univoco per la chat
    const chatId = [user.is.pub, request.from].sort().join('_');

    // Crea la chat
    const chatData = {
      id: chatId,
      created: Date.now(),
      status: 'active',
      user1: user.is.pub,
      user2: request.from,
      type: 'private',
    };

    // Salva la chat
    await gun.get(DAPP_NAME).get('chats').get(chatId).put(chatData);

    // Crea il record di amicizia con alias
    const friendshipData = {
      user1: user.is.pub,
      user2: request.from,
      created: Date.now(),
      status: 'active',
      chatId: chatId,
      user1Alias: user.is.alias,
      user2Alias: request.senderInfo?.alias || request.alias,
    };

    // Salva l'amicizia e attendi la conferma
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('friendships')
        .set(friendshipData, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // Attendi un momento per la propagazione
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verifica che l'amicizia sia stata salvata
    const friendshipSaved = await new Promise((resolve) => {
      let found = false;
      gun
        .get(DAPP_NAME)
        .get('friendships')
        .map()
        .once((data) => {
          if (
            data &&
            ((data.user1 === user.is.pub && data.user2 === request.from) ||
              (data.user1 === request.from && data.user2 === user.is.pub))
          ) {
            found = true;
          }
        });
      setTimeout(() => resolve(found), 1000);
    });

    if (!friendshipSaved) {
      throw new Error("L'amicizia non è stata salvata correttamente");
    }

    // Pulisci tutte le richieste correlate
    await cleanupFriendRequests(request);

    return {
      success: true,
      message: 'Richiesta accettata con successo',
      chatId: chatId,
    };
  } catch (error) {
    console.error('Error accepting friend request:', error);
    throw error;
  }
};

// Funzione di utilità per pulire le richieste di amicizia
const cleanupFriendRequests = async (request) => {
  try {
    // Rimuovi tutte le richieste correlate
    await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('all_friend_requests')
        .map()
        .once((data, key) => {
          if (
            data &&
            ((data.from === request.from && data.to === user.is.pub) ||
              (data.from === user.is.pub && data.to === request.from))
          ) {
            gun.get(DAPP_NAME).get('all_friend_requests').get(key).put(null);
          }
        });
      setTimeout(resolve, 1000);
    });

    // Rimuovi le richieste private
    await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('friend_requests')
        .get(user.is.pub)
        .map()
        .once((data, key) => {
          if (data && data.from === request.from) {
            gun
              .get(DAPP_NAME)
              .get('friend_requests')
              .get(user.is.pub)
              .get(key)
              .put(null);
          }
        });
      setTimeout(resolve, 1000);
    });

    // Verifica che le richieste siano state rimosse
    await new Promise((resolve) => setTimeout(resolve, 500));

    const [hasPublicRequests, hasPrivateRequests] = await Promise.all([
      new Promise((resolve) => {
        let found = false;
        gun
          .get(DAPP_NAME)
          .get('all_friend_requests')
          .map()
          .once((data) => {
            if (
              data &&
              ((data.from === request.from && data.to === user.is.pub) ||
                (data.from === user.is.pub && data.to === request.from))
            ) {
              found = true;
            }
          });
        setTimeout(() => resolve(found), 1000);
      }),
      new Promise((resolve) => {
        let found = false;
        gun
          .get(DAPP_NAME)
          .get('friend_requests')
          .get(user.is.pub)
          .map()
          .once((data) => {
            if (data && data.from === request.from) {
              found = true;
            }
          });
        setTimeout(() => resolve(found), 1000);
      }),
    ]);

    if (hasPublicRequests || hasPrivateRequests) {
      console.warn(
        'Alcune richieste potrebbero non essere state rimosse completamente'
      );
    }
  } catch (error) {
    console.error('Errore durante la pulizia delle richieste:', error);
  }
};

export default acceptFriendRequest;
