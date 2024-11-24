const express = require("express");
const Gun = require("gun");
const os = require("os");
const fs = require('fs');
const path = require('path');
const { Mogu, startServer } = require("@scobru/mogu");

// Importazioni Gun necessarie
require("gun/gun.js");
require("gun/sea.js");
require("gun/lib/axe.js");
require("gun/lib/radisk.js");
require("gun/lib/store.js");
require("gun/lib/rindexed.js");


require('dotenv').config();

const app = express();
const port = 3030;

// Configurazione
const CONFIG = {
  STORAGE: {
    enabled: !!(process.env.PINATA_API_KEY && process.env.PINATA_API_SECRET),
    service: 'PINATA',
    config: {
      apiKey: process.env.PINATA_API_KEY || "",
      apiSecret: process.env.PINATA_API_SECRET || "",
    }
  }
};

// Configurazione percorsi
const RADATA_PATH = path.join(os.tmpdir(), 'gun-data');

// Funzione per calcolare la dimensione della directory radata
function getRadataSize() {
  try {
    if (!fs.existsSync(RADATA_PATH)) {
      console.log(`📁 Directory radata non trovata in: ${RADATA_PATH}`);
      return 0;
    }

    let totalSize = 0;
    const files = fs.readdirSync(RADATA_PATH);
    
    files.forEach(file => {
      const filePath = path.join(RADATA_PATH, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        totalSize += stats.size;
      }
    });

    return totalSize;
  } catch (error) {
    console.error('Errore nel calcolo dimensione radata:', error);
    return 0;
  }
}

// Middleware
app.use(express.static("dashboard"));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// Rendi le variabili globali
let gun, mogu;
const metrics = {
  connections: 0,
  putOperations: 0,
  getOperations: 0,
  bytesTransferred: 0,
  startTime: Date.now(),
  protocol: {
    messages: { sent: 0, received: 0, encrypted: 0, failed: 0 },
    authentication: { logins: 0, registrations: 0, failures: 0 },
    friends: { requests: 0, accepted: 0, rejected: 0 },
    channels: { created: 0, messages: 0, members: 0 }
  },
  storage: {
    radata: 0,
    nodes: 0,
    backups: 0,
    total: 0
  },
  backups: {
    lastBackup: {
      hash: null,
      time: null,
      size: 0,
      link: '#'
    },
    stats: {
      total: 0,
      successful: 0,
      failed: 0
    }
  }
};

// Aggiungi variabile per tracciare l'ultimo backup
let lastBackupTime = 0;
const BACKUP_COOLDOWN = 2 * 60 * 1000; // 2 minuti di cooldown tra i backup

// Modifica la funzione performBackup per usare le nuove funzionalità
async function performBackup() {
  if (!mogu || !CONFIG.STORAGE.enabled) {
    console.log("Backup skipped: mogu not initialized or storage disabled");
    return;
  }

  // Controlla se è passato abbastanza tempo dall'ultimo backup
  const now = Date.now();
  if (now - lastBackupTime < BACKUP_COOLDOWN) {
    console.log("Backup skipped: cooldown period not elapsed");
    return;
  }
  
  try {
    console.log("Starting backup...");
    const hash = await mogu.backup();
    if (hash) {
      console.log("New backup created with hash:", hash);
      
      // Verifica l'integrità del backup
      const comparison = await mogu.compareBackup(hash);
      if (comparison.isEqual) {
        console.log("Backup integrity verified");
        lastBackupTime = now;
        
        // Aggiorna le statistiche
        metrics.backups.stats.successful = (metrics.backups.stats.successful || 0) + 1;
        metrics.backups.stats.total = (metrics.backups.stats.total || 0) + 1;
        
        const radataSize = getRadataSize();
        console.log("Radata size:", formatBytes(radataSize));
        
        metrics.backups.lastBackup = {
          hash,
          time: new Date().toISOString(),
          size: radataSize,
          link: `https://gateway.pinata.cloud/ipfs/${hash}`
        };

        console.log("Backup metrics updated:", {
          lastBackup: metrics.backups.lastBackup,
          stats: metrics.backups.stats
        });
      } else {
        console.error("Backup integrity check failed");
        metrics.backups.stats.failed = (metrics.backups.stats.failed || 0) + 1;
        metrics.backups.stats.total = (metrics.backups.stats.total || 0) + 1;
        
        // Rimuovi il backup non valido
        try {
          await mogu.removeBackup(hash);
          console.log("Invalid backup removed");
        } catch (removeError) {
          console.error("Error removing invalid backup:", removeError);
        }
      }
    }
  } catch (error) {
    console.error("Backup failed:", error);
    metrics.backups.stats.failed = (metrics.backups.stats.failed || 0) + 1;
    metrics.backups.stats.total = (metrics.backups.stats.total || 0) + 1;
  }
}

