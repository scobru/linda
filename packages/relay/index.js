import dotenv from 'dotenv';
import express from 'express';
import Gun from 'gun';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Mogu } from '@scobru/mogu';
import http from 'http';
import WebSocket from 'ws';
import { generateKeyPairSync } from 'crypto';
import { createAccount, sendMessage } from './activitypub/admin.js';

// Configurazione ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Costanti di configurazione
const DAPP_NAME = process.env.DAPP_NAME || "linda-messenger";
const BASE_URL = process.env.BASE_URL || "https://gun-relay.scobrudot.dev";
const MULTICAST_ADDRESS = '239.255.255.250';
const MULTICAST_PORT = 8765;

// Importazioni Gun necessarie
import 'gun/gun.js';
import 'gun/sea.js';
import 'gun/lib/axe.js';
import 'gun/lib/radisk.js';

const app = express();
const server = http.createServer(app);
server.setTimeout(30000);
const port = process.env.PORT || 8765;

console.log('Starting server with configuration:');
console.log('- DAPP_NAME:', DAPP_NAME);
console.log('- PORT:', port);
console.log('- NODE_ENV:', process.env.NODE_ENV);

// Configurazione Gun per il relay
const GUN_CONFIG = {
  web: server,
  multicast: {
    address: MULTICAST_ADDRESS,
    port: MULTICAST_PORT
  },
  radisk: true,           // mantieni radisk per la persistenza su filesystem
  localStorage: false,     // disabilita localStorage
  store: false,           // disabilita store generico
  rindexed: false,        // disabilita IndexedDB
  file: "./radata",       // mantieni il path per radisk
  axe: true,
  peers: process.env.PEERS ? process.env.PEERS.split(',') : []
};

console.log('Gun configuration:', GUN_CONFIG);

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

// Middleware per CORS - deve essere prima di tutti gli altri middleware
app.use((req, res, next) => {
    // Abilita CORS per tutte le origini in sviluppo
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Gestisci le richieste OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Middleware per il parsing del body
app.use(express.json({ 
    type: ['application/json', 'application/activity+json']
}));

// Middleware
app.use(express.static("dashboard"));

// Middleware Gun
app.head('/gun', (req, res) => {
  res.status(200).end();
});

app.get('/gun', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: Date.now() });
});

app.use((req, res, next) => {
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }
  next();
});

// Middleware per il logging delle richieste
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  next();
});

// Middleware per gestire gli errori
app.use((err, req, res, next) => {
  console.error('Errore nel middleware:', err);
  res.status(500).json({ error: err.message });
});

// Variabili globali
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

// Modifica la funzione performBackup per gestire correttamente l'hash
async function performBackup() {
  if (!mogu || !CONFIG.STORAGE.enabled) {
    console.log("Backup skipped: mogu not initialized or storage disabled");
    return;
  }

  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      console.log(`Tentativo di backup ${retries + 1}/${MAX_RETRIES}`);
      const backupResult = await mogu.backup();

      // Estrai l'hash dal risultato del backup
      const hash = backupResult?.hash || backupResult;
      
      if (hash) {
        console.log("New backup created with hash:", hash);
        lastBackupTime = Date.now();
        
        const radataSize = getRadataSize();
        
        // Aggiorna le metriche con l'hash corretto
        metrics.backups.lastBackup = {
          hash: typeof hash === 'object' ? JSON.stringify(hash) : hash,
          time: new Date().toISOString(),
          size: radataSize,
          link: `https://gateway.pinata.cloud/ipfs/${typeof hash === 'object' ? hash.hash || hash : hash}`
        };
        
        metrics.backups.stats.successful++;
        metrics.backups.stats.total++;
        
        return true;
      }
    } catch (error) {
      retries++;
      console.error(`Tentativo di backup ${retries} fallito:`, error);

      if (retries < MAX_RETRIES) {
        console.log(`Attendo ${RETRY_DELAY}ms prima del prossimo tentativo...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      } else {
        console.error("Tutti i tentativi di backup sono falliti");
        metrics.backups.stats.failed++;
        metrics.backups.stats.total++;
      }
    }
  }

  return false;
}

// Modifica la funzione principale di inizializzazione
async function initializeServer() {
  try {
    console.log('Initializing server...');
    
    const server = http.createServer(app);
    server.setTimeout(30000);
    
    const gunConfig = {
      ...GUN_CONFIG,
      web: server
    };

    console.log('Creating Gun instance...');
    gun = new Gun(gunConfig);
    console.log("Gun server started");

    app.use(Gun.serve);
    console.log('Gun middleware configured');

    setupConnectionHandlers(server, gun);
    console.log('Connection handlers configured');

    await new Promise((resolve, reject) => {
      server.listen(port, () => {
        console.log(`Relay listening at http://localhost:${port}`);
        resolve();
      }).on('error', (error) => {
        console.error('Server failed to start:', error);
        reject(error);
      });
    });

    if (CONFIG.STORAGE.enabled) {
      console.log('Initializing Mogu...');
      mogu = new Mogu({
        key: "",
        storageService: CONFIG.STORAGE.service,
        storageConfig: CONFIG.STORAGE.config,
        server: gun,
        useIPFS: false
      });
      console.log("Mogu initialized successfully");
    }

    initializeGunListeners(gun, mogu);
    console.log('Gun listeners initialized');

    return { gun, mogu };
  } catch (error) {
    console.error("Error initializing server:", error);
    process.exit(1);
  }
}

