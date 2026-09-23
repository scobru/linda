# CONTEXT.md — Linda Architecture & Domain Vocabulary

Questo documento definisce il vocabolario di dominio e i confini architetturali del progetto Linda.
Tutti i moduli e le interfacce devono aderire a questi termini e alle loro invarianti.

---

## 1. Domain Entities & Vocabulary

### `CallOverlay`
- **Definizione:** Modulo profondo di presentazione che governa il ciclo di vita UI e multimediale delle chiamate 1:1 su desktop.
- **Responsabilità:**
  - Montaggio e gestione in-place degli elementi DOM (`#incomingCallOverlay`, `#callActiveWidget`, tag `<video>` locale e canvas `<canvas>` remoto).
  - Gestione autonoma della sintesi audio per gli squilli (`AudioContext` del browser, frequenze 880Hz/440Hz).
  - Cronometro della durata della chiamata (`callDurationSec`).
  - Incapsulamento della `MediaPipeline` (cattura mic/camera, muting locale e inoltro dei frame).
- **Invariante:** L'interfaccia verso `AppShell` è minimale (`mount`, `setSession`, `setPeerLookup`, `startCall`, handlers eventi). Le chiamate e i flussi video sopravvivono ai re-render globali dell'applicazione.

### `MediaPipeline`
- **Definizione:** Modulo responsabile dell'acquisizione hardware (microfono e webcam), dell'elaborazione/compressione dei fotogrammi e della riproduzione audio/video.
- **Responsabilità:**
  - `getUserMedia` con graceful fallback (da video+audio ad audio-only se la videocamera è assente o negata).
  - Campionamento video a 15fps con rendering su canvas offscreen e compressione JPEG (`image/jpeg`, quality 0.55).
  - Stream audio PCM tramite `AudioContext` o WebRTC audio track.
  - Test e richiesta diagnostica permessi hardware su Electron/macOS/Windows.

### `CallMedia` (mobile)
- **Definizione:** Il media di una chiamata sul telefono, in [call-media.ts](mobile/src/call/call-media.ts): cosa si cattura, cosa si riproduce, e quando ciascuna cosa parte e si ferma. È la controparte mobile di `MediaPipeline`.
- **Interfaccia:** Dichiarativa. `update({ connected, muted, video, cameraOn })` a ogni cambio di stato, e il module decide da solo cosa avviare e cosa fermare; `attachCamera(port | null)` quando la camera è pronta o non lo è più; `dispose()`. Restituisce solo il frame video remoto da mostrare (`onRemoteVideo`).
- **Adapter:** Il microfono e l'altoparlante sono il modulo nativo `CallAudio` (`nativeCallAudio` in [call-audio.ts](mobile/src/call-audio.ts), sopra `AudioRecord`/`AudioTrack`), i frame passano al worklet come `WireMediaFrame`, e la camera appartiene a una view, quindi entra come `CameraPort` ("scatta una foto → base64").
- **Invariante:** `connected` resta vero durante `reconnecting`: il media non si smonta per un buco che il core sta coprendo. Una chiamata che finisce mentre la richiesta del microfono è aperta non avvia mai la cattura, e nessun frame video parte prima che la camera sia stata consegnata (un frame preso prima che la camera abbia fissato la risoluzione è a piena risoluzione del sensore). Prima questa logica stava in cinque effect di `ActiveCallModal`, ciascuno con le sue dipendenze, e le corse tra di loro erano dove stavano i bug.

