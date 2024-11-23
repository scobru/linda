const express = require("express");
const Gun = require("gun");
const app = express();
const port = 3030;
const os = require('os');
require("gun/sea");
require("gun/lib/axe");
require("gun/lib/radisk");
require("gun/lib/store");
require("gun/lib/rindexed");

// Oggetto per memorizzare le metriche
const metrics = {
  connections: 0,
  putOperations: 0,
  getOperations: 0,
  bytesTransferred: 0,
  startTime: Date.now(),
  peersCount: 0,
  // Aggiungiamo metriche del protocollo
  protocol: {
    messages: {
      sent: 0,
      received: 0,
      encrypted: 0,
      failed: 0
    },
    authentication: {
      logins: 0,
      registrations: 0,
      failures: 0
    },
    friends: {
      requests: 0,
      accepted: 0,
      rejected: 0
    },
    channels: {
      created: 0,
      messages: 0,
      members: 0
    }
  }
};

// Abilita CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(Gun.serve);
app.use(express.static('dashboard')); // Servirà i file statici della dashboard

// Endpoint API per le metriche
app.get('/metrics', (req, res) => {
  const uptime = Date.now() - metrics.startTime;
  const systemMetrics = {
    cpu: os.loadavg(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: uptime,
    ...metrics
  };
  res.json(systemMetrics);
});

const server = app.listen(port, () => {
  console.log(`Relay peers listening at http://localhost:${port}`);
});

// Configura Gun con opzioni per il relay
const gun = Gun({
  web: server,
  file: 'relay-data',    // Directory per i dati del relay
  radisk: true,          // Abilita radisk
  localStorage: false,    // Disabilita localStorage per il server
  multicast: false,      // Disabilita multicast
  axe: true,             // Mantieni axe
  store: {               // Configura lo store
    put: function(key, data, cb) {
      metrics.putOperations++;
      metrics.bytesTransferred += JSON.stringify(data).length;
      
      // Tracciamo le operazioni del protocollo
      try {
        if (data && typeof data === 'object') {
          // Traccia messaggi
          if (data.type === 'message') {
            metrics.protocol.messages.sent++;
            if (data.encrypted) metrics.protocol.messages.encrypted++;
          }
          
          // Traccia autenticazione
          if (data.type === 'auth') {
            if (data.action === 'login') metrics.protocol.authentication.logins++;
            if (data.action === 'register') metrics.protocol.authentication.registrations++;
            if (data.error) metrics.protocol.authentication.failures++;
          }
          
          // Traccia richieste amicizia
          if (data.type === 'friendRequest') {
            metrics.protocol.friends.requests++;
            if (data.status === 'accepted') metrics.protocol.friends.accepted++;
            if (data.status === 'rejected') metrics.protocol.friends.rejected++;
          }
          
          // Traccia canali
          if (data.type === 'channel') {
            if (data.action === 'create') metrics.protocol.channels.created++;
            if (data.action === 'message') metrics.protocol.channels.messages++;
            if (data.action === 'join') metrics.protocol.channels.members++;
          }
        }
      } catch (error) {
        console.error('Error tracking protocol metrics:', error);
      }
      
      cb(null);
    },
    get: function(key, cb) {
      metrics.getOperations++;
      cb(null);
    }
  }
});

// Monitora connessioni WebSocket
server.on('connection', (socket) => {
  metrics.connections++;
  socket.on('close', () => {
    metrics.connections--;
  });
});

// Gestione degli eventi
gun.on('put', function(msg) {
  console.log('Relay received data:', msg.put['#']);
  
  // Traccia messaggi ricevuti
  if (msg.put && msg.put.type === 'message') {
    metrics.protocol.messages.received++;
  }
});
