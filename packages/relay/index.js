require("dotenv").config();

const express = require("express");
const Gun = require("gun");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { Mogu } = require("@scobru/mogu");
const http = require("http");
const WebSocket = require("ws");
const mogu = require("@scobru/mogu");
const https = require("https");

// Costanti di configurazione
const DAPP_NAME = process.env.DAPP_NAME || "linda-messenger";
const MULTICAST_ADDRESS = "239.255.255.250";
const MULTICAST_PORT = 8765;
const RADATA_PATH = path.join(process.cwd(), "radata");
const SSL_ENABLED = process.env.SSL_ENABLED === "true";
const SSL_PATH = process.env.SSL_PATH || path.join(process.cwd(), "ssl");

// SSL Configuration
const SSL_CONFIG =
  SSL_ENABLED && process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH
    ? {
        key: fs.readFileSync(process.env.SSL_KEY_PATH),
        cert: fs.readFileSync(process.env.SSL_CERT_PATH),
        rejectUnauthorized: false, // Allow self-signed certificates
      }
    : null;

// Importazioni Gun necessarie
require("gun/gun.js");
require("gun/sea.js");
require("gun/lib/axe.js");
require("gun/lib/radisk.js");
// rimport wire
require("gun/lib/wire.js");

// Utility Functions
function formatBytes(bytes, decimals = 2) {
  if (!bytes) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Variabili per il monitoraggio CPU
let lastCPUInfo = os.cpus().map((cpu) => ({
  idle: cpu.times.idle,
  total: Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0),
}));

function getCPUUsage() {
  try {
    const cpus = os.cpus();
    const currentCPUInfo = cpus.map((cpu) => ({
      idle: cpu.times.idle,
      total: Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0),
    }));

    const cpuUsage = currentCPUInfo.map((cpu, i) => {
      const idleDiff = cpu.idle - lastCPUInfo[i].idle;
      const totalDiff = cpu.total - lastCPUInfo[i].total;
      const usage = 100 - (idleDiff / totalDiff) * 100;
      return Math.min(100, Math.max(0, usage));
    });

    lastCPUInfo = currentCPUInfo;

    return {
      average: cpuUsage.reduce((acc, val) => acc + val, 0) / cpuUsage.length,
      cores: cpuUsage,
      count: cpus.length,
    };
  } catch (error) {
    console.error("Error getting CPU usage:", error);
    return {
      average: 0,
      cores: [],
      count: 0,
    };
  }
}

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

