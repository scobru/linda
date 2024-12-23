require("dotenv").config();

const express = require("express");
const Gun = require("gun");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { Mogu } = require("@scobru/mogu");
const http = require("http");
const WebSocket = require("ws");

// Costanti di configurazione
const DAPP_NAME = process.env.DAPP_NAME || "linda-messenger";
const MULTICAST_ADDRESS = "239.255.255.250";
const MULTICAST_PORT = 8765;

// Importazioni Gun necessarie
require("gun/gun.js");
require("gun/sea.js");
require("gun/lib/axe.js");
require("gun/lib/radisk.js");

const app = express();
const port = 8765;

// Configurazione Gun per il relay
const GUN_CONFIG = {
  web: app,
  multicast: {
    address: MULTICAST_ADDRESS,
    port: MULTICAST_PORT,
  },
  radisk: true, // mantieni radisk per la persistenza su filesystem
  localStorage: false, // disabilita localStorage
  store: false, // disabilita store generico
  rindexed: false, // disabilita IndexedDB
  file: "./radata", // mantieni il path per radisk
  axe: true,
  peers: process.env.PEERS ? process.env.PEERS.split(",") : [],
};

// Configurazione
const CONFIG = {
  STORAGE: {
    enabled: !!process.env.PINATA_JWT,
    service: "PINATA",
    config: {
      pinataJwt: process.env.PINATA_JWT || "",
      pinataGateway: process.env.PINATA_GATEWAY || "",
    },
  },
  features: {
    encryption: {
      enabled: true,
      algorithm: "aes-256-gcm",
    },
    useIPFS: false,
  },
  performance: {
    chunkSize: 1024 * 1024, // 1MB
    maxConcurrent: 3,
    cacheEnabled: true,
    cacheSize: 100,
  },
};

// Configurazione percorsi
const RADATA_PATH = path.join(process.cwd(), "./radata");

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
const BACKUP_INTERVAL = 5 * 60 * 1000; // 30 minuti

