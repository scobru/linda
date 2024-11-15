import Gun from 'gun';
import 'gun/sea';
import 'gun/axe';

// Configura i peers
const peers = [
  'http://localhost:3030/gun'
];

// Inizializza Gun con la configurazione corretta
const gun = Gun({
  peers: peers,
  localStorage: false,  // Disabilitiamo localStorage per evitare conflitti
  radisk: false,       // Disabilitiamo radisk per test
  axe: false,          // Disabilitiamo axe temporaneamente
  WebSocket: window.WebSocket,
  retry: 2000,         // Riprova ogni 2 secondi
  super: false,        // Disabilita la modalità super peer
});

// Esporta l'istanza user
const user = gun.user().recall({sessionStorage: true});

// Monitora lo stato dei peers con più dettagli
gun.on('hi', peer => {
  try {
    const peerUrl = new URL(peer.url || peer);
    console.log('Peer connesso:', {
      url: peerUrl.href,
      hostname: peerUrl.hostname,
      protocol: peerUrl.protocol,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Errore nel log del peer connesso:', error);
  }
});

gun.on('bye', peer => {
  try {
    console.log('Peer disconnesso:', {
      peer,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Errore nel log del peer disconnesso:', error);
  }
});

// Funzione per verificare lo stato della connessione
function checkConnection() {
  const peerStatus = Object.entries(gun._.opt.peers).map(([url, peer]) => ({
    url,
    connected: !!(peer.wire && peer.wire.readyState === 1),
    lastSeen: peer.lastSeen,
    queue: peer.queue ? peer.queue.length : 0
  }));

  console.log('Stato connessione Gun:', {
    timestamp: new Date().toISOString(),
    peers: peerStatus,
    totalPeers: peerStatus.length,
    connectedPeers: peerStatus.filter(p => p.connected).length
  });

  return peerStatus.some(p => p.connected);
}

// Verifica periodica della connessione
setInterval(checkConnection, 5000);

// Verifica iniziale dopo un breve delay
setTimeout(checkConnection, 1000);

// Funzione di utility per riconnettere
const reconnect = () => {
  console.log('Tentativo di riconnessione...');
  peers.forEach(peer => {
    gun.opt({ peers: [peer] });
  });
};

// Esporta le funzioni utili
export { gun, user, checkConnection, reconnect };