// Avvia il server
initializeServer()
  .then(() => {
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

// Funzione per attendere l'inizializzazione di Gun
const waitForGunInit = () => {
  return new Promise((resolve) => {
    if (gun && gun._.opt.peers && Object.keys(gun._.opt.peers).length > 0) {
      resolve();
    } else {
      gun.on('hi', resolve);
    }
  });
};

// Modifica la funzione syncGlobalMetrics per rimuovere i metadati dai log
async function syncGlobalMetrics() {
  try {
    await waitForGunInit();
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
  } catch (error) {
    console.error("Errore durante la sincronizzazione delle metriche:", error);
  }
}

// Import degli endpoint ActivityPub locali
import { 
  handleActorEndpoint, 
  handleInbox, 
  handleOutbox,
  handleFollowers,
  handleFollowing,
  handleWebfinger
} from './activitypub/endpoints.js';

// ActivityPub Endpoints
app.get('/.well-known/webfinger', async (req, res) => {
  try {
    const resource = req.query.resource;
    const response = await handleWebfinger(resource);
    res.json(response);
  } catch (error) {
    console.error('Errore nella gestione webfinger:', error);
    res.status(400).json({ error: error.message });
  }
});

// Endpoint Actor
app.get('/users/:username', async (req, res) => {
  console.log(`\nRichiesta profilo per utente: ${req.params.username}`);
  try {
    const actorData = await handleActorEndpoint(gun, DAPP_NAME, req.params.username);
    console.log('Actor data:', actorData);
    
    // Imposta gli header corretti per ActivityPub
    res.setHeader('Content-Type', 'application/activity+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.json(actorData);
  } catch (error) {
    console.error('Errore nella gestione della richiesta actor:', error);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString(),
      path: req.path
    });
  }
});

// Endpoint Inbox
app.post('/users/:username/inbox', express.json({ type: 'application/activity+json' }), async (req, res) => {
  try {
    await handleInbox(gun, DAPP_NAME, req.params.username, req.body, req);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Errore nella gestione dell\'inbox:', error);
    res.status(500).json({ 
      error: error.message,
      type: error.name,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint POST outbox
app.post('/users/:username/outbox', express.json({ type: 'application/activity+json' }), async (req, res) => {
  try {
    const { username } = req.params;
    const activity = req.body;

    // Verifica che l'utente esista
    const userExists = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .once((data) => resolve(!!data));
    });

    if (!userExists) {
      return res.status(404).json({ 
        error: 'Utente non trovato',
        username
      });
    }

    // Gestisci l'attività
    const result = await handleOutbox(gun, DAPP_NAME, username, activity);
    
    res.setHeader('Content-Type', 'application/activity+json; charset=utf-8');
    res.status(201).json(result);
  } catch (error) {
    console.error('Errore nel salvataggio dell\'attività:', {
      error: error.stack,
      params: req.params,
      body: req.body
    });
    res.status(500).json({ 
      error: error.message,
      type: error.name,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint Outbox
app.get('/users/:username/outbox', async (req, res) => {
  try {
    const { username } = req.params;
    
    // Verifica che l'utente esista
    const userExists = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('activitypub')
        .get(username)
        .once((data) => resolve(!!data));
    });

    if (!userExists) {
      return res.status(404).json({ 
        error: 'Utente non trovato',
        username
      });
    }

    // Recupera le attività dall'outbox
    const outbox = await handleOutbox(gun, DAPP_NAME, username);
    
    res.setHeader('Content-Type', 'application/activity+json; charset=utf-8');
    res.json(outbox);
  } catch (error) {
    console.error('Errore nel recupero dell\'outbox:', {
      error: error.stack,
      params: req.params
    });
    res.status(500).json({ 
      error: error.message,
      type: error.name,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint Followers
app.get('/users/:username/followers', async (req, res) => {
  try {
    const followers = await handleFollowers(gun, DAPP_NAME, req.params.username);
    res.json(followers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint Following
app.get('/users/:username/following', async (req, res) => {
  try {
    const following = await handleFollowing(gun, DAPP_NAME, req.params.username);
    res.json(following);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Aggiungi il tracking delle attività ActivityPub nelle metriche
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
    .on(async (msg, key) => {
      if (msg && !processedEvents.has(key)) {
        processedEvents.add(key);
        await updateGlobalMetric("totalMessagesSent", 1);
      }
    });

  // Tracking richieste di amicizia
  gun
    .get(DAPP_NAME)
    .get("friend_requests")
    .map()
    .on(async (data, key) => {
      if (data && !processedEvents.has(key)) {
        processedEvents.add(key);
        await updateGlobalMetric("totalFriendRequests", 1);
      }
    });

  // Tracking richieste rifiutate
  gun
    .get(DAPP_NAME)
    .get("rejected_requests")
    .map()
    .on(async (data, key) => {
      if (data && !processedEvents.has(key)) {
        processedEvents.add(key);
        await updateGlobalMetric("totalFriendRequestsRejected", 1);
      }
    });

  // Tracking separato per board e canali
  gun.get(DAPP_NAME)
    .get('channels')
    .map()
    .on(async (data, key) => {
      if (data && !processedEvents.has(key)) {
        processedEvents.add(key);
        
        // Verifica il tipo di canale
        if (data.type === 'channel') {
          await updateGlobalMetric('totalChannels', 1);
          console.log('Nuovo canale creato:', data.name);
        } else if (data.type === 'board') {
          await updateGlobalMetric('totalBoards', 1);
          console.log('Nuova board creata:', data.name);
        }
      }
    });

  // Tracking attività ActivityPub
  gun.get(DAPP_NAME)
    .get('activitypub')
    .map()
    .on(async (activity, key) => {
      if (activity && !processedEvents.has(key)) {
        processedEvents.add(key);
        
        // Aggiorna le metriche in base al tipo di attività
        switch(activity.type) {
          case 'Create':
            await updateGlobalMetric('totalPosts', 1);
            break;
          case 'Follow':
            await updateGlobalMetric('totalFollows', 1);
            break;
          case 'Like':
            await updateGlobalMetric('totalLikes', 1);
            break;
          case 'Announce':
            await updateGlobalMetric('totalBoosts', 1);
            break;
        }
      }
    });

  // Pulizia periodica degli eventi processati
  setInterval(() => {
    processedEvents.clear();
  }, 60000); // Pulisci ogni minuto
}

// Modifica la funzione updateGlobalMetric
async function updateGlobalMetric(metric, value = 1) {
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

// Endpoint per le statistiche
app.get('/stats', (req, res) => {
  try {
    const stats = {
      peers: {
        count: Object.keys(gun._.opt.peers || {}).length,
        time: Date.now()
      },
      node: {
        count: Object.keys(gun._.graph || {}).length
      },
      dam: {
        in: {
          count: metrics.getOperations,
          done: metrics.bytesTransferred
        },
        out: {
          count: metrics.putOperations,
          done: metrics.bytesTransferred
        }
      },
      memory: process.memoryUsage(),
      cpu: {
        stack: getCPUUsage()
      },
      storage: {
        radata: formatBytes(getRadataSize()),
        total: formatBytes(getRadataSize())
      },
      up: {
        time: process.uptime()
      },
      over: 15000
    };

    res.json(stats);
  } catch (error) {
    console.error('Errore nel recupero delle statistiche:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Esporta le funzioni necessarie
export {
  gun,
  mogu,
  metrics,
  globalMetrics,
  initializeServer,
  updateMetrics,
  syncGlobalMetrics,
  generateActivityPubKeys,
};

// Funzione per gestire gli eventi di connessione
function setupConnectionHandlers(server, gun) {
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
      `Peer connesso: ${peer.id || "unknown"} - Totale: ${metrics.connections}`
    );
  });

  gun.on("bye", (peer) => {
    metrics.connections = Math.max(0, metrics.connections - 1);
    console.log(
      `Peer disconnesso: ${peer.id || "unknown"} - Totale: ${metrics.connections}`
    );
  });
}

// Funzione per generare chiavi RSA compatibili con ActivityPub
function generateActivityPubKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
  
  return {
    privateKey,
    publicKey
  };
}

// API Endpoints
app.post('/api/admin/create', async (req, res) => {
    try {
        const { account } = req.body;
        
        if (!account) {
            return res.status(400).json({
                error: 'Nome account mancante'
            });
        }

        const result = await createAccount(gun, DAPP_NAME, account);
        res.json(result);
    } catch (error) {
        console.error('Errore nella creazione dell\'account:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

app.post('/api/sendMessage', async (req, res) => {
    try {
        const { acct, apikey, message } = req.body;
        
        if (!acct || !apikey || !message) {
            return res.status(400).json({
                error: 'Parametri mancanti'
            });
        }

        const result = await sendMessage(gun, DAPP_NAME, acct, apikey, message);
        res.json(result);
    } catch (error) {
        console.error('Errore nell\'invio del messaggio:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

app.post('/api/verify', async (req, res) => {
    try {
        const { username, apikey } = req.body;
        
        console.log('Richiesta verifica API key:', {
            username,
            hasApiKey: !!apikey
        });
        
        if (!username || !apikey) {
            return res.status(400).json({ 
                error: 'Username e API key sono richiesti' 
            });
        }

        // Verifica l'API key nel database Gun
        const isValid = await new Promise((resolve) => {
            gun
                .get(DAPP_NAME)
                .get('activitypub')
                .get(username)
                .get('apiKey')
                .once((storedKey) => {
                    console.log('Verifica API key:', {
                        username,
                        storedKey: storedKey ? '[PRESENTE]' : '[NON TROVATA]',
                        matches: storedKey === apikey
                    });
                    resolve(storedKey === apikey);
                });
        });

        if (!isValid) {
            console.log('API key non valida per:', username);
            return res.status(401).json({ 
                error: 'API key non valida' 
            });
        }

        console.log('API key verificata con successo per:', username);
        res.json({ 
            success: true, 
            username 
        });
    } catch (error) {
        console.error('Errore nella verifica dell\'API key:', error);
        res.status(500).json({ 
            error: error.message 
        });
    }
});

// Endpoint per la home
app.get('/', (req, res) => {
    res.redirect('/admin.html');
});

// Gestione errori 404 - DEVE ESSERE DOPO TUTTI GLI ALTRI ENDPOINT
app.use((req, res) => {
    console.log('404 - Endpoint non trovato:', req.path);
    res.status(404).json({
        error: 'Endpoint non trovato',
        path: req.path
    });
});

// Gestione errori generici - DEVE ESSERE L'ULTIMO MIDDLEWARE
app.use((err, req, res, next) => {
    console.error('Errore del server:', err);
    res.status(500).json({
        error: 'Errore interno del server',
        message: err.message
    });
});

