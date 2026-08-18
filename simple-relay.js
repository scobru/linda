import './relay-env.js';
import fs from 'fs';
import path from 'path';
import http from 'http';

// 2. Now import Zen and other dependencies
const ZEN = (await import('zen')).default;
const serve = (await import('zen/lib/serve.js')).default;
const Store = (await import('zen/lib/rfs.js')).default;

const port = process.env.PORT || 8765;
const DEBUG = process.env.RELAY_DEBUG === '1';
const STORE_DIR = path.resolve(process.cwd(), 'radata');

// Off by default: only prune cached ciphertext once an operator opts in by
// setting a retention window. Peers are expected to re-sync from elsewhere,
// but auto-deleting data nobody asked to expire is the wrong default.
const RETENTION_DAYS = process.env.RELAY_RETENTION_DAYS
    ? Number(process.env.RELAY_RETENTION_DAYS)
    : null;
const RETENTION_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RELAY_RATE_LIMIT || 300); // HTTP reqs / IP / window
const RATE_LIMIT_MAX_UPGRADES = Number(process.env.RELAY_UPGRADE_RATE_LIMIT || 30); // WS upgrades / IP / window

/**
 * Sliding-window rate limiter, one bucket per IP. In-memory and
 * single-process — fine for one relay instance; swap for a shared store
 * (Redis) if this ever runs behind a multi-process/multi-node deploy.
 */
function makeRateLimiter(maxRequests, windowMs) {
    const buckets = new Map();

    setInterval(() => {
        const now = Date.now();
        for (const [ip, bucket] of buckets) {
            if (now - bucket.start > windowMs) buckets.delete(ip);
        }
    }, windowMs).unref();

    return (ip) => {
        const now = Date.now();
        const bucket = buckets.get(ip);
        if (!bucket || now - bucket.start > windowMs) {
            buckets.set(ip, { start: now, count: 1 });
            return true;
        }
        bucket.count++;
        return bucket.count <= maxRequests;
    };
}

const allowHttpRequest = makeRateLimiter(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
const allowUpgrade = makeRateLimiter(RATE_LIMIT_MAX_UPGRADES, RATE_LIMIT_WINDOW_MS);

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.socket.remoteAddress || 'unknown';
}

/**
 * Helper to wait for data in ZenDB (for sync latency)
 */
async function waitForZenData(pathNode, attempts = 15, delay = 1500) {
    for (let i = 0; i < attempts; i++) {
        const data = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 3000); // 3s per attempt
            pathNode.once((val) => {
                clearTimeout(timeout);
                resolve(val);
            });
        });
        if (data && typeof data === 'string') return data;
        if (i < attempts - 1) {
            console.log(`[Relay] Data not found yet, retrying sync... (${i + 1}/${attempts})`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    return null;
}

const server = http.createServer(async (req, res) => {
    const ip = clientIp(req);
    if (!allowHttpRequest(ip)) {
        res.writeHead(429, { 'Content-Type': 'text/plain', 'Retry-After': '60' });
        return res.end('Too Many Requests');
    }

    // 1. Handle CORS for API
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

    if (req.method === "OPTIONS") {
        res.statusCode = 200;
        return res.end();
    }

    // 2. ROOT ROUTE
    if (req.url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('Il Relay Zen è attivo! Connettiti tramite WebSocket a /zen');
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    // 4. FALLBACK TO ZEN SERVE (Static files & zen.js)
    if (serve(req, res)) {
        return;
    }

    // Then try static files from current directory
    const isSystemFile = req.url.match(/\.(wasm|js|css|gif|png|jpg|jpeg|svg|json|mp3|ico)$/);
    let decodedPathname = parsedUrl.pathname;
    try {
        decodedPathname = decodeURIComponent(parsedUrl.pathname);
    } catch (e) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        return res.end("Bad Request");
    }
    const staticPath = path.resolve(process.cwd(), '.' + (decodedPathname === '/' ? '/index.html' : decodedPathname));

    // Never serve files outside the working directory (path traversal guard)
    if (!staticPath.startsWith(path.resolve(process.cwd()) + path.sep) && staticPath !== path.resolve(process.cwd())) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        return res.end("Forbidden");
    }

    if (fs.existsSync(staticPath)) {
        const stats = fs.statSync(staticPath);
        if (stats.isFile()) {
            const ext = path.extname(staticPath).toLowerCase();
            const mimeTypes = {
                '.js': 'text/javascript',
                '.wasm': 'application/wasm',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.ico': 'image/x-icon',
                '.html': 'text/html',
                '.svg': 'image/svg+xml',
                '.mp3': 'audio/mpeg'
            };
            res.writeHead(200, { "Content-Type": mimeTypes[ext] || 'text/plain' });
            fs.createReadStream(staticPath).pipe(res);
            return;
        }
    }

    if (isSystemFile) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("404 Not Found");
    }

    const indexPath = path.join(process.cwd(), 'index.html');
    if (fs.existsSync(indexPath)) {
        res.writeHead(200, { "Content-Type": "text/html" });
        fs.createReadStream(indexPath).pipe(res);
        return;
    }

    res.writeHead(404);
    res.end();
});

