import { gun, user, DAPP_NAME, SEA } from '../useGun.js';
import { Observable } from 'rxjs';
import { messageIntegrity } from './messageIntegrity.js';
import { certificateManager } from '../security/certificateManager.js';
import { createGroupCertificate } from '../security/groupCertificates.js';

const PermissionLevels = {
  OWNER: 3,
  ADMIN: 2,
  MODERATOR: 1,
  MEMBER: 0,
};

const getUserPermissionLevel = async (groupId, userPub) => {
  // Verifica se è owner
  const group =  gun.get(DAPP_NAME).get('groups').get(groupId).once();
  if (group && group.owner === userPub) return PermissionLevels.OWNER;

  // Verifica se è admin
  const isAdmin = await groups.isAdmin(groupId, userPub);
  if (isAdmin) return PermissionLevels.ADMIN;

  // Verifica se è moderatore
  const isModerator =  gun
    .get(DAPP_NAME)
    .get('groups')
    .get(groupId)
    .get('moderators')
    .map()
    .once((mod) => mod === userPub);
  if (isModerator) return PermissionLevels.MODERATOR;

  // Verifica se è membro
  const isMember = await groups.isMember(groupId, userPub);
  if (isMember) return PermissionLevels.MEMBER;

  return -1;
};

const checkPermission = async (groupId, userPub, requiredLevel) => {
  const userLevel = await getUserPermissionLevel(groupId, userPub);
  return userLevel >= requiredLevel;
};

const verifyGroupSignature = async (groupData) => {
  try {
    if (!groupData || !groupData.signature) return true; // Se non c'è firma, passa
    
    const verified = await SEA.verify(
      JSON.stringify({
        id: groupData.id,
        name: groupData.name,
        type: groupData.type,
        created: groupData.created,
        creator: groupData.creator
      }),
      groupData.creator,
      groupData.signature
    );

    return !!verified;
  } catch (error) {
    console.warn('Error verifying group signature:', error);
    return false;
  }
};

