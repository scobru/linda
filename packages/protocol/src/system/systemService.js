import { gun, user, DAPP_NAME } from '../useGun.js';
import { Observable } from 'rxjs';

/**
 * System service for monitoring and managing system status, configuration and maintenance
 */
const systemService = {
  /**
   * Observes system status metrics including connected peers, message count and sync status
   * @returns {Observable} Observable that emits system status updates
   */
  observeSystemStatus: () => {
    return new Observable((subscriber) => {
      const stats = {
        connectedPeers: 0,
        messageCount: 0,
        lastSync: null,
      };

      // Monitor connected peers
      gun.on('hi', (peer) => {
        stats.connectedPeers++;
        subscriber.next({ ...stats });
      });

      gun.on('bye', (peer) => {
        stats.connectedPeers = Math.max(0, stats.connectedPeers - 1);
        subscriber.next({ ...stats });
      });

      // Monitor synchronization
      gun.on('out', (msg) => {
        stats.messageCount++;
        stats.lastSync = Date.now();
        subscriber.next({ ...stats });
      });

      return () => {
        // Cleanup
      };
    });
  },

  /**
   * Gets the current system configuration
   * @async
   * @returns {Promise<Object>} System configuration object
   * @throws {Error} If user is not authenticated
   */
  getConfig: async () => {
    if (!user.is) throw new Error('User not authenticated');

    return new Promise((resolve) => {
      user
        .get(DAPP_NAME)
        .get('system')
        .get('config')
        .once((config) => resolve(config || {}));
    });
  },

  /**
   * Updates the system configuration
   * @async
   * @param {Object} config - New configuration object
   * @throws {Error} If user is not authenticated
   */
  updateConfig: async (config) => {
    if (!user.is) throw new Error('User not authenticated');

    await user.get(DAPP_NAME).get('system').get('config').put(config);
  },

  /**
   * Runs system diagnostics to check core functionality
   * @async
   * @returns {Promise<Object>} Diagnostic results for various system components
   */
  runDiagnostics: async () => {
    const results = {
      gunConnection: false,
      peerConnection: false,
      storage: false,
      encryption: false,
    };

    try {
      // Check Gun connection
      results.gunConnection = !!gun;

      // Check peer connections
      const peers = Object.keys(gun._.opt.peers || {});
      results.peerConnection = peers.length > 0;

      // Check storage
      results.storage = typeof localStorage !== 'undefined';

      // Check encryption
      if (user.is?.sea) {
        results.encryption = true;
      }
    } catch (error) {
      console.error('Diagnostics error:', error);
    }

    return results;
  },

  /**
   * Cleans up old data from the system
   * @async
   * @returns {Promise<boolean>} Success status of cleanup operation
   * @throws {Error} If user is not authenticated
   */
  cleanupData: async () => {
    if (!user.is) throw new Error('User not authenticated');

    try {
      // Remove expired data
      const now = Date.now();
      const expiry = now - 30 * 24 * 60 * 60 * 1000; // 30 days

      // Clean old messages
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get('chats')
          .map()
          .get('messages')
          .map()
          .once((msg, key) => {
            if (msg && msg.timestamp < expiry) {
              gun
                .get(DAPP_NAME)
                .get('chats')
                .get(msg.chatId)
                .get('messages')
                .get(key)
                .put(null);
            }
          });
        setTimeout(resolve, 1000);
      });

      return true;
    } catch (error) {
      console.error('Cleanup error:', error);
      return false;
    }
  },

  /**
   * Monitora tutte le metriche del sistema
   */
  monitorSystemMetrics: () => {
    return new Observable((subscriber) => {
      const processedEvents = new Set();
      const THROTTLE_TIME = 1000;
      const lastUpdate = {};

      const shouldUpdate = (eventType) => {
        const now = Date.now();
        if (
          !lastUpdate[eventType] ||
          now - lastUpdate[eventType] > THROTTLE_TIME
        ) {
          lastUpdate[eventType] = now;
          return true;
        }
        return false;
      };

      // Monitora login e altri eventi
      gun.on('auth', (ack) => {
        if (!ack.err && shouldUpdate('login')) {
          const loginId = `login_${Date.now()}`;
          if (!processedEvents.has(loginId)) {
            processedEvents.add(loginId);
            updateGlobalMetrics('totalLogins', 1);
            subscriber.next({ type: 'login', data: ack });
          }
        }
      });

      // Monitora i canali e le bacheche
      gun
        .get(DAPP_NAME)
        .get('channels')
        .map()
        .on((channelData, channelId) => {
          if (channelData && channelId !== '_') {
            // Monitora i membri del canale
            gun
              .get(DAPP_NAME)
              .get('channels')
              .get(channelId)
              .get('members')
              .map()
              .on((memberData, memberId) => {
                if (memberData && memberId !== '_') {
                  if (memberData === true) {
                    // Nuovo membro aggiunto
                    if (channelData.type === 'board') {
                      updateGlobalMetrics('activeBoardMembers', 1);
                    } else {
                      updateGlobalMetrics('activeChannelMembers', 1);
                    }
                    updateGlobalMetrics('totalChannelJoins', 1);
                  } else if (memberData === null) {
                    // Membro rimosso
                    if (channelData.type === 'board') {
                      updateGlobalMetrics('activeBoardMembers', -1);
                    } else {
                      updateGlobalMetrics('activeChannelMembers', -1);
                    }
                    updateGlobalMetrics('totalChannelLeaves', 1);
                  }
                }
              });

            // Monitora creazione canali/bacheche
            if (
              channelData.created &&
              shouldUpdate('channel_created_' + channelId)
            ) {
              if (channelData.type === 'board') {
                updateGlobalMetrics('totalBoardsCreated', 1);
              } else {
                updateGlobalMetrics('totalChannelsCreated', 1);
              }
              updateGlobalMetrics('totalChannels', 1);
            }
          }
        });

      // Pulisci periodicamente gli eventi processati
      const cleanupInterval = setInterval(() => {
        const now = Date.now();
        processedEvents.forEach((eventId) => {
          if (now - parseInt(eventId.split('_')[1] || 0) > THROTTLE_TIME) {
            processedEvents.delete(eventId);
          }
        });
      }, THROTTLE_TIME);

      return () => {
        clearInterval(cleanupInterval);
        gun.get(DAPP_NAME).off();
        gun.off('auth');
      };
    });
  },

  /**
   * Inizializza il monitoraggio del sistema
   */
  initializeMonitoring: () => {
    // Inizializza le metriche con valori numerici semplici
    const initialMetrics = {
      totalUsers: 0,
      totalChannels: 0,
      totalFriendRequests: 0,
      totalFriendRequestsRejected: 0,
      totalMessagesSent: 0,
      totalLogins: 0,
      totalRegistrations: 0,
      totalFriendRequestsMade: 0,
    };

    gun
      .get(DAPP_NAME)
      .get('globalMetrics')
      .once((data) => {
        if (!data) {
          // Salva ogni metrica individualmente
          Object.entries(initialMetrics).forEach(([key, value]) => {
            gun.get(DAPP_NAME).get('globalMetrics').get(key).put(value);
          });
        }
      });

    return systemService.monitorSystemMetrics().subscribe({
      error: (error) => console.error('Error monitoring metrics:', error),
    });
  },
};

