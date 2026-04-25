
import { DataBase } from './src/zen/db';
import { GroupService } from './src/services/GroupService';
import { ThresholdService } from './src/services/ThresholdService';
import ZEN from 'zen';

// Polyfills necessari per Node.js
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;

// Mock di localStorage per Node.js (necessario per CommunicationService/ThresholdService)
import { LocalStorage } from 'node-localstorage';
globalThis.localStorage = new LocalStorage('./bot-storage');

async function startLindaBot() {
    console.log("\n🚀 Avvio del bot Linda (Zen-native)...");

    const zen = new ZEN({
        peers: ["https://shogun-relay.scobrudot.dev/zen"],
        localStorage: false,
        radisk: false,
    });
    const db = new DataBase(zen);

    // 1. Autenticazione del Bot
    const botAlias = process.env.BOT_ALIAS || "LindaBot_Dev";
    const botPass = process.env.BOT_PASS || "BotSecurePass123!";

    console.log(`[Bot] Autenticazione come "${botAlias}"...`);
    
    // Attendiamo che Zen sia pronto
    await new Promise(r => setTimeout(r, 1000));

    try {
        await db.login(botAlias, botPass);
    } catch (e) {
        console.log("[Bot] Account non trovato, registrazione in corso...");
        await db.signUp(botAlias, botPass);
    }

    const myPub = db.getUserPub();
    if (!myPub) {
        console.error("[Bot] Errore critico: Impossibile ottenere la PubKey.");
        process.exit(1);
    }
    console.log(`[Bot] Loggato! PubKey: ${myPub}`);

    // 2. Inizializzazione Servizi
    const groupService = new GroupService(db);
    
    // ID del canale broadcast (può essere passato come argomento o variabile d'ambiente)
    const channelId = process.argv[2] || process.env.CHANNEL_ID; 

    if (!channelId) {
        console.error("\n❌ ERRORE: Devi fornire un CHANNEL_ID.");
        console.log("Esempio: npm run bot -- IL_TUO_CHANNEL_ID");
        process.exit(1);
    }

    // 3. Funzione per inviare un messaggio
    const broadcastMessage = async (text: string) => {
        try {
            const meta = await (db.Get as any)(`linda_rooms/${channelId}/meta`);
            if (!meta) {
                console.warn(`[Bot] Avviso: Meta per ${channelId} non ancora sincronizzato.`);
                return;
            }

            console.log(`[Bot] Invio messaggio nel canale...`);
            const encryptedBody = await groupService.encryptGroupMessage(meta, text);

            await (db.Put as any)(`linda_rooms/${channelId}/messages/${Date.now()}`, {
                body: encryptedBody,
                sender: myPub,
                type: 'text',
                timestamp: Date.now()
            });
        } catch (e: any) {
            console.error("[Bot] Errore invio:", e.message);
        }
    };

    // 4. Ascolto dei messaggi (Reattività Zen)
    console.log(`[Bot] In ascolto sui messaggi del canale ${channelId}...`);
    
    (db.On as any)(`linda_rooms/${channelId}/messages`, async (data: any) => {
        if (!data || data.sender === myPub || !data.body) return;

        const meta = await (db.Get as any)(`linda_rooms/${channelId}/meta`);
        if (!meta) return;
        
        try {
            const decrypted = await groupService.decryptGroupMessage(meta, data.body);
            console.log(`[Bot] Messaggio ricevuto: ${decrypted}`);

            if (decrypted.trim().toLowerCase() === "/ping") {
                await broadcastMessage("PONG! 🏓 (Zen Mode)");
            }
            
            if (decrypted.trim().toLowerCase() === "/info") {
                await broadcastMessage(`🤖 *Linda Bot Status*\n- Protocollo: Zen\n- Uptime: ${process.uptime().toFixed(1)}s\n- Identity: ${myPub.slice(0, 10)}...`);
            }
        } catch (e) {
            // Silenzioso: probabilmente un messaggio che non possiamo ancora decifrare
        }
    });

    // Annuncio di avvio
    setTimeout(() => {
        broadcastMessage("🤖 Bot Linda Online via Zen! Invia /info per comandi.");
    }, 2000);
}

startLindaBot().catch(err => {
    console.error("[Bot] Errore fatale durante l'esecuzione:", err);
    process.exit(1);
});