// Modifica l'inizializzazione del server
async function initializeServer() {
  try {
    // Avvia Gun senza multicast
    const { gunDb } = await startServer({
      multicast: false,
      peers: ['http://localhost:8765']
    });
    console.log("Gun server started");

    // Inizializza Mogu PRIMA di avviare il server Express
    if (CONFIG.STORAGE.enabled) {
      mogu = new Mogu({
        storageService: CONFIG.STORAGE.service,
        storageConfig: CONFIG.STORAGE.config,
        server: gunDb // Passa l'istanza del server
      });

      await mogu.login('system', 'system-password');
      console.log("Mogu initialized and logged in");

      // Verifica e ripristina l'ultimo backup valido se esiste
      try {
        const lastBackup = metrics.backups.lastBackup.hash;
        if (lastBackup) {
          const comparison = await mogu.compareBackup(lastBackup);
          if (comparison.isEqual) {
            await mogu.restore(lastBackup);
            console.log("Last backup restored successfully");
          }
        }
      } catch (restoreError) {
        console.error("Error checking/restoring last backup:", restoreError);
      }
    }

    gun = gunDb.gun;
    app.use(Gun.serve);
    
    const server = app.listen(port, () => {
      console.log(`Relay listening at http://localhost:${port}`);
      
      // Avvia il primo backup dopo che il server è pronto
      if (CONFIG.STORAGE.enabled) {
        console.log("Scheduling initial backup...");
        setTimeout(performBackup, 5000);
        setInterval(performBackup, BACKUP_COOLDOWN);
      }
    });

    // Tracking connessioni WebSocket
    server.on("connection", (socket) => {
      metrics.connections++;
      // Aggiorna anche le connessioni Gun
      if (gun.back('opt.peers')) {
        metrics.connections += Object.keys(gun.back('opt.peers')).length;
      }
      console.log(`Nuova connessione - Totale: ${metrics.connections}`);
      
      socket.on("close", () => {
        metrics.connections--;
        console.log(`Connessione chiusa - Totale: ${metrics.connections}`);
      });
    });

    // Aggiungi anche il tracking delle connessioni Gun
    gun.on('hi', peer => {
      metrics.connections++;
      console.log(`Peer connesso: ${peer.id} - Totale: ${metrics.connections}`);
    });

    gun.on('bye', peer => {
      metrics.connections--;
      console.log(`Peer disconnesso: ${peer.id} - Totale: ${metrics.connections}`);
    });

    // Tracking eventi Gun
    gun.on('auth', (ack) => {
      if (ack.err) {
        metrics.protocol.authentication.failures++;
      } else if (ack.sea) {
        metrics.protocol.authentication.logins++;
      }
      console.log('Metriche autenticazione:', metrics.protocol.authentication);
    });

    // Modifica il tracking dei messaggi per riconoscere meglio i canali
    gun.on("put", (msg) => {
      if (msg.put) {
        metrics.putOperations++;
        
        try {
          let data = msg.put;
          
          // Log per debug
          console.log('=== Nuovo Messaggio ===');
          console.log('Raw:', JSON.stringify(data, null, 2));

          // Analizza tutte le chiavi dell'oggetto put
          Object.keys(data).forEach(key => {
            let value = data[key];
            
            // Se il valore è una stringa, prova a parsarlo come JSON
            if (typeof value === 'string') {
              try {
                value = JSON.parse(value);
              } catch (e) {
                // Non è JSON, usa il valore come è
              }
            }

            // Tracking canali - controlla sia la chiave che il valore
            if (key.includes('channels') || 
                (value && value.type === 'channel') ||
                (value && value.channelId) ||
                (value && value.channel)) {
              console.log('Channel data detected:', value);
              
              // Creazione canale
              if (value && (value.created || value.type === 'channel')) {
                metrics.protocol.channels.created++;
                console.log('Channel creation detected');
              }

              // Messaggi nel canale
              if (value && value.message) {
                metrics.protocol.channels.messages++;
                console.log('Channel message detected');
              }

              // Membri del canale
              if (value && (value.members || value.membersCount)) {
                metrics.protocol.channels.members = value.membersCount || 
                  (Array.isArray(value.members) ? value.members.length : 1);
                console.log('Channel members updated:', metrics.protocol.channels.members);
              }
            }

            // Tracking richieste di amicizia
            if (key.includes('friend_requests') || 
                key.includes('all_friend_requests') ||
                (value && value.type === 'friendRequest')) {
              metrics.protocol.friends.requests++;
              console.log('Friend request detected');
            }

            // Tracking messaggi crittografati
            if (value && (value.sea || value.enc)) {
              metrics.protocol.messages.encrypted++;
              console.log('Encrypted message detected');
            }
          });

          // Incrementa contatori base
          metrics.protocol.messages.received++;
          metrics.protocol.messages.sent++;

          // Calcola bytes trasferiti
          const msgSize = Buffer.from(JSON.stringify(msg.put)).length;
          metrics.bytesTransferred += msgSize;

          // Log delle metriche aggiornate
          console.log('Current metrics:', {
            channels: metrics.protocol.channels,
            friends: metrics.protocol.friends,
            messages: metrics.protocol.messages
          });

        } catch (error) {
          console.error('Error processing message:', error);
          metrics.protocol.messages.failed++;
        }
      }
    });

    // Tracking operazioni get
    gun.on("get", (msg) => {
      metrics.getOperations++;
      const msgSize = Buffer.from(JSON.stringify(msg)).length;
      metrics.bytesTransferred += msgSize;
      console.log('Get operation -', { 
        total: metrics.getOperations, 
        size: msgSize 
      });
    });

    return { gun, mogu };
  } catch (error) {
    console.error("Failed to initialize server:", error);
    throw error;
  }
}