const globalMetrics = {
  totalUsers: 0,
  totalChannels: 0,
  totalFriendRequests: 0,
  totalFriendRequestsRejected: 0,
  totalMessagesSent: 0,
  totalLogins: 0,
  totalRegistrations: 0,
  totalFriendRequestsMade: 0,
  totalChannelJoins: 0,
  totalChannelLeaves: 0,
  totalBoardsCreated: 0,
  totalChannelsCreated: 0,
  activeChannelMembers: 0,
  activeBoardMembers: 0,
};

const globalMetricsPath = gun.get(DAPP_NAME).get('globalMetrics');

// Funzione per aggiornare le metriche globali in modo atomico
const updateGlobalMetrics = (metric, value = 1) => {
  if (!metric || typeof value !== 'number') return;

  // Usa una struttura dati semplice senza metadati
  const data = {};
  data[metric] = value;

  gun
    .get(DAPP_NAME)
    .get('globalMetrics')
    .get(metric)
    .once((currentValue) => {
      // Assicurati che il valore sia un numero
      const current = typeof currentValue === 'number' ? currentValue : 0;
      const newValue = current + value;

      // Salva il valore direttamente senza metadati
      gun.get(DAPP_NAME).get('globalMetrics').get(metric).put(newValue);

      console.log(`Updated ${metric}: ${current} -> ${newValue}`);
    });
};

// Funzione per ottenere le metriche globali
const getGlobalMetrics = async () => {
  return new Promise((resolve) => {
    gun
      .get(DAPP_NAME)
      .get('globalMetrics')
      .load((data) => {
        console.log('Loaded global metrics:', data);
        if (!data) {
          // Se non ci sono dati, inizializza con i valori di default
          const defaultMetrics = {
            totalUsers: 0,
            totalChannels: 0,
            totalFriendRequests: 0,
            totalFriendRequestsRejected: 0,
            totalMessagesSent: 0,
            totalLogins: 0,
            totalRegistrations: 0,
            totalFriendRequestsMade: 0,
          };
          gun.get(DAPP_NAME).get('globalMetrics').put(defaultMetrics);
          resolve(defaultMetrics);
        } else {
          resolve(data);
        }
      });
  });
};

// Avvia il monitoraggio quando il modulo viene importato
const monitoringSubscription = systemService.initializeMonitoring();

// Usa window.addEventListener invece di process.on per il browser
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (monitoringSubscription) {
      monitoringSubscription.unsubscribe();
    }
  });
} else if (typeof process !== 'undefined') {
  // Fallback per Node.js
  process.on('beforeExit', () => {
    if (monitoringSubscription) {
      monitoringSubscription.unsubscribe();
    }
  });
}

// Aggiungi una funzione di cleanup esplicita che può essere chiamata quando necessario
const cleanup = () => {
  if (monitoringSubscription) {
    monitoringSubscription.unsubscribe();
  }
};

export { updateGlobalMetrics, getGlobalMetrics, cleanup };
export default systemService;
