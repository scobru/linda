import React from 'react';
import { gun, user } from '../../services/state';

export function DebugInfo() {
  const [stats, setStats] = React.useState({
    peers: 0,
    users: 0
  });

  React.useEffect(() => {
    const interval = setInterval(() => {
      const connectedPeers = Object.keys(gun._.opt.peers).filter(peer => {
        return gun._.opt.peers[peer].wire && gun._.opt.peers[peer].wire.hied;
      });

      gun.get('users').once((data) => {
        setStats({
          peers: connectedPeers.length,
          users: Object.keys(data || {}).length - 1 // -1 per escludere il campo '_'
        });
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    const logStatus = () => {
      console.log('Gun peers:', gun._.opt.peers);
      console.log('User state:', user.is);
    };

    logStatus();
    
    gun.on('hi', peer => {
      console.log('Peer connected:', peer);
      logStatus();
    });
    
    gun.on('bye', peer => {
      console.log('Peer disconnected:', peer);
      logStatus();
    });
    
    return () => {
      gun.off('hi');
      gun.off('bye');
    };
  }, []);

  return process.env.NODE_ENV === 'development' ? (
    <div className="fixed bottom-0 right-0 bg-black/50 text-white p-2 text-xs">
      <div>Peers connessi: {stats.peers}</div>
      <div>Utenti registrati: {stats.users}</div>
      <div>User logged: {user.is ? 'Yes' : 'No'}</div>
      <button 
        onClick={() => window.reconnect()} 
        className="bg-blue-500 hover:bg-blue-700 text-white px-2 py-1 rounded mt-1"
      >
        Riconnetti
      </button>
    </div>
  ) : null;
} 