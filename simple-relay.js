import http from 'http';
import ZEN from 'zen';
import serve from "zen/lib/serve.js";
import * as umbral from '@nucypher/umbral-pre';

const port = process.env.PORT || 8765;
const handle = serve(process.cwd());

/**
 * Helper to wait for data in ZenDB (for sync latency)
 */
async function waitForZenData(pathNode, attempts = 5, delay = 1000) {
    for (let i = 0; i < attempts; i++) {
        const data = await new Promise((resolve) => {
            pathNode.once((val) => resolve(val));
            setTimeout(() => resolve(null), 800);
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

    // 3. TPRE ENDPOINT
    if (req.url === '/api/v1/tpre/reencrypt' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const { groupId, memberPub, capsuleB64 } = JSON.parse(body);
                console.log(`[Relay] 📥 Request for Group: ${groupId?.substring(0, 8)} | Member: ${memberPub?.substring(0, 12)}...`);

                if (!groupId || !memberPub || !capsuleB64) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: "Missing required parameters" }));
                }

                const kfragNode = zen.get("signal_rooms").get(groupId).get("relay_kfrags").get(memberPub);
                const kfragString = await waitForZenData(kfragNode);

                if (!kfragString) {
                    console.warn(`[Relay] ❌ Kfrag NOT FOUND for member ${memberPub?.substring(0, 8)}`);
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: "No relay kfrag found" }));
                }

                const kfragBytes = new Uint8Array(Buffer.from(kfragString, 'base64'));
                const kfrag = umbral.KeyFrag.fromBytes(kfragBytes).skipVerification();

                const capsuleBytes = new Uint8Array(Buffer.from(capsuleB64, 'base64'));
                const capsule = umbral.Capsule.fromBytes(capsuleBytes);

                const cfrag = umbral.reencrypt(capsule, kfrag);
                const cfragB64 = Buffer.from(cfrag.toBytes()).toString('base64');

                console.log(`[Relay] ✅ Re-encryption successful`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ cfrag: cfragB64 }));
            } catch (err) {
                console.error(`[Relay] 💥 Error:`, err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // 4. FALLBACK TO ZEN SERVE (Static files & zen.js)
    if (handle(req, res)) {
        return;
    }

    // If handle doesn't process it (returns false), we could add more or 404
});

server.listen(port, () => {
    console.log(`🚀 Semplice Relay Zen avviato su http://localhost:${port}`);
});

const zen = new ZEN({
    web: server
});
console.log('ZenDB in ascolto...');
