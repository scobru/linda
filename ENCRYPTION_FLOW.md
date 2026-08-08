# 🛡️ Flusso di Crittografia Linda (Zen-Native)

Questo documento descrive in dettaglio la logica crittografica utilizzata dall'applicazione **Linda** e dalla sua libreria core **[`linda-core`](https://github.com/scobru/linda-core)**. Per la documentazione architetturale completa in inglese, consultare [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## 1. Identità e Coppia di Chiavi Unica

Ogni utente in Linda possiede **una sola coppia di chiavi secp256k1** generata da `zen.pair()`:

```json
{
  "pub": "<chiave_pubblica_secp256k1>",
  "priv": "<chiave_privata_secp256k1>",
  "address": "<indirizzo_zen>"
}
```

- **Chiave Unificata**: La stessa chiave viene usata sia per firmare i nodi del grafo P2P Zen sia per effettuare lo scambio di chiavi Diffie-Hellman (ECDH).
- **Compatibilità**: Non esiste una coppia di chiavi di scambio separata (`epub`/`epriv`). Per garantire retrocompatibilità con client legacy che cercano il campo `epub`, `CommunicationService.publishBundle` pubblica `pair.pub` sotto il nome `epub`.
- **Generazione Deterministica**: Tramite `generatePairFromSeed(username, password)`, l'utente può ripristinare la propria identità senza dipendere da server d'autenticazione centralizzati.

---

## 2. Communication Service e Chat 1:1 (ECDH P2P)

Il flusso di comunicazione 1:1 segue questi passaggi:

1. **Risoluzione Identità**: Mappatura del nome utente o handle (`@username`) sulla chiave `pub` del destinatario tramite l'indice decentralizzato `linda_unique_usernames`.
2. **Derivazione Segreto Condiviso**: `zen.secret(peerPub, myPair)` esegue l'ECDH sulla chiave pubblica del peer. I segreti sono salvati nella cache in memoria di `CommunicationService`.
3. **Cifratura AES-GCM**: `zen.encrypt(messaggio, segreto)` cifra il testo. L'output è in formato base62 a tre segmenti separati da punti (`ciphertext.iv.tag`). Messaggi con formato legacy Gun SEA (`SEA{...}`) vengono scartati.
4. **Instradamento Room e Inbox Poke**:
   - Il messaggio cifrato viene scritto nella stanza P2P deterministica:
     `linda_rooms/p2p_<pubMinimo>_<pubMassimo>`
   - Un avviso cifrato ("poke") viene inviato all'inbox del destinatario (`linda_v3_inbox_<peerPub>`) per notificare il client di iscriversi alla stanza.
5. **Decifratura**: Il destinatario calcola lo stesso segreto tramite `zen.secret(senderPub, myPair)` e decifra il messaggio in locale.

---

## 3. Group Service e Chat di Gruppo

Nelle chat di gruppo la cifratura è gestita da `GroupService`:

- **Segreto di Gruppo**: L'amministratore del gruppo genera una chiave simmetrica a 256-bit (`meta.secret`).
- **Distribuzione Inviti**: Il segreto viene inviato ai membri tramite messaggi 1:1 cifrati con ECDH o tramite token d'invito firmati/scambiati in modo sicuro.
- **Firma e Cifratura dei Messaggi**: I messaggi di gruppo vengono prima firmati digitalmente con la coppia di chiavi secp256k1 del mittente (`zenCrypto.sign`), garantendo autenticità e non ripudio, e successivamente cifrati con la chiave simmetrica del gruppo (`zenCrypto.encrypt`).
- **Decifratura e Verifica**: I membri del gruppo decifrano il payload (`zenCrypto.decrypt`) con il segreto di gruppo e convalidano la firma crittografica del mittente (`zenCrypto.verify`), garantendo l'integrità e l'origine di ciascun messaggio.
- **Escrow e Resilienza Chiavi**: Ogni copia locale del segreto di gruppo viene salvata e custodita in escrow cifrato nello spazio utente (`linda_room_keys/<groupId>`) per sopravvivere a cancellazioni dei dati del browser o ripristini di sessione.

---

## 4. Trasferimento Dati e Chiamate

| Modulo | Descrizione |
| :--- | :--- |
| **`CallingService`** | Segnalazione WebRTC su stanze Zen per chiamate audio/video P2P. |
| **`FileTransferService`** | Trasferimento file P2P diretto a blocchi cifrati su WebRTC DataChannels. |
| **`WormholeService`** | Trasferimento file asincrono cifrato tramite relay temporanei Wormhole. |

---

## 5. Nodi Relay Ciechi (Blind Relays)

I server di relay non conoscono le chiavi private e non partecipano ad alcuna operazione di cifratura o decifratura:
- Sincronizzano il grafo cifrato in modalità P2P.
- Verificano l'autenticità delle firme dei nodi.
- Utilizzano certificati Zen dedicati per permettere la scrittura cifrata nelle inbox dei destinatari.

---

## 📚 Riferimenti

- [Documentazione Architetturale Completa (`docs/ARCHITECTURE.md`)](./docs/ARCHITECTURE.md)
- [Libreria Core `linda-core`](https://github.com/scobru/linda-core)
- [Design System (`DESIGN.md`)](./DESIGN.md)