function getDetailedSystemStats() {
  const cpuInfo = getCPUUsage();
  const memInfo = getMemoryUsage();
  const radataSize = getRadataSize();

  return {
    cpu: {
      average: cpuInfo.average,
      cores: cpuInfo.cores,
      count: cpuInfo.count,
    },
    memory: {
      heapUsed: memInfo.heapUsed,
      heapTotal: memInfo.heapTotal,
      external: memInfo.external,
      rss: memInfo.rss,
      arrayBuffers: memInfo.arrayBuffers,
      formatted: {
        heapUsed: formatBytes(memInfo.heapUsed),
        heapTotal: formatBytes(memInfo.heapTotal),
        rss: formatBytes(memInfo.rss),
      },
    },
    storage: {
      radata: formatBytes(radataSize),
      total: formatBytes(radataSize),
    },
    uptime: process.uptime(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  };
}

// Initialize Express app
const app = express();
const port = process.env.PORT || 8765;

// Middleware
app.use(express.static(path.join(__dirname, "dashboard")));
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Expose-Headers", "*");
  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Configurazione Gun per il relay
const GUN_CONFIG = {
  multicast: false,
  host: process.env.HOST || "0.0.0.0",
  port: port,
  peers: process.env.PEERS ? process.env.PEERS.split(",") : [],
  radisk: true,
  file: RADATA_PATH,
  axe: true,
  super: true,
  wire: true,
  web:
    SSL_ENABLED && SSL_CONFIG
      ? https.createServer(SSL_CONFIG, app)
      : http.createServer(app),
  ws: {
    path: "/gun",
    server: null,
    noServer: true,
  },
};

// Configure WebSocket server with proper SSL handling
const wss = new WebSocket.Server({
  server: GUN_CONFIG.web,
  path: "/gun",
  perMessageDeflate: false,
  clientTracking: true,
  verifyClient: SSL_ENABLED
    ? {
        rejectUnauthorized: false, // Allow self-signed certificates for WebSocket
      }
    : false,
});

// Update Gun config
GUN_CONFIG.web = GUN_CONFIG.web;

wss.on("connection", (ws, req) => {
  console.log("New WebSocket connection from:", req.socket.remoteAddress);
  metrics.connections++;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      // Handle Gun messages
      if (data.put) {
        metrics.putOperations++;
        metrics.bytesTransferred += message.length;
      } else if (data.get) {
        metrics.getOperations++;
        metrics.bytesTransferred += message.length;
      }
    } catch (e) {
      console.error("Error processing WebSocket message:", e);
    }
  });

  ws.on("close", () => {
    metrics.connections = Math.max(0, metrics.connections - 1);
    console.log("Client disconnected");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

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

// Metriche avanzate per il monitoraggio
const metrics = {
  connections: 0,
  putOperations: 0,
  getOperations: 0,
  bytesTransferred: 0,
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

async function verifyDataIntegrity() {
  try {
    if (!fs.existsSync(RADATA_PATH)) {
      console.warn("Radata directory not found, creating...");
      fs.mkdirSync(RADATA_PATH, { recursive: true });
      return;
    }

    const files = fs.readdirSync(RADATA_PATH);
    console.log(`Found ${files.length} files in radata directory`);

    // Verifica che i file non siano corrotti
    for (const file of files) {
      const filePath = path.join(RADATA_PATH, file);
      try {
        const stats = fs.statSync(filePath);
        console.log(`File ${file}: ${formatBytes(stats.size)}`);
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }
    }
  } catch (error) {
    console.error("Error verifying data integrity:", error);
  }
}

function ensureDirectoryPermissions() {
  try {
    if (!fs.existsSync(RADATA_PATH)) {
      fs.mkdirSync(RADATA_PATH, { recursive: true, mode: 0o755 });
    } else {
      fs.chmodSync(RADATA_PATH, 0o755);
    }
    console.log("Directory permissions verified");
  } catch (error) {
    console.error("Error setting directory permissions:", error);
  }
}

// Gun event listeners
function initializeGunListeners(gun) {
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
}

// Modifica initializeServer per includere la verifica
async function initializeServer() {
  try {
    ensureDirectoryPermissions();
    await verifyDataIntegrity();

    // Inizializza Gun
    const gun = Gun({
      ...GUN_CONFIG,
      web: GUN_CONFIG.web,
      localStorage: false,
      radisk: true,
    });

    // Inizializza i listener di Gun
    initializeGunListeners(gun);

    // Inizializza Mogu se abilitato
    let mogu;
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

    // Avvia il server
    GUN_CONFIG.web.listen(port, GUN_CONFIG.host, () => {
      console.log(`Relay listening at http://${GUN_CONFIG.host}:${port}`);
      console.log("Active peers:", Object.keys(gun._.opt.peers || {}));
    });

    // Gestione errori del server
    GUN_CONFIG.web.on("error", (error) => {
      console.error("Server error:", error);
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use`);
      }
    });

    // Avvia lo scheduler dei backup
    setInterval(scheduleBackup, 5 * 60 * 1000);
    setTimeout(scheduleBackup, 5 * 60 * 1000);

    return { gun, mogu };
  } catch (error) {
    console.error("Error initializing server:", error);
    process.exit(1);
  }
}

// Inizializza il server
initializeServer()
  .then(({ gun, mogu }) => {
    console.log("Server initialized successfully");
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });

// Aggiungi handler per gli errori non gestiti
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Stats endpoint
app.get("/stats", (req, res) => {
  try {
    const systemStats = getDetailedSystemStats();
    const radataSize = getRadataSize();
    const cpuInfo = getCPUUsage();

    const statsData = {
      peers: {
        count: metrics.connections,
        time: process.uptime() * 1000,
      },
      node: {
        count: metrics.putOperations + metrics.getOperations,
      },
      up: {
        time: process.uptime() * 60,
      },
      memory: {
        heapTotal: systemStats.memory.heapTotal,
        heapUsed: systemStats.memory.heapUsed,
      },
      cpu: {
        stack: cpuInfo.average,
        cores: cpuInfo.cores,
        count: cpuInfo.count,
      },
      dam: {
        in: {
          count: metrics.getOperations,
          done: metrics.bytesTransferred,
        },
        out: {
          count: metrics.putOperations,
          done: metrics.bytesTransferred,
        },
      },
      over: 15000,
      all: {},
      storage: systemStats.storage,
    };

    res.json(statsData);
  } catch (error) {
    console.error("Error serving stats:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});
