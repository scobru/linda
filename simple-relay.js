import './relay-env.js';
import fs from 'fs';
import path from 'path';
import http from 'http';

// 2. Now import Zen and other dependencies
const ZEN = (await import('zen')).default;
const serve = (await import('zen/lib/serve.js')).default;
const Store = (await import('zen/lib/rfs.js')).default;

const port = process.env.PORT || 8765;

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
    console.log(`[Relay] 🆙 Upgrade request for: ${req.url}`);
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

// Middleware to log graph operations
zen.on('in', function(msg) {
    if (msg.put) {
        const keys = Object.keys(msg.put);
        console.log(`[Relay] 📤 PUT: ${keys.length} nodes (first: ${keys[0]})`);
    }
    if (msg.get) {
        console.log(`[Relay] 📥 GET: ${msg.get['#']}`);
    }
    this.to.next(msg);
});

server.listen(port, () => {
    console.log(`🚀 Semplice Relay Zen avviato su http://localhost:${port}`);
    console.log('ZenDB in ascolto e pronto.');
});