const groups = {
  // Modifica sendGroupMessage per rimuovere la crittografia
  sendGroupMessage: async (groupId, content, type = 'text') => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      // 1. Verifica se l'utente è bannato
      const banned = await groups.isBanned(groupId, user.is.pub);
      if (banned) {
        throw new Error('Sei stato bannato da questo gruppo');
      }

      // 2. Verifica se l'utente è mutato
      const muted = await groups.isMuted(groupId, user.is.pub);
      if (muted) {
        throw new Error('Sei stato mutato in questo gruppo');
      }

      // 1. Verifica se l'utente è membro
      const isMember = await groups.isMember(groupId, user.is.pub);
      if (!isMember) {
        throw new Error('Non sei membro di questo gruppo');
      }

      // 2. Ottieni il certificato
      const certificate = await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('certificates')
        .get(user.is.pub)
        .then();

      if (!certificate) {
        // Se non c'è certificato, verifica se è admin
        const isAdmin = await groups.isAdmin(groupId, user.is.pub);
        if (!isAdmin) {
          // Se non è admin, genera un nuovo certificato
          await groups.joinGroup(groupId); // Questo genererà un nuovo certificato
        }
      }

      // 3. Procedi con l'invio del messaggio
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const messageData = {
        id: messageId,
        content,
        type,
        sender: user.is.pub,
        senderAlias: user.is.alias,
        timestamp: Date.now(),
        groupId,
      };

      // 4. Firma il messaggio
      messageData.signature = await SEA.sign(JSON.stringify({
        content,
        timestamp: messageData.timestamp,
        sender: user.is.pub,
        groupId
      }), user.pair());

      // 5. Salva il messaggio
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('messages')
        .get(messageId)
        .put(messageData);

      return messageId;
    } catch (error) {
      console.error('Error sending group message:', error);
      throw error;
    }
  },

  // Modifica subscribeToGroupMessages per rimuovere la decrittazione
  subscribeToGroupMessages: (groupId) => {
    return new Observable((subscriber) => {
      if (!groupId) {
        subscriber.error(new Error('Group ID required'));
        return;
      }

      console.log('Setting up group messages subscription for:', groupId);
      const messages = new Map();

      gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .once((group) => {
          if (!group) {
            subscriber.error(new Error('Group not found'));
            return;
          }

          subscriber.next({ initial: [] });

          const unsub = gun
            .get(DAPP_NAME)
            .get('groups')
            .get(groupId)
            .get('messages')
            .map()
            .on((message, messageId) => {
              console.log('Received group message:', {
                message,
                messageId,
                groupId,
              });

              if (!message) {
                messages.delete(messageId);
              } else {
                const messageData = {
                  ...message,
                  id: messageId,
                  groupId,
                };
                messages.set(messageId, messageData);

                const sortedMessages = Array.from(messages.values()).sort(
                  (a, b) => a.timestamp - b.timestamp
                );

                subscriber.next({ initial: sortedMessages });
              }
            });

          return () => {
            console.log(
              'Cleaning up group messages subscription for:',
              groupId
            );
            if (typeof unsub === 'function') {
              try {
                unsub();
              } catch (error) {
                console.warn('Error unsubscribing from group messages:', error);
              }
            }
            messages.clear();
          };
        });
    });
  },

  // Verifica se un utente è admin
  isAdmin: async (groupId, userPub) => {
    return new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('admins')
        .map()
        .once((admin, key) => {
          if (admin === userPub) resolve(true);
        });
      setTimeout(() => resolve(false), 1000);
    });
  },

  // Verifica se un utente è membro
  isMember: async (groupId, userPub) => {
    return new Promise((resolve) => {
      let found = false;
      let checkComplete = false;

      // Controlla sia nei membri del gruppo
      gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('members')
        .map()
        .once((member) => {
          if (member === userPub) {
            found = true;
          }
          checkComplete = true;
        });

      // Controlla anche nella lista dei gruppi dell'utente
      gun
        .user(userPub)
        .get(DAPP_NAME)
        .get('my_groups')
        .map()
        .once((data) => {
          if (data && data.groupId === groupId) {
            found = true;
          }
          checkComplete = true;
        });

      // Timeout per assicurarsi che entrambi i controlli siano completati
      setTimeout(() => {
        console.log('Member check result:', { groupId, userPub, found });
        resolve(found);
      }, 1000);
    });
  },

  // Gestione membri
  addMember: async (groupId, memberPub) => {
    if (!user.is) throw new Error('User not authenticated');

    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) throw new Error('Solo gli admin possono aggiungere membri');

    try {
      // 1. Genera il certificato per il nuovo membro
      const memberCertificate = await createGroupCertificate(groupId, memberPub);

      // 2. Aggiungi il membro al gruppo
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('members')
        .set(memberPub);

      // 3. Salva il certificato del membro
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('certificates')
        .get(memberPub)
        .put(memberCertificate);

      // 4. Aggiorna il conteggio dei membri
      const membersCount = await groups.countMembers(groupId);
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('membersCount')
        .put(membersCount);

      return true;
    } catch (error) {
      console.error('Error adding member:', error);
      throw error;
    }
  },

  removeMember: async (groupId, memberPub) => {
    if (!user.is) throw new Error('User not authenticated');

    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) {
      throw new Error('Only admins can remove members');
    }

    // In Gun, non possiamo davvero "rimuovere" da un set
    // Possiamo solo nullificare il valore
    await gun
      .get(DAPP_NAME)
      .get('groups')
      .get(groupId)
      .get('members')
      .map()
      .once((member, key) => {
        if (member === memberPub) {
          gun
            .get(DAPP_NAME)
            .get('groups')
            .get(groupId)
            .get('members')
            .get(key)
            .put(null);
        }
      });

    // Dopo la rimozione, aggiorna il conteggio
    const membersCount = await groups.countMembers(groupId);
    await gun
      .get(DAPP_NAME)
      .get('groups')
      .get(groupId)
      .get('membersCount')
      .put(membersCount);
  },

  // Cerca canali pubblici
  searchPublicChannels: async (query) => {
    return new Promise((resolve) => {
      const results = [];
      gun
        .get(DAPP_NAME)
        .get('groups')
        .map()
        .once((group) => {
          if (
            group &&
            group.type === 'channel' &&
            group.name.toLowerCase().includes(query.toLowerCase())
          ) {
            results.push(group);
          }
        });

      // Aspetta un po' per raccogliere i risultati
      setTimeout(() => resolve(results), 500);
    });
  },

  // Iscriviti a un canale
  joinChannel: async (channelId) => {
    if (!user.is) throw new Error('User not authenticated');

    const group = await gun.get(DAPP_NAME).get('groups').get(channelId).once();
    if (!group) throw new Error('Channel not found');
    if (group.type !== 'channel') throw new Error('This is not a channel');

    // Verifica se l'utente è gi�� iscritto
    const isMember = await groups.isMember(channelId, user.is.pub);
    if (isMember) throw new Error('Already subscribed to this channel');

    // Aggiungi l'utente ai membri
    await gun
      .get(DAPP_NAME)
      .get('groups')
      .get(channelId)
      .get('members')
      .set(user.is.pub);

    // Aggiungi il canale alla lista dell'utente
    gun.user().get(DAPP_NAME).get('my_groups').set({
      groupId: channelId,
      joined: Date.now(),
    });

    return true;
  },

  // Esci da un gruppo/canale
  leaveGroup: async (groupId) => {
    if (!user.is) throw new Error('User not authenticated');

    const group = await gun.get(DAPP_NAME).get('groups').get(groupId).once();
    if (!group) throw new Error('Group not found');

    // Se l'utente è il creatore, non può lasciare il gruppo
    if (group.creator === user.is.pub) {
      throw new Error('Il creatore non può lasciare il gruppo/canale');
    }

    // Verifica se l'utente è admin
    const isAdmin = await groups.isAdmin(groupId, user.is.pub);

    if (isAdmin) {
      // Conta gli altri admin
      const adminCount = await new Promise((resolve) => {
        let count = 0;
        gun
          .get(DAPP_NAME)
          .get('groups')
          .get(groupId)
          .get('admins')
          .map()
          .once((admin) => {
            if (admin && admin !== user.is.pub) {
              count++;
            }
          });
        setTimeout(() => resolve(count), 500);
      });

      // Se non ci sono altri admin, dobbiamo promuovere qualcuno prima di uscire
      if (adminCount === 0) {
        // Trova il membro più anziano (escluso l'admin corrente)
        const members = await new Promise((resolve) => {
          const membersList = [];
          gun
            .get(DAPP_NAME)
            .get('groups')
            .get(groupId)
            .get('members')
            .map()
            .once((member) => {
              if (member && member !== user.is.pub) {
                membersList.push(member);
              }
            });
          setTimeout(() => resolve(membersList), 500);
        });

        if (members.length > 0) {
          // Promuovi il primo membro disponibile ad admin
          await gun
            .get(DAPP_NAME)
            .get('groups')
            .get(groupId)
            .get('admins')
            .set(members[0]);
        } else {
          // Se non ci sono altri membri, il gruppo dovrebbe essere eliminato
          await groups.deleteGroup(groupId);
          return true;
        }
      }
    }

    // Rimuovi l'utente dai membri
    await gun
      .get(DAPP_NAME)
      .get('groups')
      .get(groupId)
      .get('members')
      .map()
      .once((member, key) => {
        if (member === user.is.pub) {
          gun
            .get(DAPP_NAME)
            .get('groups')
            .get(groupId)
            .get('members')
            .get(key)
            .put(null);
        }
      });

    // Rimuovi l'utente dagli admin se lo è
    if (isAdmin) {
      await gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('admins')
        .map()
        .once((admin, key) => {
          if (admin === user.is.pub) {
            gun
              .get(DAPP_NAME)
              .get('groups')
              .get(groupId)
              .get('admins')
              .get(key)
              .put(null);
          }
        });
    }

    // Rimuovi il gruppo dalla lista dell'utente
    gun
      .user()
      .get(DAPP_NAME)
      .get('my_groups')
      .map()
      .once((data, key) => {
        if (data && data.groupId === groupId) {
          gun.user().get(DAPP_NAME).get('my_groups').get(key).put(null);
        }
      });

    return true;
  },

  // Elimina un gruppo/canale (solo per admin)
  deleteGroup: async (groupId) => {
    if (!user.is) throw new Error('User not authenticated');

    const group = await gun.get(DAPP_NAME).get('groups').get(groupId).once();
    if (!group) throw new Error('Gruppo non trovato');

    // Verifica se l'utente è admin
    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) {
      throw new Error(
        'Solo gli amministratori possono eliminare il gruppo/canale'
      );
    }

    // Rimuovi il gruppo per tutti i membri
    const members = await new Promise((resolve) => {
      const membersList = [];
      gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('members')
        .map()
        .once((member) => {
          if (member) membersList.push(member);
        });
      setTimeout(() => resolve(membersList), 500);
    });

    // Rimuovi il gruppo dalla lista di ogni membro
    for (const memberPub of members) {
      await gun
        .get(`~${memberPub}`)
        .get(DAPP_NAME)
        .get('my_groups')
        .map()
        .once((data, key) => {
          if (data && data.groupId === groupId) {
            gun
              .get(`~${memberPub}`)
              .get(DAPP_NAME)
              .get('my_groups')
              .get(key)
              .put(null);
          }
        });
    }

    // Rimuovi il gruppo
    await gun.get(DAPP_NAME).get('groups').get(groupId).put(null);

    return true;
  },

  // Modifica la funzione searchPublicChannels per includere anche i gruppi
  searchGroups: async (query, type = 'all') => {
    // type può essere 'all', 'channel', o 'group'
    return new Promise((resolve) => {
      const results = [];
      gun
        .get(DAPP_NAME)
        .get('groups')
        .map()
        .once((group) => {
          if (!group || !group.name) return;

          const nameMatches = group.name
            .toLowerCase()
            .includes(query.toLowerCase());
          const typeMatches = type === 'all' || group.type === type;

          if (nameMatches && typeMatches) {
            results.push(group);
          }
        });

      // Aspetta un po' per raccogliere i risultati e ordinali per data di creazione
      setTimeout(() => {
        resolve(results.sort((a, b) => b.created - a.created));
      }, 500);
    });
  },

  // Modifica joinGroup per generare il certificato di scrittura
  joinGroup: async (groupId) => {
    if (!user.is) throw new Error('User not authenticated');

    console.log('Attempting to join group:', groupId);

    try {
      const group = await gun.get(DAPP_NAME).get('groups').get(groupId).once();
      if (!group) {
        throw new Error('Gruppo non trovato');
      }

      // 1. Aggiungi direttamente l'utente come membro
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('members')
        .set(user.is.pub);

      // 2. Genera il certificato di scrittura per il nuovo membro
      const certificateData = {
        groupId,
        memberPub: user.is.pub,
        issuer: group.creator, // Il creatore del gruppo è l'emittente
        issuedAt: Date.now(),
        expiry: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 anno
        permissions: {
          read: true,
          write: true,
          invite: false
        }
      };

      // 3. Firma il certificato
      const signature = await SEA.sign(JSON.stringify(certificateData), user.pair());

      const certificate = {
        ...certificateData,
        signature
      };

      // 4. Salva il certificato nel gruppo
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('certificates')
        .get(user.is.pub)
        .put(certificate);

      // 5. Aggiungi il gruppo alla lista personale dell'utente
      await gun.user()
        .get(DAPP_NAME)
        .get('my_groups')
        .set({
          groupId,
          joined: Date.now()
        });

      // 6. Aggiorna il conteggio dei membri
      const membersCount = await groups.countMembers(groupId);
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('membersCount')
        .put(membersCount);

      return { success: true, message: 'Iscritto al gruppo con successo' };
    } catch (error) {
      console.error('Error joining group:', error);
      throw error;
    }
  },

  // Modifica kickMember per permettere solo agli admin di espellere
  kickMember: async (groupId, memberPub) => {
    if (!user.is) throw new Error('User not authenticated');

    // Verifica che chi esegue l'azione sia un admin
    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) {
      throw new Error('Solo gli amministratori possono espellere membri');
    }

    // Verifica che il membro da espellere non sia il creatore
    const group = await gun.get(DAPP_NAME).get('groups').get(groupId).once();
    if (!group) throw new Error('Gruppo non trovato');

    if (group.creator === memberPub) {
      throw new Error('Non puoi espellere il creatore del gruppo');
    }

    try {
      // Rimuovi il membro dalla lista membri del gruppo
      await gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('members')
        .map()
        .once((member, key) => {
          if (member === memberPub) {
            gun
              .get(DAPP_NAME)
              .get('groups')
              .get(groupId)
              .get('members')
              .get(key)
              .put(null);
          }
        });

      // Notifica l'utente espulso
      await gun
        .get(`~${memberPub}`)
        .get('notifications')
        .set({
          type: 'kicked_from_group',
          groupId,
          groupName: group.name,
          timestamp: Date.now()
        });

      // Aggiorna il conteggio dei membri
      const membersCount = await groups.countMembers(groupId);
      await gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('membersCount')
        .put(membersCount);

      return true;
    } catch (error) {
      console.error("Errore durante l'espulsione del membro:", error);
      throw new Error("Errore durante l'espulsione del membro");
    }
  },

  // Aggiungi questa funzione di utilità per verificare se esiste già un gruppo con lo stesso nome
  createGroup: async (groupName, groupType = 'group') => {
    if (!user.is) throw new Error('User not authenticated');

    // Assicurati che groupType sia una stringa
    if (typeof groupType !== 'string') {
      throw new Error('Invalid group type');
    }

    // Verifica se esiste già un gruppo con lo stesso nome
    const nameExists = await groupNameExists(groupName);
    if (nameExists) {
      throw new Error('Un gruppo o canale con questo nome esiste già');
    }

    const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const groupData = {
      id: groupId,
      name: groupName,
      type: groupType,
      created: Date.now(),
      creator: user.is.pub,
    };

    // Aggiungi la firma
    groupData.signature = await SEA.sign(JSON.stringify(groupData), user.pair());

    console.log('Creating group:', groupData);

    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .put(groupData, (ack) => {
          if (ack.err) {
            console.error('Error creating group:', ack.err);
            reject(new Error(ack.err));
          } else {
            console.log('Group created successfully');
            resolve();
          }
        });
    });

    // Aggiungi l'utente come admin del gruppo
    gun
      .get(DAPP_NAME)
      .get('groups')
      .get(groupId)
      .get('admins')
      .set(user.is.pub);

    // Aggiungi il gruppo alla lista dell'utente
    gun.user().get(DAPP_NAME).get('my_groups').set({
      groupId,
      joined: Date.now(),
    });

    return groupId;
  },

  // Aggiungi questa nuova funzione per espellere un membro
  kickMember: async (groupId, memberPub) => {
    if (!user.is) throw new Error('User not authenticated');

    // Verifica che l'utente che esegue l'azione sia un admin
    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) {
      throw new Error('Solo gli amministratori possono espellere membri');
    }

    // Verifica che il membro da espellere non sia il creatore
    const group = await gun.get(DAPP_NAME).get('groups').get(groupId).once();
    if (!group) throw new Error('Gruppo non trovato');

    if (group.creator === memberPub) {
      throw new Error('Non puoi espellere il creatore del gruppo');
    }

    try {
      // 1. Rimuovi il membro dalla lista membri del gruppo
      await gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('members')
        .map()
        .once((member, key) => {
          if (member === memberPub) {
            gun
              .get(DAPP_NAME)
              .get('groups')
              .get(groupId)
              .get('members')
              .get(key)
              .put(null);
          }
        });

      // 2. Rimuovi da admin se lo era
      await gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('admins')
        .map()
        .once((admin, key) => {
          if (admin === memberPub) {
            gun
              .get(DAPP_NAME)
              .get('groups')
              .get(groupId)
              .get('admins')
              .get(key)
              .put(null);
          }
        });

      // 3. Rimuovi il gruppo dalla lista personale dell'utente espulso
      await gun
        .get(`~${memberPub}`)
        .get(DAPP_NAME)
        .get('my_groups')
        .map()
        .once((data, key) => {
          if (data && data.groupId === groupId) {
            gun
              .get(`~${memberPub}`)
              .get(DAPP_NAME)
              .get('my_groups')
              .get(key)
              .put(null);
          }
        });

      // 4. Aggiungi l'utente alla lista dei membri espulsi
      await gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('kicked_members')
        .set({
          member: memberPub,
          kickedBy: user.is.pub,
          timestamp: Date.now()
        });

      // 5. Revoca i permessi di scrittura
      await gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('permissions')
        .get(memberPub)
        .put({
          canWrite: false,
          canRead: false,
          kickedAt: Date.now()
        });

      // 6. Notifica l'utente espulso
      await gun
        .get(`~${memberPub}`)
        .get('notifications')
        .set({
          type: 'kicked_from_group',
          groupId,
          groupName: group.name,
          timestamp: Date.now()
        });

      // 7. Aggiorna il conteggio dei membri
      const membersCount = await groups.countMembers(groupId);
      await gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('membersCount')
        .put(membersCount);

      return true;
    } catch (error) {
      console.error("Errore durante l'espulsione del membro:", error);
      throw new Error("Errore durante l'espulsione del membro");
    }
  },

  // Aggiungi questa funzione di utilità per verificare se un utente è stato espulso
  isKicked: async (groupId, userPub) => {
    return new Promise((resolve) => {
      let kicked = false;
      gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('kicked_members')
        .map()
        .once((data) => {
          if (data && data.member === userPub) {
            kicked = true;
          }
        });

      setTimeout(() => resolve(kicked), 500);
    });
  },

  // Aggiungi nuove funzioni per la gestione degli admin
  addAdmin: async (groupId, userPub) => {
    if (!user.is) throw new Error('User not authenticated');

    const hasPermission = await checkPermission(
      groupId,
      user.is.pub,
      PermissionLevels.OWNER
    );
    if (!hasPermission) {
      throw new Error('Solo il proprietario può aggiungere amministratori');
    }

    // Verifica che l'utente sia un membro del gruppo
    const isMember = await groups.isMember(groupId, userPub);
    if (!isMember) {
      throw new Error("L'utente deve essere prima membro del gruppo");
    }

    // Verifica che l'utente non sia già admin
    const isAlreadyAdmin = await groups.isAdmin(groupId, userPub);
    if (isAlreadyAdmin) {
      throw new Error("L'utente è già amministratore");
    }

    // Aggiungi l'utente come admin
    gun
      .get(DAPP_NAME)
      .get('groups')
      .get(groupId)
      .get('admins')
      .set(userPub);

    return true;
  },

  removeAdmin: async (groupId, userPub) => {
    if (!user.is) throw new Error('User not authenticated');

    // Verifica che chi esegue l'azione sia un admin
    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) {
      throw new Error('Solo gli amministratori possono rimuovere altri admin');
    }

    const group = await gun.get(DAPP_NAME).get('groups').get(groupId).once();
    if (!group) throw new Error('Gruppo non trovato');

    // Non permettere di rimuovere il creatore come admin
    if (group.creator === userPub) {
      throw new Error('Non puoi rimuovere il creatore come amministratore');
    }

    // Conta gli admin attuali
    const adminCount = await new Promise((resolve) => {
      let count = 0;
      gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('admins')
        .map()
        .once((admin) => {
          if (admin) count++;
        });
      setTimeout(() => resolve(count), 500);
    });

    // Assicurati che rimanga almeno un admin
    if (adminCount <= 1) {
      throw new Error('Deve rimanere almeno un amministratore nel gruppo');
    }

    // Rimuovi l'utente dagli admin
     gun
      .get(DAPP_NAME)
      .get('groups')
      .get(groupId)
      .get('admins')
      .map()
      .once((admin, key) => {
        if (admin === userPub) {
          gun
            .get(DAPP_NAME)
            .get('groups')
            .get(groupId)
            .get('admins')
            .get(key)
            .put(null);
        }
      });

    return true;
  },

  // Aggiungi una funzione per ottenere la lista degli admin
  getAdmins: async (groupId) => {
    return new Promise((resolve) => {
      const admins = [];
      gun
        .get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('admins')
        .map()
        .once((admin) => {
          if (admin) admins.push(admin);
        });

      setTimeout(() => resolve(admins), 500);
    });
  },

  // Aggiungi questa nuova funzione
  getGroupMembers: async (groupId) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      const members = await new Promise((resolve) => {
        const membersList = [];
        gun.get(DAPP_NAME)
          .get('groups')
          .get(groupId)
          .get('members')
          .map()
          .once(async (memberPub) => {
            if (!memberPub) return;

            // Ottieni i dettagli dell'utente
            const isAdmin = await groups.isAdmin(groupId, memberPub);
            const username = await new Promise((resolve) => {
              gun.get(DAPP_NAME)
                .get('userList')
                .get('users')
                .map()
                .once((userData) => {
                  if (userData && userData.pub === memberPub) {
                    resolve(userData.username);
                  }
                });
              setTimeout(() => resolve(null), 2000);
            });

            membersList.push({
              pub: memberPub,
              username: username || memberPub,
              isAdmin
            });
          });

        // Attendi un po' per raccogliere tutti i membri
        setTimeout(() => resolve(membersList), 2000);
      });

      return members;
    } catch (error) {
      console.error('Error getting group members:', error);
      throw error;
    }
  },

  // Aggiungi questa funzione per verificare i permessi di scrittura
  canWrite: async (groupId, userPub) => {
    try {
      // Verifica se l'utente è stato espulso
      const isKicked = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('groups')
          .get(groupId)
          .get('kicked_members')
          .map()
          .once((data) => {
            if (data && data.member === userPub) {
              resolve(true);
            }
          });
        setTimeout(() => resolve(false), 1000);
      });

      if (isKicked) return false;

      // Verifica i permessi espliciti
      const permissions = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('groups')
          .get(groupId)
          .get('permissions')
          .get(userPub)
          .once((perms) => {
            resolve(perms);
          });
      });

      if (permissions && permissions.canWrite === false) return false;

      // Se non ci sono restrizioni esplicite, verifica se è membro
      return groups.isMember(groupId, userPub);
    } catch (error) {
      console.error('Error checking write permissions:', error);
      return false;
    }
  },

  // Aggiungi questa funzione di utilità per verificare se esiste già un gruppo con lo stesso nome
  groupNameExists: async (groupName) => {
    return new Promise((resolve) => {
      let exists = false;
      gun
        .get(DAPP_NAME)
        .get('groups')
        .map()
        .once((group) => {
          if (
            group &&
            group.name &&
            group.name.toLowerCase() === groupName.toLowerCase()
          ) {
            exists = true;
          }
        });

      setTimeout(() => resolve(exists), 500);
    });
  },

  // Aggiungi questa funzione di utilità per generare chiavi uniche
  generateUniqueKey: (group) => {
    return `group_${group.id}_${group.type}_${group.created || Date.now()}`;
  },

  // Aggiungi questa funzione per gestire i certificati di scrittura
  generateWriteCertificate: async (groupId, memberPub) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      // Verifica che chi genera il certificato sia admin
      const isAdmin = await groups.isAdmin(groupId, user.is.pub);
      if (!isAdmin) {
        throw new Error('Solo gli admin possono generare certificati di scrittura');
      }

      // Genera il certificato
      const certificate = await SEA.certify(
        memberPub,
        {
          '*': 'messages',
          '+': '*'
        },
        user.pair(),
        null,
        { expiry: Date.now() + (365 * 24 * 60 * 60 * 1000) } // 1 anno di validità
      );

      // Salva il certificato
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('certificates')
        .get(memberPub)
        .get('write')
        .put(certificate);

      return certificate;
    } catch (error) {
      console.error('Error generating write certificate:', error);
      throw error;
    }
  },

  // Aggiungi metodo per revocare il certificato di un membro
  revokeMemberCertificate: async (groupId, memberPub) => {
    if (!user.is) throw new Error('User not authenticated');

    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) {
      throw new Error('Solo gli admin possono revocare certificati');
    }

    try {
      // 1. Ottieni il certificato corrente
      const currentCert = await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('certificates')
        .get(memberPub)
        .then();

      if (currentCert) {
        // 2. Revoca il certificato
        await certificateManager.revokeCertificate(currentCert);

        // 3. Rimuovi il certificato dal gruppo
        await gun.get(DAPP_NAME)
          .get('groups')
          .get(groupId)
          .get('certificates')
          .get(memberPub)
          .put(null);
      }

      return true;
    } catch (error) {
      console.error('Error revoking member certificate:', error);
      throw error;
    }
  },

  // Aggiungi questa funzione per contare i membri
  countMembers: async (groupId) => {
    if (!groupId) throw new Error('Group ID required');

    return new Promise((resolve) => {
      let count = 0;
      gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('members')
        .map()
        .once((member) => {
          if (member) count++;
        });

      // Attendi un po' per assicurarsi di aver contato tutti i membri
      setTimeout(() => resolve(count), 1000);
    });
  },

  // Funzione per mutare (bloccare temporaneamente) un utente
  muteUser: async (groupId, memberPub, duration = null) => {
    if (!user.is) throw new Error('User not authenticated');

    // Verifica che chi esegue l'azione sia admin
    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) {
      throw new Error('Solo gli amministratori possono mutare membri');
    }

    try {
      const muteData = {
        member: memberPub,
        mutedBy: user.is.pub,
        timestamp: Date.now(),
        duration: duration, // null = indefinito
        type: 'mute',
        expiresAt: duration ? Date.now() + duration : null
      };

      // Salva l'informazione di mute
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('muted_members')
        .set(muteData);

      // Notifica l'utente
      await gun.get(`~${memberPub}`)
        .get('notifications')
        .set({
          type: 'group_muted',
          groupId,
          duration: duration,
          timestamp: Date.now()
        });

      return true;
    } catch (error) {
      console.error('Error muting user:', error);
      throw error;
    }
  },

  // Funzione per rimuovere il mute
  unmuteUser: async (groupId, memberPub) => {
    if (!user.is) throw new Error('User not authenticated');

    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) {
      throw new Error('Solo gli amministratori possono togliere il mute');
    }

    try {
      // Rimuovi il mute
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('muted_members')
        .map()
        .once((data, key) => {
          if (data && data.member === memberPub) {
            gun.get(DAPP_NAME)
              .get('groups')
              .get(groupId)
              .get('muted_members')
              .get(key)
              .put(null);
          }
        });

      // Notifica l'utente
      await gun.get(`~${memberPub}`)
        .get('notifications')
        .set({
          type: 'group_unmuted',
          groupId,
          timestamp: Date.now()
        });

      return true;
    } catch (error) {
      console.error('Error unmuting user:', error);
      throw error;
    }
  },

  // Funzione per bannare un utente
  banUser: async (groupId, memberPub, reason = '') => {
    if (!user.is) throw new Error('User not authenticated');

    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) {
      throw new Error('Solo gli amministratori possono bannare membri');
    }

    try {
      const banData = {
        member: memberPub,
        bannedBy: user.is.pub,
        timestamp: Date.now(),
        reason: reason,
        type: 'ban'
      };

      // 1. Aggiungi alla lista dei ban
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('banned_members')
        .set(banData);

      // 2. Rimuovi da membro
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('members')
        .map()
        .once((member, key) => {
          if (member === memberPub) {
            gun.get(DAPP_NAME)
              .get('groups')
              .get(groupId)
              .get('members')
              .get(key)
              .put(null);
          }
        });

      // 3. Rimuovi da admin se lo era
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('admins')
        .map()
        .once((admin, key) => {
          if (admin === memberPub) {
            gun.get(DAPP_NAME)
              .get('groups')
              .get(groupId)
              .get('admins')
              .get(key)
              .put(null);
          }
        });

      // 4. Notifica l'utente
      await gun.get(`~${memberPub}`)
        .get('notifications')
        .set({
          type: 'group_banned',
          groupId,
          reason: reason,
          timestamp: Date.now()
        });

      return true;
    } catch (error) {
      console.error('Error banning user:', error);
      throw error;
    }
  },

  // Funzione per rimuovere il ban
  unbanUser: async (groupId, memberPub) => {
    if (!user.is) throw new Error('User not authenticated');

    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) {
      throw new Error('Solo gli amministratori possono rimuovere i ban');
    }

    try {
      // Rimuovi il ban
      await gun.get(DAPP_NAME)
        .get('groups')
        .get(groupId)
        .get('banned_members')
        .map()
        .once((data, key) => {
          if (data && data.member === memberPub) {
            gun.get(DAPP_NAME)
              .get('groups')
              .get(groupId)
              .get('banned_members')
              .get(key)
              .put(null);
          }
        });

      // Notifica l'utente
      await gun.get(`~${memberPub}`)
        .get('notifications')
        .set({
          type: 'group_unbanned',
          groupId,
          timestamp: Date.now()
        });

      return true;
    } catch (error) {
      console.error('Error unbanning user:', error);
      throw error;
    }
  },

  // Funzione per verificare se un utente è mutato
  isMuted: async (groupId, memberPub) => {
    try {
      const muted = await new Promise((resolve) => {
        let isMuted = false;
        gun.get(DAPP_NAME)
          .get('groups')
          .get(groupId)
          .get('muted_members')
          .map()
          .once((data) => {
            if (data && data.member === memberPub) {
              // Verifica se il mute è scaduto
              if (data.expiresAt && Date.now() > data.expiresAt) {
                // Rimuovi il mute scaduto
                groups.unmuteUser(groupId, memberPub).catch(console.error);
              } else {
                isMuted = true;
              }
            }
          });
        setTimeout(() => resolve(isMuted), 500);
      });

      return muted;
    } catch (error) {
      console.error('Error checking mute status:', error);
      return false;
    }
  },

  // Funzione per verificare se un utente è bannato
  isBanned: async (groupId, memberPub) => {
    try {
      const banned = await new Promise((resolve) => {
        let isBanned = false;
        gun.get(DAPP_NAME)
          .get('groups')
          .get(groupId)
          .get('banned_members')
          .map()
          .once((data) => {
            if (data && data.member === memberPub) {
              isBanned = true;
            }
          });
        setTimeout(() => resolve(isBanned), 500);
      });

      return banned;
    } catch (error) {
      console.error('Error checking ban status:', error);
      return false;
    }
  },
};

export default groups;
