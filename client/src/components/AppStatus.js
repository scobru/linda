import React from 'react';
import { system } from 'linda-protocol';
import { gun, user } from 'linda-protocol';

// Get the systemService from the system module
const { systemService } = system;

export default function AppStatus() {
  const [systemState, setSystemState] = React.useState({
    connected: false,
    peers: [],
    timestamp: null,
    usersCount: 0,
    currentUser: null,
    gunInstance: { enabled: false, peers: {} }
  });
  const [showDetails, setShowDetails] = React.useState(false);

  React.useEffect(() => {
    // Create a simple observable if systemService.observeSystemState doesn't exist
    const observable = {
      subscribe: ({ next }) => {
        const interval = setInterval(() => {
          // Get basic system state
          const state = {
            connected: !!gun?._.opt?.peers && Object.keys(gun._.opt.peers).length > 0,
            peers: Object.keys(gun?._.opt?.peers || {}),
            timestamp: Date.now(),
            usersCount: 0, // You might want to implement a way to count users
            currentUser: user.is,
            gunInstance: {
              enabled: true,
              peers: gun?._.opt?.peers || {}
            }
          };
          next(state);
        }, 5000);

        return () => clearInterval(interval);
      }
    };

    const subscription = (systemService?.observeSystemState || observable.subscribe)({
      next: (state) => setSystemState(state),
      error: (error) => console.error('Error monitoring system:', error)
    });

    return () => {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  }, []);

  const toggleDetails = () => {
    setShowDetails(!showDetails);
  };

  return (
    <div className="relative">
      <button 
        onClick={toggleDetails}
        className="flex items-center space-x-2 px-3 py-1 rounded-full hover:bg-gray-100 transition-colors"
      >
        <div className={`w-2 h-2 rounded-full ${
          systemState.connected ? 'bg-green-500' : 'bg-red-500'
        }`} />
        <span className="text-sm text-gray-600">
          {systemState.connected ? 'Online' : 'Offline'}
        </span>
      </button>

      {showDetails && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg p-4 z-50">
          <h3 className="font-medium mb-2">System Status</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Connection:</span>
              <span className={systemState.connected ? 'text-green-500' : 'text-red-500'}>
                {systemState.connected ? 'Online' : 'Offline'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span>Registered Users:</span>
              <span>{systemState.usersCount}</span>
            </div>

            {systemState.currentUser && (
              <div className="pt-2 border-t">
                <p className="font-medium mb-1">Current User</p>
                <p className="text-xs text-gray-500 truncate">{systemState.currentUser.pub}</p>
              </div>
            )}

            <div className="pt-2 border-t">
              <p className="font-medium mb-1">Connected Peers ({systemState.peers.length})</p>
              <div className="max-h-32 overflow-y-auto">
                {systemState.peers.map((peer, index) => (
                  <p key={index} className="text-xs bg-gray-50 p-1 rounded mb-1 truncate">
                    {peer}
                  </p>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t text-xs text-gray-500">
              <p>Last Update: {new Date(systemState.timestamp).toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 