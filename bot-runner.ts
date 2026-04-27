
import { DataBase } from './src/zen/db.ts';
import { GroupService } from './src/services/GroupService.ts';
import { ThresholdService } from './src/services/ThresholdService.ts';
import 'zen/lib/yson.js';
import ZEN from 'zen';

// Polyfills necessari per Node.js
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;
(globalThis as any).window = globalThis;

// Mock di localStorage per Node.js (necessario per CommunicationService/ThresholdService)
import { LocalStorage } from 'node-localstorage';
globalThis.localStorage = new LocalStorage('./bot-storage');

async function startLindaBot() {
    console.log("\n🚀 Avvio del bot Linda (Zen-native)...");

    const zen = new ZEN({
        peers: ["https://shogun-relay.scobrudot.dev/zen"],
        radisk: false,
        localStorage: false
    });
    const db = new DataBase(zen);

    // 1. Autenticazione del Bot
    const botAlias = process.env.BOT_ALIAS || "LindaBot_Dev";
    const botPass = process.env.BOT_PASS || "BotSecurePass123!";

    console.log(`[Bot] Autenticazione come "${botAlias}"...`);

    // Attendiamo che Zen sia pronto e connesso ai peer
    await new Promise(r => setTimeout(r, 3000));

    const loginRes = await db.login(botAlias, botPass);
    if (!loginRes || !loginRes.success) {
        console.log("[Bot] Account non trovato, registrazione in corso...");
        const signUpRes = await db.signUp(botAlias, botPass);
        if (!signUpRes || !signUpRes.success) {
            console.error("[Bot] Errore critico: Registrazione fallita.");
            process.exit(1);
        }
    }

    const myPub = db.getUserPub();
    if (!myPub) {
        console.error("[Bot] Errore critico: Impossibile ottenere la PubKey.");
        process.exit(1);
    }
    console.log(`[Bot] Loggato! PubKey: ${myPub}`);

    // 2. Inizializzazione Servizi
    const groupService = new GroupService(db);

    // ID del canale o Invite Link (Base64)
    const inputArg = process.argv[2] || process.env.CHANNEL_ID || process.env.INVITE_LINK;

    if (!inputArg) {
        console.error("\n❌ ERRORE: Devi fornire un CHANNEL_ID o un INVITE_LINK.");
        console.log("Esempio: npm run bot -- IL_TUO_CHANNEL_ID_O_INVITE");
        process.exit(1);
    }

    let channelId = inputArg;

    // Tentiamo di capire se è un Invite Link Base64
    try {
        let jsonStr = "";
        const cleanInputArg = inputArg.trim().replace(/ /g, "+");
        try {
            jsonStr = decodeURIComponent(escape(atob(cleanInputArg)));
        } catch (e) {
            jsonStr = atob(cleanInputArg);
        }
        const decoded = JSON.parse(jsonStr);
        if (decoded && decoded.g) {
            console.log(`[Bot] Rilevato Invite Link. Tentativo di Join nel gruppo ${decoded.g}...`);
            const groupInfo = await groupService.joinGroup(inputArg);
            channelId = groupInfo.id;
            console.log(`[Bot] Join completato con successo! ChannelID: ${channelId}`);
        }
    } catch (e) {
        // Non è un Invite Link valido, lo trattiamo come CHANNEL_ID diretto
    }

    // Ensure Umbral PK is published for TPRE
    await groupService.ensureUmbralPK(channelId).catch(() => { });

    // 3. Funzione per inviare un messaggio
    const broadcastMessage = async (text: string) => {
        try {
            const meta = await (db.Get as any)(`linda_rooms/${channelId}/meta`);
            if (!meta) {
                console.warn(`[Bot] Avviso: Meta per ${channelId} non ancora sincronizzato.`);
                return;
            }

            console.log(`[Bot] Meta trovato:`, JSON.stringify(meta));
            console.log(`[Bot] Invio messaggio nel canale...`);
            const encryptedBody = await groupService.encryptGroupMessage(meta, text);

            const msgId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
            console.log(`[Bot] Invio messaggio Set su linda_rooms/${channelId}/messages...`);
            await (db.Set as any)(`linda_rooms/${channelId}/messages`, {
                msgId,
                body: encryptedBody,
                sender: myPub,
                type: 'text',
                timestamp: new Date().toISOString()
            });
            console.log(`[Bot] Messaggio inviato con successo!`);
        } catch (e: any) {
            console.error("[Bot] Errore invio:", e.message);
        }
    };

    // 4. Ascolto dei messaggi (Reattività Zen)
    console.log(`[Bot] In ascolto sui messaggi del canale ${channelId}...`);

    const processedMessages = new Set<string>();
    const sessionStartTime = Date.now();

    zen.get(`linda_rooms/${channelId}/messages`).map().on(async (data: any, msgId: string) => {
        if (!data || !data.body || !data.sender) return;
        if (data.sender === myPub) return;

        if (processedMessages.has(msgId)) return;
        processedMessages.add(msgId);

        const meta = await (db.Get as any)(`linda_rooms/${channelId}/meta`);
        if (!meta) return;

        try {
            const decrypted = await groupService.decryptGroupMessage(meta, data.body, "https://shogun-relay.scobrudot.dev");
            console.log(`[Bot] Messaggio ricevuto (${msgId.slice(0, 8)}): ${decrypted}`);

            const cleanMsg = decrypted.trim().toLowerCase();

            if (cleanMsg === "/ping") {
                await broadcastMessage("PONG! 🏓 (Zen Mode)");
            } else if (cleanMsg === "/info") {
                await broadcastMessage(`🤖 *Linda Bot Status*\n- Protocollo: Zen\n- Uptime: ${process.uptime().toFixed(1)}s\n- Identity: ${myPub.slice(0, 10)}...`);
            } else if (cleanMsg === "/help") {
                await broadcastMessage(`🤖 *Comandi Disponibili:*\n- \`/ping\` - Test risposta\n- \`/info\` - Info bot\n- \`/dice\` - Lancia un dado\n- \`/time\` - Ora attuale\n- \`/echo <testo>\` - Ripete il testo`);
            } else if (cleanMsg === "/dice") {
                const roll = Math.floor(Math.random() * 6) + 1;
                await broadcastMessage(`🎲 Hai lanciato un dado: **${roll}**`);
            } else if (cleanMsg === "/time") {
                await broadcastMessage(`🕒 Ora attuale: ${new Date().toLocaleTimeString('it-IT')}`);
            } else if (cleanMsg.startsWith("/echo ")) {
                const text = decrypted.substring(6);
                await broadcastMessage(`🗣️ Echo: ${text}`);
            }
        } catch (e: any) {
            console.error("[Bot] Errore risposta:", e.message);
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
