# Guida Completa all'Architettura di Linda Pear

Questo documento spiega in modo chiaro, semplice e strutturato come funziona **Linda Pear**, qual è la sua architettura interna, cosa fa ciascun file del progetto e dove trovare le varie funzionalità.

---

## 1. Cos'è Linda Pear (in parole semplici)

**Linda Pear** è un'applicazione di messaggistica e condivisione file **100% Peer-to-Peer (P2P)**, crittografata e **senza alcun server centrale (serverless)**.

A differenza delle app tradizionali (come WhatsApp, Telegram o Signal) o di altre app P2P che usano server di appoggio per inoltrare i messaggi (relay / TURN):
- **Nessun server centrale**: non esiste un database centrale, nessun cloud, nessun login con email o numero di telefono.
- **Nessun relay**: i dati viaggiano esclusivamente da dispositivo a dispositivo (peer-to-peer diretto).
- **Crittografia end-to-end e sovrana**: l'identità dell'utente è una coppia di chiavi crittografiche (derivate da una frase segreta mnemonica di 12 parole).
- **Stack Holepunch**: utilizza le tecnologie open-source create dal team di Holepunch/Keet (*Hypercore*, *Corestore*, *Autobase*, *Hyperbee*, *Hyperswarm*, *Hyperdrive*).

---

## 2. I Pilastri Tecnologici (Lo Stack Holepunch)

Per capire il codice, basta comprendere 6 mattoncini fondamentali:

```
+-------------------------------------------------------------------------+
|                               INTERFACCIA                               |
|  Desktop: Electron + Web Components (src/ui/app-shell.ts)               |
|  Mobile:  React Native / Expo + Bare-Kit Worklet (mobile/)              |
+-------------------------------------------------------------------------+
|                          COORDINATORE (SESSION)                         |
|  Gestione stato globale, profili, segnalibri, contatti, canali RPC      |
+------------------------------------+------------------------------------+
|               DATI                 |                RETE                |
|  • Autobase: log ordinato stanze   |  • Hyperswarm: DHT & Holepunching  |
|  • Hyperbee: database chiave/valore|  • Protomux / RPC: typing, ack,    |
|  • Hyperdrive: file & media stream |    richieste scrittura, contatti   |
|  • Corestore: gestore Hypercore    |                                    |
+------------------------------------+------------------------------------+
|                         SICUREZZA & IDENTITÀ                            |
|  • Libsodium / Argon2id: salvataggio locale protetto da passphrase     |
|  • BIP39: 12 parole per backup / recupero account                       |
|  • Epoch Keys: crittografia a rotazione per i messaggi di stanza       |
+-------------------------------------------------------------------------+
```

1. **Hypercore**: un registro (log) a cui si possono solo aggiungere dati in coda (append-only), crittograficamente firmato.
2. **Corestore**: un raccoglitore/gestore che organizza tanti Hypercore sotto diversi nomi/namespace.
3. **Autobase**: coordina più utenti in una stanza. Ciascun membro scrive sul proprio Hypercore; Autobase ordina linearmente tutti i messaggi per creare una cronologia unica e coerente per tutti i partecipanti.
4. **Hyperbee**: un database chiave-valore (simile a un mini-database NoSQL B-Tree) costruito sopra Hypercore o Autobase. Serve per salvare lo stato della stanza, i messaggi, le reazioni, i contatti e i profili.
5. **Hyperswarm & DHT**: la rete distribuita che permette a due nodi di trovarsi su Internet tramite un "topic" (un hash di 32 byte) e aprire una connessione diretta (holepunching NAT), senza passare per server intermedi.
6. **Hyperdrive**: un file-system distribuito P2P. Quando invii un file, questo viene scritto nel tuo drive locale e gli altri membri lo scaricano a blocchi direttamente da te (e chi lo scarica diventa a sua volta seeder).

---

## 3. Mappa dei File e Responsabilità