### `CallSession`, `CallDesk` & `CallRpc`
- **Definizione:** Moduli del Core P2P che implementano il protocollo di segnalazione e la macchina a stati della chiamata (`idle` -> `calling` / `ringing` -> `connected` -> `ended`).
- **Canale:** Canale dedicato Protomux `linda-call/1` multiplexato sulle connessioni Hyperswarm crittografate con Noise.
- **Messaggi:** `call_offer`, `call_answer`, `call_end`, `call_control` (mute/unmute/camera-off/camera-on), `call_frame` (payload multimediale binario).
- **`CallSession`:** *Una* chiamata. Non sa nulla delle altre.
- **`CallDesk`:** L'unico posto-chiamata del dispositivo, in [call-desk.ts](src/call/call-desk.ts). Tiene le regole che stanno *attorno* a una chiamata: una alla volta, un `busy` invece del silenzio a chi chiama mentre sei occupato (e sul canale di chi chiama, non su quello della chiamata in corso), un messaggio vale per la chiamata che nomina o per nessuna, e il posto si libera quando la chiamata finisce. Erano otto ripetizioni di due condizioni dentro `Session`, raggiungibili solo con uno swarm vivo e due peer veri.
- **Riconnessione:** Una chiamata connessa non muore col suo socket. Quando la connessione al peer si chiude, `CallSession` la tiene in piedi per `RECONNECT_GRACE_MS` (`CallInfo.reconnecting`, lo stato resta `connected` perché le shell smontano i media per qualsiasi altro stato) e `CallDesk.peerBack` la sposta sulla connessione successiva dello stesso peer, dove resta in attesa finché il peer non si fa risentire (un controllo o un frame: chi si riaggancia ripete sempre il proprio stato, quindi un peer che ha ancora la chiamata risponde subito, mentre uno riavviato o di una build precedente non lo fa e la chiamata termina allo scadere del margine); nel frattempo `Session` chiede allo swarm di comporre direttamente quel peer (`joinPeer`). Una chiamata che finisce mentre il peer non può sentirlo gli resta *dovuta*: il `call_end` parte sulla sua prossima connessione, altrimenti il peer si riaggancerebbe a una chiamata che qui non esiste più. Il resync di rete al ritorno in primo piano (`resumeNetwork('foreground')`) salta finché c'è una chiamata, perché `swarm.suspend()` chiude ogni connessione, quella della chiamata compresa.
- **`applyRemoteControl`:** Il riduttore delle azioni remote, una volta sola: lo usano la macchina a stati e le due shell, ognuna delle quali tiene la propria copia di `CallInfo` da aggiornare. Un'azione sconosciuta non cambia nulla.
- **`WireMediaFrame`:** L'unico valore che cambia forma attraversando il ponte mobile: il core parla `MediaFrameMessage` con byte grezzi, il telefono parla base64 (la fotocamera e l'AudioRecord lo scambiano già così). La traduzione sta in [media-frame.ts](mobile/src/bare/media-frame.ts), dichiarata nel contratto invece che nascosta in un cast, insieme a `PLAYABLE_FRAME_KINDS` — i tipi di frame che il telefono sa gestire (video JPEG e audio PCM16 a 16 kHz). L'audio viaggia bidirezionalmente tramite il modulo nativo Android (`CallAudioModule` con `AudioRecord` e `AudioTrack`), pilotato da `CallMedia`.
- **Invariante degli eventi:** Il worklet mobile e l'app si parlano per nome (`pushEvent` / `bareClient.on`), quindi un ascoltatore senza produttore è muto e nessuno se ne accorge — è così che `callEnded` e `callRemoteControl` sono rimasti scollegati. Un test enumera i due insiemi.

### `Session` & `SessionView`
- **Definizione:** Il punto d'accesso unificato all'istanza Linda del peer locale.
- **Tri-runtime:**
  - In Electron: istanza diretta di `Session` in-process.
  - In Pear Desktop: proxy IPC asincrono verso un Bare worker dedicato.
  - In Mobile: proxy IPC asincrono tramite BareKit verso il worklet C++/Bare.
- **`SessionView`:** L'interfaccia/seam polimorfa comune a cui fa riferimento l'interfaccia utente (`AppShell` e `CallOverlay`).