server.on('upgrade', (req, socket, head) => {
    const ip = clientIp(req);
    if (!allowUpgrade(ip)) {
        console.warn(`[Relay] ⚠️ Rate limit: too many upgrade attempts from ${ip}`);
        socket.destroy();
        return;
    }
    if (DEBUG) console.log(`[Relay] 🆙 Upgrade request for: ${req.url}`);
    if (req.url !== '/zen') {
        console.warn(`[Relay] ⚠️ Rejecting upgrade for invalid path: ${req.url}`);
        socket.destroy();
    }
});

const zen = new ZEN({
    web: server,
    ws: { path: '/zen' },
    radisk: true,
    store: Store({ file: 'radata' }),
    localStorage: false
});

// Middleware to log graph operations. Off by default (RELAY_DEBUG=1 to
// enable) — logging every PUT/GET at real traffic volume floods stdout
// and burns disk/CPU on log rotation for no operational benefit.
zen.on('in', function(msg) {
    if (DEBUG) {
        if (msg.put) {
            const keys = Object.keys(msg.put);
            console.log(`[Relay] 📤 PUT: ${keys.length} nodes (first: ${keys[0]})`);
        }
        if (msg.get) {
            console.log(`[Relay] 📥 GET: ${msg.get['#']}`);
        }
    }
    this.to.next(msg);
});

/**
 * Deletes cached ciphertext files older than maxAgeMs under dir. Relay data
 * is a replaceable cache, not the source of truth, so this is safe as long
 * as at least one relay/peer still holds a given room's history — which is
 * the operator's call, hence opt-in via RELAY_RETENTION_DAYS.
 */
async function pruneOldData(dir, maxAgeMs) {
    let removed = 0;
    async function walk(current) {
        let entries;
        try {
            entries = await fs.promises.readdir(current, { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            } else if (entry.isFile()) {
                try {
                    const stat = await fs.promises.stat(full);
                    if (Date.now() - stat.mtimeMs > maxAgeMs) {
                        await fs.promises.unlink(full);
                        removed++;
                    }
                } catch (e) {
                    // File may have been removed/rewritten concurrently — skip it.
                }
            }
        }
    }
    await walk(dir);
    return removed;
}

if (RETENTION_DAYS) {
    const maxAgeMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
    console.log(`[Relay] Retention enabled: pruning cached data older than ${RETENTION_DAYS}d every 6h.`);
    setInterval(async () => {
        try {
            const removed = await pruneOldData(STORE_DIR, maxAgeMs);
            if (removed > 0) {
                console.log(`[Relay] Retention sweep: removed ${removed} file(s) older than ${RETENTION_DAYS}d.`);
            }
        } catch (e) {
            console.warn('[Relay] Retention sweep failed:', e.message);
        }
    }, RETENTION_SWEEP_INTERVAL_MS).unref();
}

// A single bad request/message shouldn't take the whole relay down —
// log and keep serving everyone else.
process.on('uncaughtException', (err) => {
    console.error('[Relay] Uncaught exception (staying up):', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Relay] Unhandled rejection (staying up):', reason);
});

let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Relay] ${signal} received, shutting down gracefully...`);
    server.close(() => {
        console.log('[Relay] HTTP server closed.');
        process.exit(0);
    });
    // Force-exit if close() hangs on lingering keep-alive sockets.
    setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(port, () => {
    console.log(`🚀 Semplice Relay Zen avviato su http://localhost:${port}`);
    console.log('ZenDB in ascolto e pronto.');
    if (!DEBUG) console.log('[Relay] Verbose graph-op logging disabled (set RELAY_DEBUG=1 to enable).');
});