// Inizializza il server
initializeServer()
  .then(({ gun: g, mogu: m }) => {
    gun = g;
    mogu = m;
    console.log("Server initialized successfully");
  })
  .catch(error => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });

function getMemoryUsage() {
  const used = process.memoryUsage();
  return {
    heapUsed: used.heapUsed,
    heapTotal: used.heapTotal,
    external: used.external,
    rss: used.rss, // Resident Set Size
    arrayBuffers: used.arrayBuffers
  };
}

// Modifica l'endpoint metrics
app.get("/metrics", async (req, res) => {
  try {
    const state = mogu?.getState();
    const nodes = state ? Array.from(state.values()) : [];
    const radataSize = getRadataSize();
    const memoryUsage = getMemoryUsage();
    
    const systemMetrics = {
      cpu: [getCPUUsage()],
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: memoryUsage,
      },
      uptime: Date.now() - metrics.startTime,
      storage: {
        radata: radataSize,
        nodes: nodes?.length || 0,
        backups: CONFIG.STORAGE.enabled ? metrics.backups.successful : 0,
        total: radataSize + (nodes?.length || 0) + (CONFIG.STORAGE.enabled ? metrics.backups.successful : 0)
      },
      protocol: metrics.protocol,
      connections: metrics.connections,
      putOperations: metrics.putOperations,
      getOperations: metrics.getOperations,
      bytesTransferred: metrics.bytesTransferred,
      backups: CONFIG.STORAGE.enabled ? metrics.backups : {
        lastBackup: { hash: null, time: null, size: 0, link: '#' },
        stats: { total: 0, successful: 0, failed: 0 }
      }
    };
    
    res.json(systemMetrics);
  } catch (error) {
    console.error("Error getting metrics:", error);
    res.status(500).json({ 
      error: error.message,
      storage: {
        radata: getRadataSize(),
        nodes: 0,
        backups: 0,
        total: getRadataSize()
      },
      protocol: metrics.protocol,
      connections: metrics.connections,
      putOperations: metrics.putOperations,
      getOperations: metrics.getOperations,
      bytesTransferred: metrics.bytesTransferred,
      backups: {
        lastBackup: { hash: null, time: null, size: 0, link: '#' },
        stats: { total: 0, successful: 0, failed: 0 }
      }
    });
  }
});

let lastCPUUsage = process.cpuUsage();
let lastCPUTime = Date.now();

function getCPUUsage() {
  const currentUsage = process.cpuUsage();
  const currentTime = Date.now();
  
  const userDiff = currentUsage.user - lastCPUUsage.user;
  const systemDiff = currentUsage.system - lastCPUUsage.system;
  const timeDiff = currentTime - lastCPUTime;
  
  // Calcola la percentuale di CPU utilizzata
  const cpuPercent = (userDiff + systemDiff) / (timeDiff * 1000) * 100;
  
  lastCPUUsage = currentUsage;
  lastCPUTime = currentTime;
  
  return Math.min(100, Math.max(0, cpuPercent)); // Limita tra 0 e 100
}

// Utility function per formattare i bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Error handling
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

// Aggiungi monitoraggio della directory radata
fs.watch(os.tmpdir(), (eventType, filename) => {
  if (filename === 'gun-data') {
    console.log(`📁 Cambiamento rilevato in radata: ${eventType}`);
  }
});

// Assicurati che la directory radata esista
if (!fs.existsSync(RADATA_PATH)) {
  console.log(`📁 Directory radata non trovata in: ${RADATA_PATH}`);
}

// Aggiungi questo endpoint per debugging
app.get("/debug/metrics", (req, res) => {
  res.json({
    raw: metrics,
    channels: {
      created: metrics.protocol.channels.created,
      messages: metrics.protocol.channels.messages,
      members: metrics.protocol.channels.members
    },
    lastMessages: metrics.lastMessages || []
  });
});

const messageBuffer = [];
const MAX_BUFFER_SIZE = 10;

// Aggiungi endpoint per vedere gli ultimi messaggi
app.get("/debug/messages", (req, res) => {
  res.json({
    lastMessages: messageBuffer,
    metrics: {
      protocol: metrics.protocol,
      operations: {
        put: metrics.putOperations,
        get: metrics.getOperations
      }
    }
  });
});