### `Connectivity` (mobile)
- **Definizione:** Cosa fa il telefono con la propria connessione quando cambia la rete o il suo posto sullo schermo, in [connectivity.ts](mobile/src/connectivity.ts) (`watchConnectivity`). Due decisioni: quando fare il resync dello swarm e con quale causa, e quando tenere in vita il processo con il servizio di connessione in background.
- **Adapter:** AppState, NetInfo, la sessione (`resumeNetwork`) e il servizio in background (`P2pForegroundService`).
- **Invariante:** I resync entro `RESYNC_DEBOUNCE_MS` sono uno solo, ed è un `network-change` se uno di loro lo era: è la causa che il core non salta durante una chiamata (vedi *Riconnessione*). Il primo tipo di rete riportato è solo il punto di partenza. Avvio e arresto del servizio si alternano sempre, a cominciare da un avvio, e il ritorno in primo piano ferma solo ciò che era stato avviato: un arresto che scavalcava il proprio avvio chiudeva l'app (`ForegroundServiceDidNotStartInTimeException`).

### `SessionContract`
- **Stato:** Implementato per il percorso worker desktop in [session-contract.ts](src/app/session-contract.ts). Il dispatcher costruisce da lì i suoi inoltri; il proxy (`RemoteSessionView`) resta scritto a mano ma è **enumerato** dai test, che falliscono se un membro manca o se dichiara meno parametri di `Session`. Non ancora convergente: `mobile/src/bare/session-contract.ts` deriva tuttora il proprio elenco per conto suo.
- **Bucket:** Ogni membro di `Session` cade in esattamente uno dei tre — inoltrato (con il suo `Effect`), servito dal mirror, o adattato — e il compilatore lo esige.
- **Definizione:** La dichiarazione unica di cosa `Session` espone attraverso un confine di processo. Oggi la legge il worker Bare desktop; il worklet mobile è il prossimo a convergerci.
- **Responsabilità:**
  - Classificare ogni metodo di `Session` come inoltro semplice (con il suo `Effect`) oppure come `Adapted`, con il motivo esplicito.
  - `Effect` — cosa il worker ripubblica dopo la chiamata: `none`, `roomState`, `bookmarks`, `roomState+bookmarks`. Quattro famiglie, non un caso per metodo.
  - `Adapted` — i membri che un inoltro generico romperebbe: quelli che richiedono `wireRoom` sul valore di ritorno, quelli che restituiscono un `Room` vivo, binario/stream, o una `Map` che JSON appiattisce.
- **Invariante:** La chiave del `Record` è il nome del metodo, quindi un membro aggiunto a `Session` e non classificato fa fallire la build nominandolo. Il dispatcher e il proxy sono **costruiti** dal contratto, mai scritti a mano: l'inoltro generico è `(...args) => call(name, ...args)`, per cui una divergenza di arità è impossibile per i membri inoltrati e resta possibile solo per gli `Adapted` — che sono il bersaglio del test di parità.

### `Room` & `Autobase`
- **Definizione:** Struttura decentralizzata per le conversazioni di gruppo o dirette, supportata da Autobase (append-only log multi-writer con linearizzazione deterministica e risoluzione automatica dei conflitti).
- **Storage:** Corestore / Hypercore con crittografia delle chiavi e sincronizzazione su DHT Hyperswarm.

