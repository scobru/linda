require("dotenv").config();

const express = require("express");
const Gun = require("gun");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { Mogu, startServer } = require("@scobru/mogu");

require("gun-eth");
// Importazioni Gun necessarie
require("gun/gun.js");
require("gun/sea.js");
require("gun/lib/axe.js");
require("gun/lib/radisk.js");
require("gun/lib/store.js");
require("gun/lib/rindexed.js");

require("dotenv").config();

const DAPP_NAME = process.env.DAPP_NAME || "linda-messenger";

const app = express();
const port = 3030;

// Configurazione
const CONFIG = {
  STORAGE: {
    enabled: !!(process.env.PINATA_API_KEY && process.env.PINATA_API_SECRET),
    service: "PINATA",
    config: {
      apiKey: process.env.PINATA_API_KEY || "",
      apiSecret: process.env.PINATA_API_SECRET || "",
    },
  },
};

// Configurazione percorsi
const RADATA_PATH = path.join(process.cwd(), "radata");

// Aggiungi questa definizione all'inizio del file, dopo le altre costanti
const globalMetrics = {
  totalUsers: 0,
  totalChannels: 0,
  totalBoards: 0,
  totalFriendRequests: 0,
  totalFriendRequestsRejected: 0,
  totalMessagesSent: 0,
  totalLogins: 0,
  totalRegistrations: 0,
  totalFriendRequestsMade: 0,
};

