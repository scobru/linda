# Flusso di Crittografia Linda (Zen-Native)

Linda usa la crittografia nativa di [Zen](https://github.com/akaoio/zen): una singola coppia di chiavi per utente e ECDH diretto tra peer, senza layer intermedi (stile Keet/Holepunch). I precedenti layer TPRE (Umbral) e post-quantum (ML-KEM) sono stati rimossi.

## 1. Identità (chiave unica)

Ogni utente ha **una sola coppia di chiavi** secp256k1 generata da `zen.pair()`:

```
{ pub, priv, address }
```

La stessa chiave serve sia per la firma sia per lo scambio ECDH. **Non esiste una `epub`/`epriv` separata** come in Gun SEA: qualunque codice che legge `pair.epub` ottiene `undefined`. Per compatibilità con i peer che leggono ancora il campo `epub` dal grafo, `publishBundle` pubblica `pair.pub` sotto quel nome.

Le chiavi sono derivabili deterministicamente da username+password (`generatePairFromSeed`), quindi il login non richiede alcun server di autenticazione.

## 2. Chat 1:1 (P2P ECDH)

1. **Risoluzione**: username/@handle → `pub` del contatto tramite gli indici decentralizzati (`linda_unique_usernames`, `usernames`, alias Gun).
2. **Segreto condiviso**: `zen.secret(peerPub, myPair)` — ECDH diretto sulla `pub` del peer. Nessun round-trip di discovery per chiavi di scambio separate.
3. **Cifratura**: `zen.encrypt(msg, secret)` — AES-GCM. Output in formato base62 `ct.iv.s` (tre segmenti separati da punto). **Non** è il formato Gun SEA `SEA{"ct":...}`: i messaggi che iniziano con `SEA{` sono legacy e vengono scartati come `LEGACY_UNSUPPORTED`.
4. **Trasporto**: il ciphertext viene scritto nella room P2P deterministica `linda_rooms/p2p_<pubA>_<pubB>` (pub ordinate) più un "poke" nell'inbox del destinatario (`linda_v3_inbox_<pub>`) per notificarlo.
5. **Decifratura**: il destinatario deriva lo stesso segreto con `zen.secret(senderPub, myPair)` e decifra localmente.

I segreti DH sono memoizzati per `pub` (cache in `CommunicationService`).

## 3. Gruppi (chiave simmetrica condivisa)

- L'admin genera un segreto di gruppo (`meta.secret`, chiave AES-GCM in base64).
- I membri lo ricevono tramite invito e cifrano/decifrano localmente (`encryptGroupMessage`/`decryptGroupMessage` in `GroupService`, WebCrypto AES-GCM con IV 12 byte prefissato al ciphertext).
- Le room P2P riusano la stessa infrastruttura con `secret` vuoto: il payload viaggia già cifrato dall'envelope ECDH del punto 2.

## 4. Stream e File

- **File**: WebRTC Data Channels diretti tra peer, o Wormhole per trasferimenti asincroni.
- **Segnalazione**: i segnali di coordinamento viaggiano cifrati sul canale ECDH.

| Layer | Tecnologia | Scopo |
| :--- | :--- | :--- |
| **Persistenza** | Zen (grafo P2P) | Storage decentralizzato e sync. |
| **Identità** | Coppia unica secp256k1 | Firma + ECDH con la stessa chiave. |
| **Chat 1:1** | `zen.secret` + `zen.encrypt` (AES-GCM) | E2EE diretto tra peer. |
| **Gruppi** | Chiave simmetrica condivisa (AES-GCM) | E2EE di gruppo. |
| **File** | WebRTC / Wormhole | Trasferimenti diretti cifrati. |
