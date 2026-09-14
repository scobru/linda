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

### `CallSession` & `CallRpc`
- **Definizione:** Moduli del Core P2P che implementano il protocollo di segnalazione e la macchina a stati della chiamata (`idle` -> `calling` / `ringing` -> `connected` -> `ended`).
- **Canale:** Canale dedicato Protomux `linda-call/1` multiplexato sulle connessioni Hyperswarm crittografate con Noise.
- **Messaggi:** `call_offer`, `call_answer`, `call_end`, `call_control` (mute/unmute/camera-off/camera-on), `call_frame` (payload multimediale binario).

### `Session` & `SessionView`
- **Definizione:** Il punto d'accesso unificato all'istanza Linda del peer locale.
- **Tri-runtime:**
  - In Electron: istanza diretta di `Session` in-process.
  - In Pear Desktop: proxy IPC asincrono verso un Bare worker dedicato.
  - In Mobile: proxy IPC asincrono tramite BareKit verso il worklet C++/Bare.
- **`SessionView`:** L'interfaccia/seam polimorfa comune a cui fa riferimento l'interfaccia utente (`AppShell` e `CallOverlay`).

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
