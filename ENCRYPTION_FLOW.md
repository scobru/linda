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

## 3. Group Service, Ruoli e Chat di Gruppo

Nelle chat di gruppo la cifratura è gestita da `GroupService` (`node_modules/linda-core/src/services/GroupService.ts`).

### 3.1 Creazione e segreto di gruppo

- Chi crea il gruppo genera una chiave simmetrica AES a 256 bit (`crypto.getRandomValues`) e la marca come epoca `keyEpoch: 1`.
- La chiave **non viene mai scritta in chiaro nel grafo**: `GroupInfo.secret` è sempre stringa vuota (`""`) sul nodo pubblico `linda_rooms/<groupId>/meta`. Il campo esiste solo per compatibilità di tipo/legacy.
- La copia locale vive in tre posti:
  1. `secretCache` (Map in memoria, per sessione corrente),
  2. `localStorage["linda_group_secret_<miaPub>_<groupId>"]`,
  3. **escrow cifrato** nel proprio spazio utente `linda_room_keys/<groupId>`, cifrato con la propria coppia di chiavi (`db.crypto.encrypt(secret, pair, zen)`), così sopravvive alla cancellazione dei dati del browser o a un nuovo device (basta rifare login con lo stesso seed).
- Una chiave è accettata solo se decodifica come base64 di un buffer di 16/24/32 byte; qualunque altro valore viene rifiutato invece di essere messo in cache, per non "avvelenare" gli invii successivi.

### 3.2 Ruoli e matrice permessi

Ogni membro ha un ruolo salvato su `linda_rooms/<groupId>/members/<pub>/role`: `"peer"`, `"moderator"` o `"administrator"`. Il controllo passa sempre da `GroupService.canPerform(groupId, action)`, che risolve così:

1. Se l'azione è `send_message`, controlla prima se il chiamante è silenziato (`mutes/<pub>`) — se sì, nega a prescindere dal ruolo.
2. Se il gruppo è di tipo `broadcast`, solo `moderator`/`administrator` possono `send_message`; i `peer` restano in sola lettura/reazione.
3. Se il chiamante **non ha un ruolo memorizzato** ma è `meta.adminPub` (creatore), viene trattato come amministratore. Se sta solo tentando `invite_peer` su un gruppo esistente, l'azione è comunque permessa (serve per l'auto-invito usato da `joinPublicGroup`). Su gruppi non-broadcast senza ruolo registrato, un set minimo di azioni "da peer" (`send_message`, `start_call`, `delete_own_message`, `report`) resta comunque concesso.
4. Altrimenti si consulta la matrice fissa:

| Azione | peer | moderator | administrator |
| :--- | :---: | :---: | :---: |
| `send_message`, `start_call`, `delete_own_message`, `invite_peer`, `report`, `react_message`, `mark_read` | ✅ | ✅ | ✅ |
| `update_meta`, `pin_message`, `delete_any_message`, `mute_peer`, `invite_moderator`, `action_reports`, `kick_user` | ❌ | ✅ | ✅ |
| `promote_moderator`, `invite_admin`, `promote_admin_manual` | ❌ | ❌ | ✅ |

Regole aggiuntive fuori dalla tabella:

- **Auto-declassamento**: un admin può abbassare il proprio ruolo, ma non se è l'ultimo amministratore rimasto (`updateMemberRole` conta gli admin attivi prima di permetterlo).
- **Nessuna auto-promozione ad admin**: un membro non può promuovere se stesso ad `administrator`.
- **Promozione ad admin di terzi** richiede `promote_admin_manual`, concessa solo tramite un invito specifico (vedi 3.3), non tramite `updateMemberRole` diretto su un membro esistente qualunque sia il chiamante.

### 3.3 Inviti

`generateInvite(groupId, role, singleUse)` richiede il permesso corrispondente (`invite_peer`/`invite_moderator`/`invite_admin`) e produce un token Base64 con questa forma:

```json
{ "g": "<groupId>", "s": "", "r": "<peer|moderator|administrator>", "t": <scadenza_ms>, "u": <single_use>, "id": "<inviteId>" }
```