### 📁 Root del Progetto
- [package.json](file:///c:/Users/dev/source/repos/linda-pear/package.json): Configurazione dipendenze, script di avvio (`npm run start`, `start:a`, `start:b`), test, packaging Pear ed Electron.
- [build.js](file:///c:/Users/dev/source/repos/linda-pear/build.js): Script di compilazione con *esbuild*. Impacchetta il codice TypeScript di `src/` in `dist/app.js` e genera automaticamente `src/version.ts`.
- [index.html](file:///c:/Users/dev/source/repos/linda-pear/index.html): Entry point HTML per la versione Desktop (Electron).
- [style.css](file:///c:/Users/dev/source/repos/linda-pear/style.css): Foglio di stile CSS completo dell'interfaccia desktop (temi, layout, bolle chat, modali).
- [test.js](file:///c:/Users/dev/source/repos/linda-pear/test.js): Runner dei test di integrazione basato sul test runner nativo di Node.js.

---

### 📁 `src/` (Il Cuore Condiviso)

Il codice in `src/` contiene tutta la logica di business pura, indipendente dalla piattaforma, ed è condiviso sia da Electron che da React Native.

#### 🔐 `src/identity/` (Gestione Identità e Chiavi)
- [index.ts](file:///c:/Users/dev/source/repos/linda-pear/src/identity/index.ts): Punto di ingresso per creare, sbloccare, recuperare e associare l'identità.
- [keypair.ts](file:///c:/Users/dev/source/repos/linda-pear/src/identity/keypair.ts): Generazione della coppia di chiavi crittografiche (pubblica/privata Ed25519) usando `hypercore-crypto`.
- [mnemonic.ts](file:///c:/Users/dev/source/repos/linda-pear/src/identity/mnemonic.ts): Gestione della frase di recupero a 12 parole (standard BIP39). Converte le 12 parole nel seed delle chiavi.
- [storage.ts](file:///c:/Users/dev/source/repos/linda-pear/src/identity/storage.ts): Salvataggio sicuro su disco di `identity.json`. La chiave privata viene cifrata con algoritmo **Argon2id** (`crypto_pwhash`) + `crypto_secretbox` protetta dalla password dell'utente.
- [pairing.ts](file:///c:/Users/dev/source/repos/linda-pear/src/identity/pairing.ts): Accoppiamento tra dispositivi via QR Code. Un dispositivo già sbloccato apre un canale temporaneo su Hyperswarm; il nuovo dispositivo scansiona il codice ed eredita l'identità in modo sicuro e cifrato.
- [profile.ts](file:///c:/Users/dev/source/repos/linda-pear/src/identity/profile.ts): Gestione del profilo base (nickname, avatar).

---

#### 🌐 `src/network/` (Networking P2P e Comunicazione in Tempo Reale)
- [swarm.ts](file:///c:/Users/dev/source/repos/linda-pear/src/network/swarm.ts): Configura e avvia **Hyperswarm**. Gestisce le connessioni in entrata/uscita e il bootstrap della DHT.
- [rpc.ts](file:///c:/Users/dev/source/repos/linda-pear/src/network/rpc.ts): Protocollo RPC (`linda-rpc/1`) basato su **Protomux**. Gestisce i messaggi istantanei che non devono essere salvati nello storico (es. "sta scrivendo...", presenza online/offline, ricevute di lettura, richieste di scrittura per entrare in una stanza, annunci stanze pubbliche e scambio chiavi di crittografia).
- [encoding.ts](file:///c:/Users/dev/source/repos/linda-pear/src/network/encoding.ts): Serializzazione binaria compatta (`compact-encoding`) per tutti i messaggi RPC scambiati via socket.
- [lobby.ts](file:///c:/Users/dev/source/repos/linda-pear/src/network/lobby.ts): Topic globale ("lobby") su cui i nodi possono opzionalmente annunciare stanze pubbliche per la scoperta automatica.

---

#### 💬 `src/rooms/` (Gestione Stanze, Messaggi e Permessi)
- [room.ts](file:///c:/Users/dev/source/repos/linda-pear/src/rooms/room.ts): **Uno dei file più importanti dell'applicazione.**
  - Gestisce la stanza basata su **Autobase** e indicizzata con **Hyperbee**.
  - **Funzione `apply()`**: elabora e valida linearmente tutti gli eventi della stanza (invio messaggi, modifiche, cancellazioni, reazioni emoji, aggiunta scrittori, permessi moderatore/mute/ban, modalità broadcast).
  - **Crittografia dei messaggi**: supporta la rotazione delle chiavi (*Epoch Keys*) per proteggere i messaggi scambiati nella stanza.
  - **Reazioni & Modifiche**: registra gli "overlay" sui messaggi senza rompere l'immutabilità del registro originale.

---

#### 📁 `src/files/` (Condivisione File e Streaming Audio/Video)
- [drive.ts](file:///c:/Users/dev/source/repos/linda-pear/src/files/drive.ts): `FileStore` integrato con **Hyperdrive**. Scrive i file sul proprio drive locale per la condivisione P2P.
- [media-range.ts](file:///c:/Users/dev/source/repos/linda-pear/src/files/media-range.ts): Gestisce le intestazioni HTTP `Range` (es. `bytes=0-1048576`) per consentire la riproduzione istantanea di audio e video con seek temporale.
- [media-server.ts](file:///c:/Users/dev/source/repos/linda-pear/src/files/media-server.ts): Logica agnostica del mini web-server locale protetto da token segreto di sessione (`/<token>/<driveKey>/<filePath>`).
- [media-server-node.ts](file:///c:/Users/dev/source/repos/linda-pear/src/files/media-server-node.ts): Implementazione del server HTTP per ambiente Node/Electron su porta loopback locale (`127.0.0.1`).

---

#### 🧠 `src/app/` (Orchestrazione e Stato Utente)
- [session.ts](file:///c:/Users/dev/source/repos/linda-pear/src/app/session.ts): **Il regista principale dell'applicazione.**
  - Collega identità, rete (`Hyperswarm`), stanze (`Room`), storage file (`Hyperdrive`), profilo e rubrica contatti.
  - Gestisce il ciclo di vita: sblocco, apertura stanze, join tramite link di invito, autorizzazione di nuovi membri, invio messaggi e allegati, download file remoti.
- [profile-store.ts](file:///c:/Users/dev/source/repos/linda-pear/src/app/profile-store.ts): Gestione persistente su **Hyperbee** di:
  - Segnalibri delle stanze salvate (`bookmarks`).
  - Lista contatti e richieste pendenti (`contacts`).
  - Chiavi di crittografia delle stanze (`room_keys`).
  - Token di invito (`room_invites`).
  - Avatar personalizzati dei contatti (`peer_avatars`).
  - Preferenze locali (sfondo chat, nickname).

---

#### 🖥️ `src/ui/` (Interfaccia Desktop)
- [app-shell.ts](file:///c:/Users/dev/source/repos/linda-pear/src/ui/app-shell.ts): Il Web Component principale `<app-shell>` che renderizza l'intera interfaccia desktop: schermata di sblocco/creazione account, lista stanze, area chat, invio messaggi vocali e file, modali di invito, gestione membri e impostazioni.
- [qr.ts](file:///c:/Users/dev/source/repos/linda-pear/src/ui/qr.ts) e [qr-core.ts](file:///c:/Users/dev/source/repos/linda-pear/src/ui/qr-core.ts): Generazione e scansione dei QR code (per inviti stanze e pairing dispositivi).
- [wallpapers.ts](file:///c:/Users/dev/source/repos/linda-pear/src/ui/wallpapers.ts): Sfondi chat personalizzabili (gradienti e motivi geometrici).

---

#### 🛠️ `src/util/` (Utility Generali)
- [avatar.ts](file:///c:/Users/dev/source/repos/linda-pear/src/util/avatar.ts): Generazione automatica di avatar colorati basati sull'hash della chiave pubblica.
- [bytes.ts](file:///c:/Users/dev/source/repos/linda-pear/src/util/bytes.ts): Formattazione della dimensione dei file (es. `KB`, `MB`, `GB`).
- [hashtag.ts](file:///c:/Users/dev/source/repos/linda-pear/src/util/hashtag.ts): Riconoscimento ed evidenziazione dei tag e menzioni nei messaggi.
- [id.ts](file:///c:/Users/dev/source/repos/linda-pear/src/util/id.ts): Generatore di identificativi casuali sicuri esadecimali.

---

### 🖥️ `electron/` (Involucro Desktop)
- [main.cjs](file:///c:/Users/dev/source/repos/linda-pear/electron/main.cjs): Processo principale di Electron. Crea la finestra, configura i permessi di sicurezza (microfono per messaggi vocali, cattura schermo, clipboard) e carica `index.html`.
- [preload.cjs](file:///c:/Users/dev/source/repos/linda-pear/electron/preload.cjs): Script di preload leggero per esporre funzionalità di sistema (es. scrittura appunti).

---

### 📱 `mobile/` (Applicazione Mobile Expo / React Native)
- [App.tsx](file:///c:/Users/dev/source/repos/linda-pear/mobile/App.tsx): Entry point React Native con provider del tema e navigazione.
- [mobile/worklet/entry.ts](file:///c:/Users/dev/source/repos/linda-pear/mobile/worklet/entry.ts): Il **cuore P2P mobile**. Esegue l'intero core di `src/` dentro un processo di background nativo (*Bare Kit Worklet*), comunicando con la UI tramite messaggi IPC asincroni serializzati.
- [mobile/worklet/media-server.ts](file:///c:/Users/dev/source/repos/linda-pear/mobile/worklet/media-server.ts): Server multimediale per lo streaming su mobile basato su `bare-http1`.
- `mobile/src/bare/`: Proxy client e bridge di comunicazione tra l'interfaccia React Native e il worklet Bare.
- `mobile/src/screens/`: Tutte le schermate mobile (Chat, Lista Stanze, Contatti, Profilo, Membri, Pairing QR, Sblocco).
- `mobile/src/components/`: Componenti riutilizzabili (Bolle chat, Player Video/Audio, Avatar, Modali).

---

### 🧪 `test/` (Suite di Test Automatizzati)
- [session.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/session.test.ts): Test end-to-end con due nodi `Session` reali che si connettono, scambiano permessi di scrittura e replicano dati su una rete DHT locale di test.
- [room.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/room.test.ts): Test approfonditi su Autobase: ordinamento messaggi, modifiche, reazioni, ban, mute e ruoli.
- [security.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/security.test.ts): Test di sicurezza e resistenza alle manomissioni (messaggi non autorizzati, tentativi di spoofing).
- [media-stream.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/media-stream.test.ts) e [media-range.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/media-range.test.ts): Test per lo streaming a blocchi (Range request) di file multimediali.
- [room-files.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/room-files.test.ts): Test sulla condivisione e indicizzazione dei file nelle stanze.
- [contact-invite.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/contact-invite.test.ts): Test per il flusso di invito contatti e apertura chat 1-a-1.
- [rejoin-restart.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/rejoin-restart.test.ts): Test di persistenza e riapertura stanze dopo riavvio del processo.

---

## 4. Come Funzionano i Flussi Chiave

### A. Creazione e Sblocco Identità
1. All'avvio, `storage.ts` controlla se esiste `identity.json`.
2. Se non esiste: `mnemonic.ts` genera 12 parole casuali; da queste si ricava la coppia di chiavi. L'utente sceglie una password locale, che cifra la chiave segreta tramite Argon2id.
3. Se esiste: l'utente inserisce la password, `storage.ts` decifra la chiave privata e inizializza `Session`.

### B. Invio di un Messaggio in una Stanza
1. L'utente digita il testo e preme Invio.
2. `Session` invoca `room.postMessage()`.
3. Il messaggio viene cifrato con la chiave segreta della stanza corrente (*Epoch Key*).
4. Viene appeso al log locale Hypercore della stanza tramite **Autobase**.
5. Autobase propaga automaticamente il nuovo blocco attraverso la connessione **Hyperswarm** a tutti i peer connessi.
6. Ciascun peer esegue la funzione deterministica `apply()`, valida l'autore, decifra il testo e aggiorna la vista messaggi in tempo reale.

### C. Condivisione e Streaming di un Video o Canzone
1. L'utente seleziona un file video da inviare.
2. `FileStore` (`drive.ts`) aggiunge il file nel proprio **Hyperdrive** locale.
3. Viene inviato un messaggio di chat contenente i metadati (`driveKey`, percorso, nome, dimensione, tipo MIME).
4. L'evento compare sia nella chat sia nella scheda **File della Stanza** (`RoomFiles`).
5. Quando un altro peer clicca "Play", il player multimediale locale contatta il server HTTP interno (`media-server.ts`) richiedendo i byte necessari (`Range: bytes=0-...`).
6. Il server legge solo i blocchi richiesti dal drive remoto tramite la connessione P2P esistente, permettendo la riproduzione immediata senza dover scaricare l'intero file in anticipo.
