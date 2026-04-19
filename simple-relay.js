import express from 'express';
import Gun from 'gun';
import * as umbral from '@nucypher/umbral-pre';

const app = express();
app.use(express.json());
const port = process.env.PORT || 8765;

// 1. ADD CORS MIDDLEWARE
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

// 2. INITIALIZE SERVER & GUN WITH PERSISTENCE
const server = app.listen(port, () => {
    console.log(`🚀 Semplice Relay avviato su http://localhost:${port}`);
});

const gun = Gun({ 
    web: server,
    file: 'radata', // Persistence in a folder Vite already ignores
    radisk: true
});
console.log('GunDB in ascolto con persistenza (radata)...');

app.get('/', (req, res) => {
    res.send('Il Relay è attivo! Connettiti tramite WebSocket a /gun');
});

/**
 * Helper to wait for data in GunDB (for sync latency)
 */
async function waitForGunData(pathNode, attempts = 5, delay = 1000) {
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

// 3. TPRE ENDPOINT (Now with patient sync check)
app.post('/api/v1/tpre/reencrypt', async (req, res) => {
    const { groupId, memberPub, capsuleB64 } = req.body;
    
    // Log with more detail to help debugging
    console.log(`[Relay] 📥 Request for Group: ${groupId?.substring(0,8)} | Member: ${memberPub?.substring(0,12)}...`);

    if (!groupId || !memberPub || !capsuleB64) {
      return res.status(400).json({ error: "Missing required parameters" });
    }
  
    try {
      // Use the patient waiter for kfrags
      const kfragNode = gun.get("signal_rooms").get(groupId).get("relay_kfrags").get(memberPub);
      const kfragString = await waitForGunData(kfragNode);
      
      if (!kfragString) {
        console.warn(`[Relay] ❌ Kfrag NOT FOUND for member ${memberPub?.substring(0,8)} in group ${groupId?.substring(0,8)}`);
        return res.status(404).json({ error: "No relay kfrag found for this member" });
      }
  
      const kfragBytes = new Uint8Array(Buffer.from(kfragString, 'base64'));
      const kfrag = umbral.KeyFrag.fromBytes(kfragBytes).skipVerification();
      
      const capsuleBytes = new Uint8Array(Buffer.from(capsuleB64, 'base64'));
      const capsule = umbral.Capsule.fromBytes(capsuleBytes);
  
      const cfrag = umbral.reencrypt(capsule, kfrag);
      const cfragB64 = Buffer.from(cfrag.toBytes()).toString('base64');
  
      console.log(`[Relay] ✅ Re-encryption successful for ${memberPub.substring(0,8)}`);
      res.json({ cfrag: cfragB64 });
    } catch (err) {
      console.error(`[Relay] 💥 Error:`, err.message);
      res.status(500).json({ error: "Failed to perform re-encryption", details: err.message });
    }
});
