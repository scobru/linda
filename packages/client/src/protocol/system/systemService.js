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
};

export default systemService;