// Aggiungi le costanti per il retry
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Modifica la funzione performBackup per gestire correttamente l'hash
async function performBackup() {
  // Verifica se Mogu è inizializzato e se abbiamo le credenziali Pinata
  if (!mogu) {
    console.log("Backup skipped: mogu not initialized");
    return false;
  }

  if (!process.env.PINATA_JWT) {
    console.log(
      "Backup skipped: PINATA_JWT not found in environment variables"
    );
    return false;
  }

  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      console.log(`Backup attempt ${retries + 1}/${MAX_RETRIES}`);

      // Verifica se la directory radata esiste e non è vuota
      if (
        !fs.existsSync("./radata") ||
        fs.readdirSync("./radata").length === 0
      ) {
        console.log(
          "Backup skipped: radata directory is empty or does not exist"
        );
        return false;
      }

      const backupOptions = {
        encryption: CONFIG.features.encryption,
        metadata: {
          timestamp: Date.now(),
          appName: DAPP_NAME,
          version: "1.0",
        },
      };

      const backupResult = await mogu.backup("./radata", backupOptions);

      if (backupResult?.hash) {
        console.log("New backup created with hash:", backupResult.hash);
        lastBackupTime = Date.now();

        const radataSize = getRadataSize();

        metrics.backups.lastBackup = {
          hash: backupResult.hash,
          time: new Date().toISOString(),
          size: radataSize,
          link: `https://gateway.pinata.cloud/ipfs/${backupResult.hash}`,
        };

        metrics.backups.stats.successful++;
        metrics.backups.stats.total++;

        return true;
      } else {
        throw new Error("Backup completed but no hash was returned");
      }
    } catch (error) {
      retries++;
      console.error(`Backup attempt ${retries} failed:`, error.message);

      if (retries < MAX_RETRIES) {
        console.log(`Waiting ${RETRY_DELAY}ms before next attempt...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      } else {
        console.error("All backup attempts failed");
        metrics.backups.stats.failed++;
        metrics.backups.stats.total++;
      }
    }
  }

  return false;
}

// Funzione per verificare se è il momento di fare un backup
const shouldPerformBackup = () => {
  const now = Date.now();
  return now - lastBackupTime >= BACKUP_INTERVAL;
};

// Scheduler per i backup
const scheduleBackup = async () => {
  if (shouldPerformBackup()) {
    console.log("Starting scheduled backup...");
    await performBackup();
  }
};

// Modifica la funzione syncGlobalMetrics per gestire l'inizializzazione
async function syncGlobalMetrics() {
  try {
    await waitForGunInit();
    gun
      .get(DAPP_NAME)
      .get("globalMetrics")
      .once((data) => {
        if (data) {
          const cleanMetrics = {};
          Object.entries(data).forEach(([key, value]) => {
            if (key !== "_" && key !== "#" && key !== ">") {
              cleanMetrics[key] = Number(value);
            }
          });
          console.log("Metriche globali sincronizzate:", cleanMetrics);
        }
      });
  } catch (error) {
    console.error("Errore durante la sincronizzazione delle metriche:", error);
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
      arrayBuffers: used.arrayBuffers || 0,
    };
  } catch (error) {
    console.error("Error getting memory usage:", error);
    return {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
      arrayBuffers: 0,
    };
  }
}

// Modifica l'endpoint delle metriche
app.get("/metrics", (req, res) => {
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
        total: formatBytes(radataSize),
      },
      system: {
        cpu: [cpuUsage],
        memory: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          formatted: {
            heapUsed: formatBytes(memUsage.heapUsed),
            heapTotal: formatBytes(memUsage.heapTotal),
          },
        },
      },
      backups: metrics.backups || {
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

    res.json(currentMetrics);
  } catch (error) {
    console.error("Error serving metrics:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
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
  gun
    .get(DAPP_NAME)
    .get("channels")
    .map()
    .on((data, key) => {
      if (data && !processedEvents.has(key)) {
        processedEvents.add(key);

        // Verifica il tipo di canale
        if (data.type === "channel") {
          updateGlobalMetric("totalChannels", 1);
          console.log("Nuovo canale creato:", data.name);
        } else if (data.type === "board") {
          updateGlobalMetric("totalBoards", 1);
          console.log("Nuova board creata:", data.name);
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
      gun.get(DAPP_NAME).get("globalMetrics").get(metric).put(newValue);

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
      cleanMetrics[key] = typeof value === "number" ? value : 0;
    });

    // Aggiungi il totale combinato di canali e board per retrocompatibilità
    cleanMetrics.totalChannelsAndBoards =
      (cleanMetrics.totalChannels || 0) + (cleanMetrics.totalBoards || 0);

    console.log("Sending global metrics:", cleanMetrics);
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

// Rimuovi la dichiarazione duplicata di gun precedente e mantieni solo waitForGunInit
const waitForGunInit = () => {
  return new Promise((resolve) => {
    if (gun && gun._.opt.peers && Object.keys(gun._.opt.peers).length > 0) {
      resolve();
    } else {
      gun.on("hi", resolve);
    }
  });
};

// Modifica la funzione syncGlobalMetrics per gestire l'inizializzazione
async function syncGlobalMetrics() {
  try {
    await waitForGunInit();
    gun
      .get(DAPP_NAME)
      .get("globalMetrics")
      .once((data) => {
        if (data) {
          const cleanMetrics = {};
          Object.entries(data).forEach(([key, value]) => {
            if (key !== "_" && key !== "#" && key !== ">") {
              cleanMetrics[key] = Number(value);
            }
          });
          console.log("Metriche globali sincronizzate:", cleanMetrics);
        }
      });
  } catch (error) {
    console.error("Errore durante la sincronizzazione delle metriche:", error);
  }
}

// Funzione di inizializzazione del server
async function initializeServer() {
  try {
    // Crea il server HTTP
    const server = http.createServer(app);

    // Configura Gun con il server HTTP invece di express
    const gunConfig = {
      ...GUN_CONFIG,
      web: server, // Usa il server HTTP invece di app
    };

    // Inizializza Gun con la configurazione
    gun = new Gun(gunConfig);
    console.log("Gun server started");

    // Avvia il server HTTP
    server.listen(port, () => {
      console.log(`Relay listening at http://localhost:${port}`);
    });

    // Inizializza Mogu se abilitato
    if (CONFIG.STORAGE.enabled) {
      mogu = new Mogu({
        storage: {
          service: CONFIG.STORAGE.service,
          config: CONFIG.STORAGE.config,
        },
        features: CONFIG.features,
        performance: CONFIG.performance,
        paths: {
          backup: "./radata",
          restore: "./radata",
          storage: "./radata",
          logs: "./logs",
        },
      });

      try {
        console.log("Mogu initialized successfully");

        // Verifica e ripristina l'ultimo backup se esiste
        const lastBackup = metrics.backups.lastBackup.hash;
        if (lastBackup) {
          const comparison = await mogu.compare(lastBackup, "./radata");
          if (comparison && !comparison.totalChanges?.modified) {
            await mogu.restore(lastBackup, "./radata");
            console.log("Last backup restored successfully");
          }
        }
      } catch (error) {
        console.error("Error initializing Mogu:", error);
      }
    }

    initializeGunListeners(gun, mogu);

    app.use(Gun.serve);

    // Tracking connessioni WebSocket
    server.on("connection", (socket) => {
      metrics.connections++;
      console.log(`New connection - Total: ${metrics.connections}`);

      socket.on("close", () => {
        metrics.connections = Math.max(0, metrics.connections - 1);
        console.log(`Connection closed - Total: ${metrics.connections}`);
      });
    });

    // Tracking eventi Gun
    gun.on("hi", (peer) => {
      metrics.connections++;
      console.log(
        `Peer connected: ${peer.id || "unknown"} - Total: ${
          metrics.connections
        }`
      );
    });

    gun.on("bye", (peer) => {
      metrics.connections = Math.max(0, metrics.connections - 1);
      console.log(
        `Peer disconnected: ${peer.id || "unknown"} - Total: ${
          metrics.connections
        }`
      );
    });

    return { gun, mogu };
  } catch (error) {
    console.error("Error initializing server:", error);
    process.exit(1);
  }
}

// Inizializza il server
initializeServer()
  .then(({ gun: g, mogu: m }) => {
    gun = g;
    mogu = m;
    console.log("Server initialized successfully");

    // Avvia lo scheduler dei backup
    setInterval(scheduleBackup, 5 * 60 * 1000); // Controlla ogni 5 minuti

    // Esegui il primo backup dopo 5 minuti dall'avvio
    setTimeout(scheduleBackup, 5 * 60 * 1000);
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

    const cpuPercent = Math.min(
      100,
      Math.max(0, ((userDiff + systemDiff) / (timeDiff * 1000)) * 100)
    );

    lastCPUUsage = currentUsage;
    lastCPUTime = currentTime;

    return cpuPercent;
  } catch (error) {
    console.error("Error getting CPU usage:", error);
    return 0;
  }
}
