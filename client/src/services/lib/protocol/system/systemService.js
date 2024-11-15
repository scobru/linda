import { gun, user } from '../../../state';
import { Observable } from 'rxjs';
import { timer } from '../../../state/utils/timer';


const setInterval = timer.setTimeout;
const clearInterval = timer.clearTimeout;


const systemService = {
  getConnectionState: () => {
    const peers = Object.keys(gun.back('opt').peers || {});
    const connected = peers.length > 0 && gun.back('opt').peers;
    
    return {
      connected,
      peers,
      timestamp: new Date().toISOString()
    };
  },

  getUsersCount: async () => {
    return new Promise((resolve) => {
      gun.get('userList').get('count').once((count) => {
        resolve(count || 0);
      });

      setTimeout(() => resolve(0), 1000);
    });
  },

  observeSystemState: () => {
    return new Observable((subscriber) => {
      const fetchAndEmitState = async () => {
        try {
          const connectionState = systemService.getConnectionState();
          const usersCount = await systemService.getUsersCount();
          
          subscriber.next({
            ...connectionState,
            usersCount,
            currentUser: user.is ? {
              pub: user.is.pub,
              alias: user.is.alias
            } : null,
            gunInstance: {
              enabled: !!gun,
              peers: gun.back('opt').peers || {}
            }
          });
        } catch (error) {
          console.error('Error fetching system state:', error);
        }
      };

      fetchAndEmitState();

      const interval = setInterval(fetchAndEmitState, 1000);

      gun.on('hi', () => fetchAndEmitState());
      gun.on('bye', () => fetchAndEmitState());

      const userCountOff = gun.get('userList').get('count').on(() => {
        fetchAndEmitState();
      });

      return () => {
        clearInterval(interval);
        gun.off('hi');
        gun.off('bye');
        if (typeof userCountOff === 'function') userCountOff();
      };
    });
  }
};

export default systemService; 