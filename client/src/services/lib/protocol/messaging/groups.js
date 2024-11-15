import { gun, user } from '../../../state';
import { Observable } from 'rxjs';

const PermissionLevels = {
  OWNER: 3,
  ADMIN: 2,
  MODERATOR: 1,
  MEMBER: 0
};

const getUserPermissionLevel = async (groupId, userPub) => {
  // Verifica se è owner
  const group = await gun.get('groups').get(groupId).once();
  if (group && group.owner === userPub) return PermissionLevels.OWNER;
  
  // Verifica se è admin
  const isAdmin = await groups.isAdmin(groupId, userPub);
  if (isAdmin) return PermissionLevels.ADMIN;
  
  // Verifica se è moderatore
  const isModerator = await gun.get('groups')
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

const groups = {
  // Modifica sendGroupMessage per rimuovere la crittografia
  sendGroupMessage: async (groupId, content, type = 'text') => {
    if (!user.is) throw new Error('User not authenticated');

    console.log('Sending group message:', { groupId, content, type });

    // Verifica permessi
    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    const group = await gun.get('groups').get(groupId).once();
    
    if (!group) throw new Error('Group not found');
    if (group.type === 'channel' && !isAdmin) {
      throw new Error('Only admins can post in channels');
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const messageData = {
      id: messageId,
      content, // Contenuto non criptato
      type,
      sender: user.is.pub,
      senderAlias: user.is.alias,
      timestamp: Date.now(),
      groupId
    };

    console.log('Saving group message:', messageData);

    await new Promise((resolve, reject) => {
      gun.get('groups')
        .get(groupId)
        .get('messages')
        .get(messageId)
        .put(messageData, (ack) => {
          if (ack.err) {
            console.error('Error saving group message:', ack.err);
            reject(new Error(ack.err));
          } else {
            console.log('Group message saved successfully');
            resolve();
          }
        });
    });

    return messageId;
  },

  // Modifica subscribeToGroupMessages per rimuovere la decrittazione
  subscribeToGroupMessages: (groupId) => {
    return new Observable(subscriber => {
      if (!groupId) {
        subscriber.error(new Error('Group ID required'));
        return;
      }

      console.log('Setting up group messages subscription for:', groupId);
      const messages = new Map();

      gun.get('groups').get(groupId).once((group) => {
        if (!group) {
          subscriber.error(new Error('Group not found'));
          return;
        }

        subscriber.next({ initial: [] });

        const unsub = gun.get('groups')
          .get(groupId)
          .get('messages')
          .map()
          .on((message, messageId) => {
            console.log('Received group message:', { message, messageId, groupId });

            if (!message) {
              messages.delete(messageId);
            } else {
              const messageData = {
                ...message,
                id: messageId,
                groupId
              };
              messages.set(messageId, messageData);

              const sortedMessages = Array.from(messages.values())
                .sort((a, b) => a.timestamp - b.timestamp);

              subscriber.next({ initial: sortedMessages });
            }
          });

        return () => {
          console.log('Cleaning up group messages subscription for:', groupId);
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
    return new Promise(resolve => {
      gun.get('groups')
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
      gun.get('groups')
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
      gun.user(userPub)
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
    if (!isAdmin) throw new Error('Only admins can add members');

    // Recupera la chiave del gruppo
    const encryptedGroupKey = await gun.user().get('group_keys').get(groupId).once();
    if (!encryptedGroupKey) throw new Error('Group key not found');

    // Decripta la chiave del gruppo
    const groupKey = await groups.decryptGroupKey(encryptedGroupKey, groupId);
    if (!groupKey) throw new Error('Could not decrypt group key');

    // Cripta la chiave del gruppo per il nuovo membro
    const memberEncryptedKey = await groups.encryptGroupKeyForMember(groupKey, memberPub);

    // Salva la chiave criptata per il nuovo membro
    await gun.user(memberPub).get('group_keys').get(groupId).put(memberEncryptedKey);

    // Aggiungi il membro al gruppo
    await gun.get('groups')
      .get(groupId)
      .get('members')
      .set(memberPub);

    // Aggiorna il conteggio dei membri
    const membersCount = await groups.countMembers(groupId);
    await gun.get('groups')
      .get(groupId)
      .get('membersCount')
      .put(membersCount);

    return true;
  },

  removeMember: async (groupId, memberPub) => {
    if (!user.is) throw new Error('User not authenticated');

    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) {
      throw new Error('Only admins can remove members');
    }

    // In Gun, non possiamo davvero "rimuovere" da un set
    // Possiamo solo nullificare il valore
    await gun.get('groups')
      .get(groupId)
      .get('members')
      .map()
      .once((member, key) => {
        if (member === memberPub) {
          gun.get('groups')
            .get(groupId)
            .get('members')
            .get(key)
            .put(null);
        }
      });

    // Dopo la rimozione, aggiorna il conteggio
    const membersCount = await groups.countMembers(groupId);
    await gun.get('groups')
      .get(groupId)
      .get('membersCount')
      .put(membersCount);
  },

  // Cerca canali pubblici
  searchPublicChannels: async (query) => {
    return new Promise((resolve) => {
      const results = [];
      gun.get('groups').map().once((group) => {
        if (group && 
            group.type === 'channel' && 
            group.name.toLowerCase().includes(query.toLowerCase())) {
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

    const group = await gun.get('groups').get(channelId).once();
    if (!group) throw new Error('Channel not found');
    if (group.type !== 'channel') throw new Error('This is not a channel');

    // Verifica se l'utente è già iscritto
    const isMember = await groups.isMember(channelId, user.is.pub);
    if (isMember) throw new Error('Already subscribed to this channel');

    // Aggiungi l'utente ai membri
    await gun.get('groups')
      .get(channelId)
      .get('members')
      .set(user.is.pub);

    // Aggiungi il canale alla lista dell'utente
    await gun.user()
      .get('my_groups')
      .set({
        groupId: channelId,
        joined: Date.now()
      });

    return true;
  },

  // Esci da un gruppo/canale
  leaveGroup: async (groupId) => {
    if (!user.is) throw new Error('User not authenticated');

    const group = await gun.get('groups').get(groupId).once();
    if (!group) throw new Error('Group not found');

    // Se l'utente è il creatore, non può lasciare il gruppo
    if (group.creator === user.is.pub) {
      throw new Error('Il creatore non può lasciare il gruppo/canale');
    }

    // Verifica se l'utente è admin
    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    
    if (isAdmin) {
      // Conta gli altri admin
      const adminCount = await new Promise(resolve => {
        let count = 0;
        gun.get('groups')
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
        const members = await new Promise(resolve => {
          const membersList = [];
          gun.get('groups')
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
          await gun.get('groups')
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
    await gun.get('groups')
      .get(groupId)
      .get('members')
      .map()
      .once((member, key) => {
        if (member === user.is.pub) {
          gun.get('groups')
            .get(groupId)
            .get('members')
            .get(key)
            .put(null);
        }
      });

    // Rimuovi l'utente dagli admin se lo è
    if (isAdmin) {
      await gun.get('groups')
        .get(groupId)
        .get('admins')
        .map()
        .once((admin, key) => {
          if (admin === user.is.pub) {
            gun.get('groups')
              .get(groupId)
              .get('admins')
              .get(key)
              .put(null);
          }
        });
    }

    // Rimuovi il gruppo dalla lista dell'utente
    await gun.user()
      .get('my_groups')
      .map()
      .once((data, key) => {
        if (data && data.groupId === groupId) {
          gun.user()
            .get('my_groups')
            .get(key)
            .put(null);
        }
      });

    return true;
  },

  // Elimina un gruppo/canale (solo per admin)
  deleteGroup: async (groupId) => {
    if (!user.is) throw new Error('User not authenticated');

    const group = await gun.get('groups').get(groupId).once();
    if (!group) throw new Error('Gruppo non trovato');

    // Verifica se l'utente è admin
    const isAdmin = await groups.isAdmin(groupId, user.is.pub);
    if (!isAdmin) {
      throw new Error('Solo gli amministratori possono eliminare il gruppo/canale');
    }

    // Rimuovi il gruppo per tutti i membri
    const members = await new Promise(resolve => {
      const membersList = [];
      gun.get('groups')
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
      await gun.get(`~${memberPub}`)
        .get('my_groups')
        .map()
        .once((data, key) => {
          if (data && data.groupId === groupId) {
            gun.get(`~${memberPub}`)
              .get('my_groups')
              .get(key)
              .put(null);
          }
        });
    }

    // Rimuovi il gruppo
    await gun.get('groups').get(groupId).put(null);

    return true;
  },

  // Modifica la funzione searchPublicChannels per includere anche i gruppi
  searchGroups: async (query, type = 'all') => { // type può essere 'all', 'channel', o 'group'
    return new Promise((resolve) => {
      const results = [];
      gun.get('groups').map().once((group) => {
        if (!group || !group.name) return;
        
        const nameMatches = group.name.toLowerCase().includes(query.toLowerCase());
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

  // Modifica la funzione joinGroup per supportare anche i gruppi
  joinGroup: async (groupId) => {
    if (!user.is) throw new Error('User not authenticated');

    console.log('Attempting to join group:', groupId);

    const group = await gun.get('groups').get(groupId).once();
    if (!group) {
      console.error('Group not found:', groupId);
      throw new Error('Group/Channel not found');
    }

    // Verifica se l'utente è già iscritto
    const isMember = await groups.isMember(groupId, user.is.pub);
    console.log('Membership check:', { groupId, isMember });

    if (isMember) {
      // Se l'utente è già membro, aggiungi il gruppo alla sua lista se non c'è già
      await gun.user()
        .get('my_groups')
        .set({
          groupId,
          joined: Date.now()
        });
      
      console.log('User is already a member, added to my_groups');
      return true;
    }

    try {
      console.log('Adding user to group members');
      // Aggiungi l'utente ai membri
      await gun.get('groups')
        .get(groupId)
        .get('members')
        .set(user.is.pub);

      console.log('Adding group to user\'s groups');
      // Aggiungi il gruppo alla lista dell'utente
      await gun.user()
        .get('my_groups')
        .set({
          groupId,
          joined: Date.now()
        });

      console.log('Successfully joined group:', groupId);
      return true;
    } catch (error) {
      console.error('Error joining group:', error);
      throw error;
    }
  },

  // Aggiungi questa funzione per contare i membri
  countMembers: async (groupId) => {
    return new Promise((resolve) => {
      let count = 0;
      gun.get('groups')
        .get(groupId)
        .get('members')
        .map()
        .once((member) => {
          if (member) count++;
        });

      // Aspetta un po' per assicurarsi che tutti i membri siano stati contati
      setTimeout(() => resolve(count), 500);
    });
  },

  // Aggiungi la funzione createGroup
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
      creator: user.is.pub
    };

    console.log('Creating group:', groupData);

    await new Promise((resolve, reject) => {
      gun.get('groups')
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
    await gun.get('groups')
      .get(groupId)
      .get('admins')
      .set(user.is.pub);

    // Aggiungi il gruppo alla lista dell'utente
    await gun.user()
      .get('my_groups')
      .set({
        groupId,
        joined: Date.now()
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
    const group = await gun.get('groups').get(groupId).once();
    if (!group) throw new Error('Gruppo non trovato');
    
    if (group.creator === memberPub) {
      throw new Error('Non puoi espellere il creatore del gruppo');
    }

    // Verifica che il membro sia effettivamente nel gruppo
    const isMember = await groups.isMember(groupId, memberPub);
    if (!isMember) {
      throw new Error('L\'utente non è un membro del gruppo');
    }

    try {
      // Rimuovi il membro dal gruppo
      await gun.get('groups')
        .get(groupId)
        .get('members')
        .map()
        .once((member, key) => {
          if (member === memberPub) {
            gun.get('groups')
              .get(groupId)
              .get('members')
              .get(key)
              .put(null);
          }
        });

      // Rimuovi anche da admin se lo era
      await gun.get('groups')
        .get(groupId)
        .get('admins')
        .map()
        .once((admin, key) => {
          if (admin === memberPub) {
            gun.get('groups')
              .get(groupId)
              .get('admins')
              .get(key)
              .put(null);
          }
        });

      // Rimuovi il gruppo dalla lista personale dell'utente espulso
      await gun.get(`~${memberPub}`)
        .get('my_groups')
        .map()
        .once((data, key) => {
          if (data && data.groupId === groupId) {
            gun.get(`~${memberPub}`)
              .get('my_groups')
              .get(key)
              .put(null);
          }
        });

      // Aggiorna il conteggio dei membri
      const membersCount = await groups.countMembers(groupId);
      await gun.get('groups')
        .get(groupId)
        .get('membersCount')
        .put(membersCount);

      // Opzionale: Aggiungi alla lista dei membri espulsi per evitare che rientrino
      await gun.get('groups')
        .get(groupId)
        .get('kicked_members')
        .set({
          member: memberPub,
          kickedBy: user.is.pub,
          timestamp: Date.now()
        });

      return true;

    } catch (error) {
      console.error('Errore durante l\'espulsione del membro:', error);
      throw new Error('Errore durante l\'espulsione del membro');
    }
  },

  // Aggiungi questa funzione di utilità per verificare se un utente è stato espulso
  isKicked: async (groupId, userPub) => {
    return new Promise((resolve) => {
      let kicked = false;
      gun.get('groups')
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

  // Modifica la funzione joinGroup per verificare se l'utente è stato espulso
  joinGroup: async (groupId) => {
    if (!user.is) throw new Error('User not authenticated');

    // Verifica se l'utente è stato espulso
    const isKickedMember = await groups.isKicked(groupId, user.is.pub);
    if (isKickedMember) {
      throw new Error('Non puoi entrare in questo gruppo perché sei stato espulso');
    }

    // ... resto del codice della funzione joinGroup ...
  },

  // Aggiungi nuove funzioni per la gestione degli admin
  addAdmin: async (groupId, userPub) => {
    if (!user.is) throw new Error('User not authenticated');

    const hasPermission = await checkPermission(groupId, user.is.pub, PermissionLevels.OWNER);
    if (!hasPermission) {
      throw new Error('Solo il proprietario può aggiungere amministratori');
    }

    // Verifica che l'utente sia un membro del gruppo
    const isMember = await groups.isMember(groupId, userPub);
    if (!isMember) {
      throw new Error('L\'utente deve essere prima membro del gruppo');
    }

    // Verifica che l'utente non sia già admin
    const isAlreadyAdmin = await groups.isAdmin(groupId, userPub);
    if (isAlreadyAdmin) {
      throw new Error('L\'utente è già amministratore');
    }

    // Aggiungi l'utente come admin
    await gun.get('groups')
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

    const group = await gun.get('groups').get(groupId).once();
    if (!group) throw new Error('Gruppo non trovato');

    // Non permettere di rimuovere il creatore come admin
    if (group.creator === userPub) {
      throw new Error('Non puoi rimuovere il creatore come amministratore');
    }

    // Conta gli admin attuali
    const adminCount = await new Promise(resolve => {
      let count = 0;
      gun.get('groups')
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
    await gun.get('groups')
      .get(groupId)
      .get('admins')
      .map()
      .once((admin, key) => {
        if (admin === userPub) {
          gun.get('groups')
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
      gun.get('groups')
        .get(groupId)
        .get('admins')
        .map()
        .once((admin) => {
          if (admin) admins.push(admin);
        });
      
      setTimeout(() => resolve(admins), 500);
    });
  }
};

// Aggiungi questa funzione di utilità per verificare se esiste già un gruppo con lo stesso nome
const groupNameExists = async (groupName) => {
  return new Promise((resolve) => {
    let exists = false;
    gun.get('groups').map().once((group) => {
      if (group && group.name && group.name.toLowerCase() === groupName.toLowerCase()) {
        exists = true;
      }
    });
    
    setTimeout(() => resolve(exists), 500);
  });
};

export default groups; 