// Aggiungi questa funzione all'inizio del file, dopo le importazioni
function formatBytes(bytes, decimals = 2) {
  if (!bytes) return "0 B";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Funzione per calcolare la dimensione della directory radata
function getRadataSize() {
  try {
    if (!fs.existsSync(RADATA_PATH)) {
      console.log(`📁 Directory radata non trovata in: ${RADATA_PATH}`);
      return 0;
    }

    let totalSize = 0;
    const files = fs.readdirSync(RADATA_PATH);

    files.forEach((file) => {
      const filePath = path.join(RADATA_PATH, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        totalSize += stats.size;
      }
    });

    return totalSize;
  } catch (error) {
    console.error("Errore nel calcolo dimensione radata:", error);
    return 0;
  }
}

// Middleware
app.use(express.static("dashboard"));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// Rendi le variabili globali
let gun, mogu;
const metrics = {
  connections: 0,
  putOperations: 0,
  getOperations: 0,
  bytesTransferred: 0,
  protocol: {
    messages: {
      sent: 0,
      received: 0,
      encrypted: 0,
      failed: 0,
    },
    authentication: {
      logins: 0,
      registrations: 0,
      failures: 0,
    },
    friends: {
      requests: 0,
      accepted: 0,
      rejected: 0,
    },
    channels: {
      created: 0,
      messages: 0,
      members: 0,
    },
  },
  storage: {
    radata: 0,
    nodes: 0,
    backups: 0,
    total: 0,
  },
  backups: {
    lastBackup: {
      hash: null,
      time: null,
      size: 0,
      link: "#",
    },
    stats: {
      total: 0,
      successful: 0,
      failed: 0,
    },
  },
};

// Aggiungi variabile per tracciare l'ultimo backup
let lastBackupTime = 0;
const BACKUP_COOLDOWN = 2 * 60 * 1000; // 2 minuti di cooldown tra i backup

// Aggiungi le costanti per il retry
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Modifica la funzione performBackup per includere la logica di retry
async function performBackup() {
  if (!mogu || !CONFIG.STORAGE.enabled) {
    console.log("Backup skipped: mogu not initialized or storage disabled");
    return;
  }

  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      console.log(`Tentativo di backup ${retries + 1}/${MAX_RETRIES}`);
      const hash = await mogu.backup();

      if (hash) {
        console.log("New backup created with hash:", hash);

        // Verifica l'integrità del backup
        const comparison = await mogu.compareBackup(hash);
        console.log("Backup comparison:", comparison);

        if (comparison.isEqual) {
          console.log("Backup integrity verified");
          lastBackupTime = Date.now();

          // Assicurati che metrics.backups esista
          if (!metrics.backups) {
            metrics.backups = {
              lastBackup: {
                hash: null,
                time: null,
                size: 0,
                link: "#",
              },
              stats: {
                total: 0,
                successful: 0,
                failed: 0,
              },
            };
          }

          // Aggiorna le statistiche
          metrics.backups.stats.successful++;
          metrics.backups.stats.total++;

          const radataSize = getRadataSize();
          console.log("Radata size:", formatBytes(radataSize));

          // Aggiorna le informazioni dell'ultimo backup
          metrics.backups.lastBackup = {
            hash,
            time: new Date().toISOString(),
            size: radataSize,
            link: `https://gateway.pinata.cloud/ipfs/${hash}`,
          };

          console.log("Backup metrics updated:", {
            lastBackup: metrics.backups.lastBackup,
            stats: metrics.backups.stats,
          });

          return true; // Backup completato con successo
        } else {
          console.error("Backup integrity check failed");
          if (metrics.backups && metrics.backups.stats) {
            metrics.backups.stats.failed++;
            metrics.backups.stats.total++;
          }

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
      retries++;
      console.error(`Tentativo di backup ${retries} fallito:`, error);

      if (retries < MAX_RETRIES) {
        console.log(`Attendo ${RETRY_DELAY}ms prima del prossimo tentativo...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      } else {
        console.error("Tutti i tentativi di backup sono falliti");
        if (metrics.backups && metrics.backups.stats) {
          metrics.backups.stats.failed++;
          metrics.backups.stats.total++;
        }
      }
    }
  }

  return false; // Backup fallito
}

// Aggiungi una funzione helper per le operazioni Mogu con retry
async function withRetry(operation, ...args) {
  let retries = 0;

  while (retries < MAX_RETRIES) {
    try {
      return await operation(...args);
    } catch (error) {
      retries++;
      console.error(
        `Operazione fallita (tentativo ${retries}/${MAX_RETRIES}):`,
        error
      );

      if (retries < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      } else {
        throw new Error(`Operazione fallita dopo ${MAX_RETRIES} tentativi`);
      }
    }
  }
}

// Modifica l'inizializzazione del server
async function initializeServer() {
  try {
    // Avvia Gun usando startServer da mogu
    const { gunDb } = await startServer({
      web: app,
      file: "radata",
      multicast: false,
      radisk:true,
      axe:true,
      wire:true,
      localStorage: false
    });

    gun = gunDb;
    console.log("Gun server started");

    // Inizializza gli event listeners di Gun PRIMA di inizializzare Mogu

    // Inizializza Mogu se abilitato
    if (CONFIG.STORAGE.enabled) {
      mogu = new Mogu({
        key: "",
        storageService: CONFIG.STORAGE.service,
        storageConfig: CONFIG.STORAGE.config,
        server: gun,
        useIPFS: false // enable IPFS usage
      });

      try {
        console.log("Mogu initialized successfully");

        // Verifica e ripristina l'ultimo backup se esiste
        const lastBackup = metrics.backups.lastBackup.hash;
        if (lastBackup) {
          const comparison = await mogu.compareBackup(lastBackup);
          if (comparison.isEqual) {
            await mogu.restore(lastBackup);
            console.log("Last backup restored successfully");
          }
        }
      } catch (error) {
        console.error("Error during Mogu initialization:", error);
      }
    }

    initializeGunListeners(gun, mogu);

    app.use(Gun.serve);

    // Avvia il server HTTP
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
      console.log(`Nuova connessione - Totale: ${metrics.connections}`);

      socket.on("close", () => {
        metrics.connections = Math.max(0, metrics.connections - 1);
        console.log(`Connessione chiusa - Totale: ${metrics.connections}`);
      });
    });

    // Tracking eventi Gun
    gun.on("hi", (peer) => {
      metrics.connections++;
      console.log(
        `Peer connesso: ${peer.id || "unknown"} - Totale: ${
          metrics.connections
        }`
      );
    });

    gun.on("bye", (peer) => {
      metrics.connections = Math.max(0, metrics.connections - 1);
      console.log(
        `Peer disconnesso: ${peer.id || "unknown"} - Totale: ${
          metrics.connections
        }`
      );
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
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });

// Variabili per il monitoraggio CPU
let lastCPUUsage = process.cpuUsage();
let lastCPUTime = Date.now();

// Funzione getCPUUsage
function getCPUUsage() {
  try {
    const currentUsage = process.cpuUsage();
    const currentTime = Date.now();
    
    const userDiff = currentUsage.user - lastCPUUsage.user;
    const systemDiff = currentUsage.system - lastCPUUsage.system;
    const timeDiff = currentTime - lastCPUTime;
    
    const cpuPercent = Math.min(100, Math.max(0, 
      (userDiff + systemDiff) / (timeDiff * 1000) * 100
    ));
    
    lastCPUUsage = currentUsage;
    lastCPUTime = currentTime;
    
    return cpuPercent;
  } catch (error) {
    console.error('Error getting CPU usage:', error);
    return 0;
  }
}

// Modifica la funzione getMemoryUsage
function getMemoryUsage() {
  try {
    const used = process.memoryUsage();
    return {
      heapUsed: used.heapUsed || 0,
      heapTotal: used.heapTotal || 0,
      external: used.external || 0,
      rss: used.rss || 0,
      arrayBuffers: used.arrayBuffers || 0
    };
  } catch (error) {
    console.error('Error getting memory usage:', error);
    return {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
      arrayBuffers: 0
    };
  }
}

// Modifica l'endpoint delle metriche
app.get('/metrics', (req, res) => {
  try {
    const memUsage = getMemoryUsage();
    const cpuUsage = getCPUUsage();
    const radataSize = getRadataSize();

    const currentMetrics = {
      connections: metrics.connections || 0,
      putOperations: metrics.putOperations || 0,
      getOperations: metrics.getOperations || 0,
      bytesTransferred: metrics.bytesTransferred || 0,
      storage: {
        radata: formatBytes(radataSize),
        total: formatBytes(radataSize)
      },
      system: {
        cpu: [cpuUsage],
        memory: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          formatted: {
            heapUsed: formatBytes(memUsage.heapUsed),
            heapTotal: formatBytes(memUsage.heapTotal)
          }
        }
      },
      backups: metrics.backups || {
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

    res.json(currentMetrics);
  } catch (error) {
    console.error('Error serving metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Aggiorna anche eventuali altri punti dove viene usato mogu?.getState
const updateMetrics = () => {
  try {
    const metrics = getMetrics();
    // Aggiorna le metriche...
  } catch (error) {
    console.warn("Error updating metrics:", error);
  }
};

// Modifica la funzione syncGlobalMetrics per rimuovere i metadati dai log
function syncGlobalMetrics() {
  gun
    .get(DAPP_NAME)
    .get("globalMetrics")
    .once((data) => {
      if (data) {
        // Filtra i metadati e converti i valori in numeri
        const cleanMetrics = {};
        Object.entries(data).forEach(([key, value]) => {
          // Ignora i metadati di Gun
          if (key !== "_" && key !== "#" && key !== ">") {
            cleanMetrics[key] = typeof value === "number" ? value : 0;
          }
        });

        // Aggiorna le metriche locali
        Object.assign(globalMetrics, cleanMetrics);

        // Log solo delle metriche pulite
        console.log("Global metrics synced:", cleanMetrics);
      }
    });
}

// Chiama syncGlobalMetrics ogni 5 secondi
setInterval(syncGlobalMetrics, 5000);

// Aggiungi questa nuova funzione per inizializzare gli event listeners
function initializeGunListeners(gun, mogu) {
  const processedEvents = new Set();

  // Tracking operazioni put/get
  gun._.on("in", function (msg) {
    if (msg.put) {
      metrics.putOperations++;
      metrics.bytesTransferred += Buffer.from(JSON.stringify(msg.put)).length;
    }
  });

  gun._.on("out", function (msg) {
    if (msg.get) {
      metrics.getOperations++;
      metrics.bytesTransferred += Buffer.from(JSON.stringify(msg.get)).length;
    }
  });

  // Tracking messaggi
  gun
    .get(DAPP_NAME)
    .get("chats")
    .map()
    .get("messages")
    .map()
    .on((msg, key) => {
      if (msg && !processedEvents.has(key)) {
        processedEvents.add(key);
        updateGlobalMetric("totalMessagesSent", 1);
      }
    });

  // Tracking richieste di amicizia
  gun
    .get(DAPP_NAME)
    .get("friend_requests")
    .map()
    .on((data, key) => {
      if (data && !processedEvents.has(key)) {
        processedEvents.add(key);
        updateGlobalMetric("totalFriendRequests", 1);
      }
    });

  // Tracking richieste rifiutate
  gun
    .get(DAPP_NAME)
    .get("rejected_requests")
    .map()
    .on((data, key) => {
      if (data && !processedEvents.has(key)) {
        processedEvents.add(key);
        updateGlobalMetric("totalFriendRequestsRejected", 1);
      }
    });

  // Tracking separato per board e canali
  gun.get(DAPP_NAME)
    .get('channels')
    .map()
    .on((data, key) => {
      if (data && !processedEvents.has(key)) {
        processedEvents.add(key);
        
        // Verifica il tipo di canale
        if (data.type === 'channel') {
          updateGlobalMetric('totalChannels', 1);
          console.log('Nuovo canale creato:', data.name);
        } else if (data.type === 'board') {
          updateGlobalMetric('totalBoards', 1);
          console.log('Nuova board creata:', data.name);
        }
      }
    });

  // Pulizia periodica degli eventi processati
  setInterval(() => {
    processedEvents.clear();
  }, 60000); // Pulisci ogni minuto
}

// Modifica la funzione updateGlobalMetric
function updateGlobalMetric(metric, value = 1) {
  if (!metric || typeof value !== "number") return;

  gun
    .get(DAPP_NAME)
    .get("globalMetrics")
    .get(metric)
    .once((currentValue) => {
      // Assicurati che il valore corrente sia un numero
      const current =
        typeof currentValue === "number"
          ? currentValue
          : typeof currentValue === "object" && currentValue._
          ? Number(currentValue._)
          : 0;

      const newValue = current + value;

      // Usa gun direttamente invece di mogu
      gun.get(DAPP_NAME)
        .get("globalMetrics")
        .get(metric)
        .put(newValue);

      // Aggiorna anche la metrica locale
      globalMetrics[metric] = newValue;

      console.log(
        `Global metric updated: ${metric} = ${newValue} (from ${current})`
      );
    });
}

// Modifica l'endpoint delle metriche globali
app.get("/global-metrics", (req, res) => {
  try {
    const cleanMetrics = {};
    Object.entries(globalMetrics).forEach(([key, value]) => {
      cleanMetrics[key] = typeof value === 'number' ? value : 0;
    });
    
    // Aggiungi il totale combinato di canali e board per retrocompatibilità
    cleanMetrics.totalChannelsAndBoards = 
      (cleanMetrics.totalChannels || 0) + (cleanMetrics.totalBoards || 0);
    
    console.log('Sending global metrics:', cleanMetrics);
    res.json(cleanMetrics);
  } catch (error) {
    console.error("Error fetching global metrics:", error);
    res.json(globalMetrics);
  }
});

// Aggiungi anche il tracking a livello di middleware
app.use((req, res, next) => {
  // Track delle richieste HTTP
  if (req.method === "PUT" || req.method === "POST") {
    metrics.putOperations++;
    if (req.body) {
      metrics.bytesTransferred += Buffer.from(JSON.stringify(req.body)).length;
    }
  }

  if (req.method === "GET") {
    metrics.getOperations++;
  }

  // Track della risposta
  const oldWrite = res.write;
  const oldEnd = res.end;

  const chunks = [];

  res.write = function (chunk) {
    if (chunk) {
      chunks.push(Buffer.from(chunk));
      metrics.bytesTransferred += chunk.length;
    }
    return oldWrite.apply(res, arguments);
  };

  res.end = function (chunk) {
    if (chunk) {
      chunks.push(Buffer.from(chunk));
      metrics.bytesTransferred += chunk.length;
    }
    return oldEnd.apply(res, arguments);
  };

  next();
});
