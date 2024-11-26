import { gun, user, DAPP_NAME } from '../useGun.js';
import { updateGlobalMetrics } from '../system/systemService.js';

const channels = {
  // Crea un nuovo canale o bacheca
  create: async (name, type = 'board') => {
    if (!user?.is) throw new Error('User not authenticated');

    if (type !== 'board' && type !== 'channel') {
      throw new Error('Tipo non valido. Usa "board" o "channel"');
    }

    try {
      const exists = await channels.nameExists(name);
      if (exists) {
        throw new Error(`Un${type === 'channel' ? ' canale' : 'a bacheca'} con questo nome esiste già`);
      }

      const channelId = `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const channelData = {
        id: channelId,
        name: name,
        type: type,
        created: Date.now(),
        creator: user?.is?.pub,
        membersCount: 1,
        writeAccess: type === 'channel' ? 'creator' : 'members'
      };

      await gun.get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .put(channelData);

      await gun.get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('members')
        .set(user.is.pub);

      await gun.user()
        .get(DAPP_NAME)
        .get('my_channels')
        .set({
          channelId,
          joined: Date.now()
        });

      if (type === 'channel') {
        updateGlobalMetrics('totalChannels', 1);
      } else {
        updateGlobalMetrics('totalBoards', 1);
      }

      return channelId;
    } catch (error) {
      console.error('Error creating channel:', error);
      throw error;
    }
  },

  // Unisciti a un canale/bacheca
  join: async (channelId) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      await gun.get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('members')
        .set(user.is.pub);

      await gun.user()
        .get(DAPP_NAME)
        .get('my_channels')
        .set({
          channelId,
          joined: Date.now()
        });

      return { success: true };
    } catch (error) {
      console.error('Error joining channel:', error);
      throw error;
    }
  },

  // Lascia un canale/bacheca
  leave: async (channelId) => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      await gun.get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .get('members')
        .map()
        .once((member, key) => {
          if (member === user.is.pub) {
            gun.get(DAPP_NAME)
              .get('channels')
              .get(channelId)
              .get('members')
              .get(key)
              .put(null);
          }
        });

      await gun.user()
        .get(DAPP_NAME)
        .get('my_channels')
        .map()
        .once((data, key) => {
          if (data && data.channelId === channelId) {
            gun.user()
              .get(DAPP_NAME)
              .get('my_channels')
              .get(key)
              .put(null);
          }
        });

      return true;
    } catch (error) {
      console.error('Error leaving channel:', error);
      throw error;
    }
  },

  // Verifica se l'utente è membro
  isMember: async (channelId, userPub) => {
    console.log('Checking membership for:', { channelId, userPub });
    
    // Pulisci l'ID del canale
    const cleanChannelId = channelId.includes('_channel_') 
      ? channelId.split('_channel_')[1] 
      : channelId;

    console.log('Using clean channel ID for membership check:', cleanChannelId);
    
    return new Promise((resolve) => {
      let found = false;
      let checked = 0;
      let totalChecks = 0;

      gun.get(DAPP_NAME)
        .get('channels')
        .get(cleanChannelId)
        .get('members')
        .map()
        .once((member, key) => {
          totalChecks++;
          console.log('Checking member:', { member, key, userPub });
          
          if (member === userPub) {
            console.log('Member found!');
            found = true;
          }
          checked++;

          if (checked === totalChecks) {
            console.log('Membership check complete:', { found, checked, totalChecks });
            resolve(found);
          }
        });

      setTimeout(() => {
        console.log('Membership check timeout:', { found, checked, totalChecks });
        resolve(found);
      }, 1000);
    });
  },

  // Conta i membri
  countMembers: async (channelId) => {
    if (!channelId) throw new Error('Channel ID required');

    try {
      const members = new Set();
      await new Promise((resolve) => {
        gun.get(DAPP_NAME)
          .get('channels')
          .get(channelId)
          .get('members')
          .map()
          .once((member) => {
            if (member) members.add(member);
          });
        setTimeout(resolve, 500);
      });
      return members.size;
    } catch (error) {
      console.error('Error counting members:', error);
      return 0;
    }
  },

  // Cerca canali e bacheche
  search: async (query) => {
    return new Promise((resolve) => {
      const results = {
        boards: [],
        channels: []
      };

      gun.get(DAPP_NAME)
        .get('channels')
        .map()
        .once((channel) => {
          if (channel && channel.name && channel.name.toLowerCase().includes(query.toLowerCase())) {
            if (channel.type === 'channel') {
              results.channels.push(channel);
            } else {
              results.boards.push(channel);
            }
          }
        });

      setTimeout(() => resolve(results), 500);
    });
  },

  // Verifica se esiste un canale/bacheca con lo stesso nome
  nameExists: async (name) => {
    return new Promise((resolve) => {
      let exists = false;
      gun.get(DAPP_NAME)
        .get('channels')
        .map()
        .once((channel) => {
          if (channel && channel.name && channel.name.toLowerCase() === name.toLowerCase()) {
            exists = true;
          }
        });
      setTimeout(() => resolve(exists), 500);
    });
  },

  // Ottieni i membri
  getMembers: async (channelId) => {
    if (!channelId) throw new Error('Channel ID required');

    try {
      const members = new Set();
      const membersDetails = [];

      await new Promise((resolve) => {
        gun.get(DAPP_NAME)
          .get('channels')
          .get(channelId)
          .get('members')
          .map()
          .once((memberPub) => {
            if (memberPub) members.add(memberPub);
          });
        setTimeout(resolve, 500);
      });

      for (const memberPub of members) {
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
          setTimeout(() => resolve(`User-${memberPub.substring(0, 8)}`), 500);
        });

        membersDetails.push({
          pub: memberPub,
          username: username,
          joined: Date.now()
        });
      }

      return membersDetails.sort((a, b) => a.username.localeCompare(b.username));
    } catch (error) {
      console.error('Error getting members:', error);
      return [];
    }
  },

  // Verifica se l'utente può scrivere
  canWrite: async (channelId, userPub) => {
    try {
      console.log('Checking write permissions for:', { channelId, userPub });

      // Ottieni i dettagli del canale
      const channel = await new Promise((resolve) => {
        gun.get(DAPP_NAME)
          .get('channels')
          .get(channelId)
          .once((data) => {
            console.log('Channel data:', data);
            resolve(data);
          });
      });

      if (!channel) {
        console.log('Channel not found');
        return false;
      }

      // Se è il creatore, può sempre scrivere
      if (channel.creator === userPub) {
        console.log('User is creator, can write');
        return true;
      }

      // Se è un canale, solo il creatore può scrivere
      if (channel.type === 'channel') {
        const isCreator = channel.creator === userPub;
        console.log('Channel type, creator check:', isCreator);
        return isCreator;
      }

      // Se è una bacheca, verifica solo se l'utente è membro
      if (channel.type === 'board') {
        const isMember = await channels.isMember(channelId, userPub);
        console.log('Board type, member check result:', isMember);
        return isMember;
      }

      return false;
    } catch (error) {
      console.error('Error checking write permissions:', error);
      return false;
    }
  },

  // Ottieni i dettagli
  getDetails: async (channelId) => {
    return new Promise((resolve) => {
      gun.get(DAPP_NAME)
        .get('channels')
        .get(channelId)
        .once((channel) => {
          if (channel) {
            resolve({
              ...channel,
              isChannel: channel.type === 'channel',
              canWriteAll: channel.type === 'board'
            });
          } else {
            resolve(null);
          }
        });
    });
  },

  // Aggiungi questa nuova funzione per ottenere le statistiche separate
  getStats: async () => {
    return new Promise((resolve) => {
      let stats = {
        channels: 0,
        boards: 0,
        total: 0
      };

      gun.get(DAPP_NAME)
        .get('channels')
        .map()
        .once((channel) => {
          if (channel) {
            stats.total++;
            if (channel.type === 'channel') {
              stats.channels++;
            } else if (channel.type === 'board') {
              stats.boards++;
            }
          }
        });

      setTimeout(() => resolve(stats), 500);
    });
  }
};

export default channels; 