- Il segreto **non viaggia più nel link** (`s` è vuoto negli inviti nuovi; solo gli inviti legacy lo portavano in chiaro nel token, e `joinGroup` lo accetta ancora per compatibilità).
- Scadenza: 1 ora per inviti da amministratore, 24 ore per gli altri. Gli inviti da amministratore sono **sempre single-use** e vengono registrati in `active_invites/<inviteId>` per essere tracciabili/revocabili.
- Limite gruppo: 50 membri, applicato sia in creazione invito sia in join.
- Chi accetta un invito (`joinGroup`) scrive il proprio nodo membro col ruolo indicato nel token — quindi il livello di fiducia del link **è** il permesso concesso.

### 3.4 Rotazione chiave, epoche e forward secrecy

Ogni rimozione di un membro (kick o leave) e ogni evento equivalente ruota la chiave di gruppo (`rotateGroupKey`):

1. Genera una nuova chiave AES-256 e incrementa `keyEpoch`.
2. Per ogni membro rimanente (escluso l'eventuale membro in uscita), deriva un segreto ECDH (`zenCrypto.secret(memberPub, myPair)`), cifra la nuova chiave con quel segreto e la scrive in un nodo **per-membro**: `linda_rooms/<groupId>/keys/<epoch>/<memberPub>`. Chi viene espulso semplicemente non riceve alcun drop per quell'epoca.
3. In parallelo, per i membri online, la nuova chiave viene anche spinta via messaggio diretto (`GROUP_KEY_ROTATION` su `CommunicationService`) per applicazione istantanea.
4. `meta.keyEpoch` viene aggiornato per ultimo, dopo che i drop sono scritti: un client che vede l'epoca salita sa già dove trovare la chiave corrispondente.
5. Un membro tornato online dopo una rotazione la recupera con `pullRotatedKey`, che legge il proprio drop cifrato e lo decifra con lo stesso ECDH.
6. `getAllLocalSecrets` mantiene uno storico locale (`linda_group_keys_<miaPub>_<groupId>`) di **tutte** le chiavi mai possedute: l'id del nodo-stanza è derivato dal segreto stesso (`CommunicationService.getRoomPair`), quindi ogni epoca vive in un nodo diverso del grafo e perdere una vecchia chiave significa perdere l'accesso a quel segmento di storico, non solo la capacità di decifrare messaggi nuovi.
7. In decifratura (`decryptGroupMessage`) si prova ogni chiave nota, dalla più recente, perché i messaggi non portano un tag di epoca (aggiungerlo romperebbe la lettura dei messaggi già scritti dai client più vecchi).

**Cosa significa per la sicurezza**: un membro espulso può ancora leggere il nodo grafico del gruppo (è pubblico), ma senza la chiave ruotata non decifra nulla di nuovo. Al contrario, i messaggi già ricevuti **prima** dell'espulsione restano leggibili per lui: la rotazione revoca l'accesso futuro, non retroattivo. Un kick che non riesce a ruotare la chiave fallisce esplicitamente (non lascia mai la vecchia chiave valida "per errore"); un leave che non riesce a ruotare va comunque a buon fine (altrimenti un errore di rete intrappolerebbe l'utente nel gruppo).

### 3.5 Firma e Cifratura dei Messaggi

- **Cifratura**: `encryptGroupMessage` firma il testo con la coppia secp256k1 del mittente (`zenCrypto.sign`), poi cifra la busta firmata con la chiave simmetrica corrente del gruppo (`zenCrypto.encrypt`).
- **Decifratura**: `decryptGroupMessage` decifra con la prima chiave (tra tutte le epoche possedute) che produce un risultato valido, poi verifica la firma del mittente (`zenCrypto.verify`) per garantire autenticità e non ripudio.

### 3.6 Altre azioni gated da permessi

Ogni operazione di gruppo passa da `canPerform` prima di scrivere sul grafo:

| Operazione | Permesso richiesto | Note |
| :--- | :--- | :--- |
| `muteMember` | `mute_peer` | Silenzia un membro (`mutes/<pub>`); blocca solo `send_message`. |
| `updateGroupMeta` | `update_meta` | Nome, descrizione, avatar. |
| `pinMessage` | `pin_message` | — |
| `deleteMessage` (propri msg) | `delete_own_message` | — |
| `deleteMessage` (altrui) | `delete_any_message` | — |
| `editMessage` | solo il mittente originale + `send_message` | Nessun override da moderatore, a differenza della cancellazione. |
| `reactToMessage` | `react_message` | Un solo reagente per messaggio; stesso emoji due volte lo rimuove. |
| `markMessageRead` | `mark_read` | Una leaf per coppia (messaggio, lettore). |
| `reportContent` / `reportUser` | `report` | Chiunque può segnalare. |
| `getReports` / `resolveReport` | `action_reports` | Solo moderatori/admin vedono e chiudono le segnalazioni. |
| `kickMember` | `kick_user` | Rimuove il membro **e** ruota la chiave (3.4). |

### 3.7 Gruppi pubblici e canali broadcast

- `setGroupPublic(groupId, isPublic, publicName)` pubblica un indice `linda_public_index/<publicName> → groupId`. `joinPublicGroup` risolve il nome pubblico e si auto-genera un invito da `peer` per unirsi, senza bisogno di un link condiviso manualmente.
- Il `type` del gruppo (`"group"` o `"broadcast"`) governa solo chi può scrivere messaggi (vedi 3.2, punto 2); il resto della meccanica (ruoli, rotazione, escrow) è identica.

### 3.8 Chat P2P come "gruppo virtuale"

Le chat 1:1 condividono lo stesso codice di `GroupService` sotto l'id `p2p_<pubMin>_<pubMax>`: `getOrCreateP2PGroup` crea al volo un `meta` virtuale senza segreto simmetrico (usa direttamente l'ECDH descritto nella sezione 2) e un nodo membro per il contatto con ruolo `peer`. `mirrorToCertifiedRoom` instrada pin/cancellazioni/reazioni verso l'inbox certificata del peer invece che verso un nodo di stanza condiviso, perché un p2p non ha un "proprietario" della room su cui basare un certificato.

---

## 4. Permessi su Zen (chi può scrivere cosa)

La crittografia protegge la *confidenzialità*; l'autorizzazione a scrivere un nodo del grafo è un meccanismo **separato**, nativo di Zen, sotto i ruoli applicativi descritti sopra.

### 4.1 Policy tail: i 4 modi di autorizzazione di Zen

Ogni "soul" (id di un nodo del grafo) porta in coda un byte di **policy tail** che Zen verifica ad ogni scrittura, indipendentemente da qualsiasi validazione applicativa:

| Modo | Byte | Richiede | Uso in Linda |
| :--- | :---: | :--- | :--- |
| **NOA** (open) | `0xC3` | Niente | Inbox pubblica di primo contatto (`linda_v3_inbox_<pub>`), indici come `linda_unique_usernames`. |
| **SGN** (sign) | `0xC0` | Firma ECDSA di chi scrive, verificata contro la chiave pubblica nel path | Spazio utente `~<pub>/...` (profilo, bundle, escrow chiavi di gruppo). |
| **CRT** (certificate) | `0xC1` | Un certificato firmato dal proprietario del path, incorporato nella policy | Inbox certificata (`~<pub>/linda_inbox_v13`), stanze di gruppo certificate. |
| **PoW** (proof-of-work) | `0xC4` | Un hash con difficoltà minima | Non usato attivamente da Linda oggi, ma disponibile in Zen per anti-spam. |

Punto chiave: la policy tail è **immutabile**, cotta dentro il soul stesso. Cambiare modo di autorizzazione per un path significa crearne uno nuovo, non "aggiornare i permessi" di quello esistente.

### 4.2 Ciclo di vita dei certificati in Linda (`CommunicationService`)

- **Niente certificati wildcard (`*`)**: disabilitati esplicitamente per sicurezza. Ogni certificato emesso da Linda è scoped a un path preciso, così un certificato trapelato autorizza un solo scrittore su un solo path, mai un accesso generico allo spazio utente.
- **Emissione** (`issueCertificate(peerPub)`): quando accetti un contatto, firmi con `zenCrypto.certify` un certificato che autorizza quel `peerPub` a scrivere nella tua inbox certificata, e lo pubblichi su `~<tuaPub>/certs/<peerPub>`.
- **Scoperta lato mittente** (`getInboxCertificate`): per scrivere nell'inbox di un peer, il client prova in cascata tre percorsi — (1) certificato specifico emesso per lui in `certs/<miaPub>`, (2) certificato pubblico `inbox_cert_v13`, (3) certificato legacy in `linda_bundle_v8/inbox_cert` — validando ogni candidato con `zenCrypto.verify` e controllando che la policy copra davvero il path dell'inbox prima di fidarsene. Se nessun certificato valido esiste (tipico primo contatto tra sconosciuti), il client scrive comunque sull'inbox pubblica NOA come fallback.
- **Revoca** (`revokeCertificate`): scrive **due** cose, non una — `null` su `certs/<peer>` (blocca nuove scoperte) e una entry di blocklist (`~<miaPub>/BLOCKLIST_PATH/<peer>`) che la pipeline di sicurezza di Zen controlla ad ogni scrittura, su ogni client conforme. Solo cancellare `certs/<peer>` fermerebbe le nuove ricerche del certificato ma non invaliderebbe una copia che il peer ha già in mano; la voce di blocklist sì. Riattivare il flag a `false` riautorizza lo stesso certificato all'istante, senza doverne emettere uno nuovo.
- **Scritture di stanza certificate** (`certifiedRoomWrite`, usata da `GroupService.mirrorToCertifiedRoom`): il certificato è derivato dalla *room pair*, a sua volta derivata dal segreto di gruppo (`CommunicationService.getRoomPair`). Chi non conosce il segreto del gruppo non può derivare la room pair e quindi non può nemmeno **chiedere** un certificato valido per quella stanza — l'autorizzazione a scrivere metadati di stanza (pin, cancellazioni, reazioni, ricevute di lettura) è quindi condizionata al possesso della chiave di cifratura, non solo alla lista membri.

### 4.3 Due livelli di permesso, non uno

Vale la pena tenerli distinti:

1. **Permessi applicativi** (sezione 3.2): decidono se un'azione è *legittima* secondo le regole del gruppo (chi può kickare, mutare, promuovere...). Sono verificati dal client prima di scrivere e possono essere aggirati da un client modificato.
2. **Permessi Zen** (questa sezione): decidono se una *scrittura sul grafo* viene accettata dai relay/peer, indipendentemente da cosa dice il client che l'ha generata. Un client modificato che ignora `canPerform` produrrebbe comunque scritture che i relay accettano, se il modo di autorizzazione del path lo consente (es. firma valida). La vera barriera contro un client "disonesto" in un gruppo è quindi la chiave di cifratura (senza chiave, il messaggio è illeggibile) più la rotazione all'espulsione — non la matrice di ruoli, che è un controllo di UX/policy applicativa, non un controllo crittografico.

---

## 5. Trasferimento Dati e Chiamate

| Modulo | Descrizione |
| :--- | :--- |
| **`CallingService`** | Segnalazione WebRTC su stanze Zen per chiamate audio/video P2P. |
| **`FileTransferService`** | Trasferimento file P2P diretto a blocchi cifrati su WebRTC DataChannels. |
| **`WormholeService`** | Trasferimento file asincrono cifrato tramite relay temporanei Wormhole. |

---

## 6. Nodi Relay Ciechi (Blind Relays)

I server di relay non conoscono le chiavi private e non partecipano ad alcuna operazione di cifratura o decifratura:
- Sincronizzano il grafo cifrato in modalità P2P.
- Verificano l'autenticità delle firme dei nodi.
- Utilizzano certificati Zen dedicati per permettere la scrittura cifrata nelle inbox dei destinatari.

---

## 📚 Riferimenti

- [Documentazione Architetturale Completa (`docs/ARCHITECTURE.md`)](./docs/ARCHITECTURE.md)
- [Libreria Core `linda-core`](https://github.com/scobru/linda-core)
- [Design System (`DESIGN.md`)](./DESIGN.md)
