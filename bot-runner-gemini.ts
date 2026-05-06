import { DataBase } from './src/zen/db.ts';
import { GroupService } from './src/services/GroupService.ts';
import 'zen/lib/yson.js';
import ZEN from 'zen';
import axios from 'axios';

import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

// Polyfills for Node.js
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;
(globalThis as any).window = globalThis;

// Mock localStorage for Node.js
import { LocalStorage } from 'node-localstorage';
globalThis.localStorage = new LocalStorage('./bot-storage');

async function startLindaAIBot() {
    console.log("\n🚀 Avvio del bot Linda AI (Gemini Flash)...");

    const zen = new ZEN({
        peers: ["https://shogun-relay.scobrudot.dev/zen"],
        radisk: false,
        localStorage: false
    });
    const db = new DataBase(zen);

    // 1. Bot Auth
    const botAlias = process.env.BOT_ALIAS || "LindaBot_AI";
    const botPass = process.env.BOT_PASS || "BotSecurePass123!AI";

    console.log(`[Bot] Autenticazione come "${botAlias}"...`);

    await new Promise(r => setTimeout(r, 3000));

    const loginRes = await db.login(botAlias, botPass);
    if (!loginRes || !loginRes.success) {
        console.log("[Bot] Account non trovato, registrazione...");
        const signUpRes = await db.signUp(botAlias, botPass);
        if (!signUpRes || !signUpRes.success) {
            console.error("[Bot] Errore critico: Registrazione fallita.");
            process.exit(1);
        }
    }

    const myPub = db.getUserPub();
    if (!myPub) {
        console.error("[Bot] Errore critico: No PubKey.");
        process.exit(1);
    }
    console.log(`[Bot] Loggato! PubKey: ${myPub}`);

    const groupService = new GroupService(db);

    const inputArg = process.argv[2] || process.env.CHANNEL_ID || process.env.INVITE_LINK;
    if (!inputArg) {
        console.error("\n❌ ERRORE: Fornire CHANNEL_ID o INVITE_LINK.");
        process.exit(1);
    }

    let channelId = inputArg;

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
            console.log(`[Bot] Rilevato Invite Link. Join nel gruppo ${decoded.g}...`);
            const groupInfo = await groupService.joinGroup(inputArg);
            channelId = groupInfo.id;
            console.log(`[Bot] Join completato! ChannelID: ${channelId}`);
        }
    } catch (e) { }

    await groupService.ensureUmbralPK(channelId).catch(() => { });

    const broadcastMessage = async (text: string) => {
        try {
            const meta = await (db.Get as any)(`linda_rooms/${channelId}/meta`);
            if (!meta) {
                console.warn(`[Bot] Avviso: Meta non sincronizzato.`);
                return;
            }

            console.log(`[Bot] Invio risposta AI...`);
            const encryptedBody = await groupService.encryptGroupMessage(meta, text);

            const msgId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
            await (db.Set as any)(`linda_rooms/${channelId}/messages`, {
                msgId,
                body: encryptedBody,
                sender: myPub,
                type: 'text',
                timestamp: new Date().toISOString()
            });
            console.log(`[Bot] Risposta inviata.`);
        } catch (e: any) {
            console.error("[Bot] Errore invio:", e.message);
        }
    };

    // Gemini Config
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    if (!GEMINI_API_KEY) {
        console.warn("⚠️ ATTENZIONE: GEMINI_API_KEY non impostata. Il bot userà risposte mock.");
    }

    const chatHistory: any[] = [];
    const systemInstruction = "Sei Linda, un assistente AI amichevole integrato in una chat decentralizzata basata su Zen. Rispondi in modo conciso e utile.";

    const askGemini = async (prompt: string): Promise<string> => {
        if (!GEMINI_API_KEY) {
            return `[MOCK AI] Ho ricevuto: "${prompt}". Configura GEMINI_API_KEY per risposte reali.`;
        }

        try {
            // Aggiorna cronologia
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });

            // Mantieni ultime 20 interazioni (40 elementi)
            if (chatHistory.length > 40) {
                chatHistory.splice(0, chatHistory.length - 40);
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

            const response = await axios.post(url, {
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                },
                contents: chatHistory,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000
                }
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (aiText) {
                chatHistory.push({ role: "model", parts: [{ text: aiText }] });
                return aiText.trim();
            }

            return "Non ho ricevuto una risposta valida da Gemini.";
        } catch (e: any) {
            console.error("[Gemini API] Errore:", e.response?.data || e.message);
            // Rimuovi l'ultimo messaggio dell'utente se fallisce per non corrompere la cronologia
            chatHistory.pop();
            return `Errore nella comunicazione con l'IA: ${e.message}`;
        }
    };

    console.log(`[Bot] In ascolto su ${channelId}...`);

    const processedMessages = new Set<string>();
    const sessionStartTime = Date.now();

    zen.get(`linda_rooms/${channelId}/messages`).map().on(async (data: any, msgId: string) => {
        if (!data || !data.body || !data.sender) return;
        if (data.sender === myPub) return;

        if (processedMessages.has(msgId)) return;
        processedMessages.add(msgId);

        // Salta messaggi vecchi
        if (data.timestamp && new Date(data.timestamp).getTime() < sessionStartTime) {
            return;
        }

        const meta = await (db.Get as any)(`linda_rooms/${channelId}/meta`);
        if (!meta) return;

        try {
            const decrypted = await groupService.decryptGroupMessage(meta, data.body, "https://shogun-relay.scobrudot.dev");
            console.log(`[Bot] Messaggio ricevuto: ${decrypted}`);

            const cleanMsg = decrypted.trim();

            if (!cleanMsg.startsWith("/bot")) {
                return;
            }

            const prompt = cleanMsg.substring(4).trim();
            if (!prompt) {
                await broadcastMessage("🤖 Ciao! Come posso aiutarti? Usa `/bot <messaggio>`");
                return;
            }

            const aiResponse = await askGemini(prompt);
            await broadcastMessage(aiResponse);

        } catch (e: any) {
            console.error("[Bot] Errore:", e.message);
        }
    });

    setTimeout(() => {
        broadcastMessage("🤖 Linda AI Online! Pronto a chattare.");
    }, 2000);
}

startLindaAIBot().catch(err => {
    console.error("[Bot] Errore fatale:", err);
    process.exit(1);
});