### `AttachmentKind` & `RoomRules`
- **Definizione:** Le regole sul contenuto di una stanza che entrambe le shell applicano, scritte una volta sola in [attachment-kind.ts](src/rooms/attachment-kind.ts) e [room-rules.ts](src/rooms/room-rules.ts).
- **`AttachmentKind`:** Classifica un allegato (`image` | `audio` | `video` | `archive` | `pdf` | `other`) per MIME type e, in mancanza, per estensione. Contiene anche la convenzione del nome dei messaggi vocali (`voice-<ISO>.<ext>`) insieme alla funzione che la scrive, così produttore e lettore non possono divergere.
- **`RoomRules`:** Predicati puri, una regola sola per entrambe le shell — chi può cancellare un messaggio; il conteggio e l'ordinamento degli hashtag; quale tag selezionato sopravvive a un ricalcolo; **perché il composer è chiuso** (`composerBlock`, che ordina prima ciò che è stato deciso su di te e poi ciò che è ancora in volo); **cosa è non letto** (`isRoomUnread`, e la stanza che stai leggendo non lo è); **l'oggetto e l'anteprima** di un messaggio in mailbox; **il raggruppamento per giorno** delle note; **quali stanze si vedono e in che ordine** (`orderRoomList`); **cosa dice l'anteprima** in lista (`lastMessagePreview`); **cosa cerca la ricerca** (`matchesRoomQuery`: nome, descrizione e ultimo messaggio); **la cadenza del "sta scrivendo"** (`TYPING_PING_MS` sotto `TYPING_STOP_MS`, o l'indicatore sfarfalla).
- **Invariante:** Queste funzioni prendono **primitive, mai un `Room`**. Le due piattaforme tengono una stanza in forme diverse — `RoomView` con metodi sul desktop, `RoomState` con array su mobile — e una regola che chiedesse una stanza sarebbe usabile da un lato solo. È esattamente così che erano nate le copie divergenti.

### `MessageEncoding` & `ProtocolChannel`
- **Definizione:** Le due dichiarazioni da cui il filo è derivato, invece che scritto a mano: l'elenco dei campi di un messaggio in [message-encoding.ts](src/network/message-encoding.ts), e l'elenco ordinato dei messaggi di un canale in [protocol-channel.ts](src/network/protocol-channel.ts).
- **`MessageEncoding`:** `preencode` / `encode` / `decode` costruite da un solo elenco di campi, quindi non possono divergere. `optionalString` è la regola della compatibilità all'indietro resa tipo: i campi opzionali stanno in fondo (imposto alla costruzione) e un frame più corto, spedito da un peer più vecchio, decodifica lo stesso.
- **`ProtocolChannel`:** Da `[nome, encoding]` derivano sia `sendX` sia `onX`, per entrambi i canali (`linda-rpc/1` e `linda-call/1`).
- **Invariante — l'ordine è il contratto:** Protomux assegna l'id di rete di un messaggio dalla sua posizione (`addMessage` fa `const type = this.messages.length`), esattamente come il frame porta l'ordine dei campi e non i loro nomi. In entrambi i casi si aggiunge in coda e non si riordina mai: due build che non concordano sull'ordine si decodificano a vicenda il messaggio sbagliato, in silenzio e solo tra peer.
- **`sender`:** Il campo con cui un messaggio dichiara il proprio mittente (`fromId`, `userId`). La connessione è autenticata con Noise e la chiave del peer **è** il suo identity id, quindi un mittente dichiarato che non coincide è un falso e viene scartato prima di qualsiasi handler. Non dichiararlo è un'affermazione altrettanto precisa: `roomAnnounce.authorId` è l'autore della stanza, non chi la annuncia — i peer si riannunciano a vicenda le directory.

### `Identity` & `ProfileStore`
- **Definizione:** Gestione dell'identità crittografica dell'utente (coppia di chiavi ED25519/Noise derivata da mnemonico BIP39), della rubrica dei contatti verificati e dei metadati locali (avatar, bio, bookmark stanze).

---

## 2. Architecture Principles

1. **Deep Modules Over Shallow Adapters:**
   - I moduli devono offrire molto comportamento dietro interfacce piccole.
   - Il modulo `CallOverlay` protegge l'applicazione da dettagli effimeri come oscillatori sonori, pipeline di rendering canvas ed elementi `<video>`.
2. **Deletion Test:**
   - Rimuovendo un modulo specializzato come `CallOverlay`, la complessità del suo dominio deve sparire senza lasciare residui di codice o flag sparsi nel resto dell'applicazione.
3. **Strict Seam Isolation:**
   - I componenti visivi desktop non toccano mai direttamente i canali Protomux o le strutture Hypercore: interagiscono unicamente tramite il seam offerto da `SessionView`.
