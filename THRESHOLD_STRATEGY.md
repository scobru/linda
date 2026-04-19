# Stato dell'Arte: Crittografia Unificata in Linda via Threshold Proxy Re-Encryption (TPRE)

## 🎯 Obiettivo Raggiunto
Linda ha superato il modello di scambio di chiavi simmetriche per adottare un sistema di **Threshold Proxy Re-Encryption (TPRE)** basato sulla libreria **Umbral** (NuCypher). Questo sistema permette un'esperienza P2P asincrona dove l'infrastruttura (Relay) facilita la decifratura per i destinatari senza mai avere accesso alle chiavi o al contenuto in chiaro.

## 🏗️ Architettura Implementata (Unified TPRE)

### Modello Unificato
A differenza dei sistemi tradizionali, Linda non distingue più tra chat 1:1 e Gruppi a livello crittografico.
-   **Tutto è un Gruppo**: Anche le chat private sono stanze TPRE con soglia (2/N).
-   **ID Deterministici**: Per le chat 1:1, l'ID della stanza (`p2p_...`) viene calcolato deterministicamente a partire dalle chiavi pubbliche dei due partecipanti, eliminando la necessità di database centrali di "matching".

### Il Ruolo del Relay (Proxy)
Il Relay funge da **Proxy semi-fiduciario**:
1.  **Ricezione dei KFrags**: L'Admin del gruppo (o l'iniziatore della chat P2P) genera dei frammenti di chiave di delega (**kfrags**) e li invia al Relay.
2.  **Trasformazione Cieca**: Quando un destinatario richiede un messaggio, il Relay usa il kfrag per trasformare il ciphertext originale in un "prodotto intermedio" (**cfrag**).
3.  **Decifratura Locale**: Il destinatario scarica il cfrag e lo combina con la propria chiave privata per ottenere il plaintext originale.

## 🔄 Flusso di Messaggistica

1.  **Inizializzazione**: User A crea una stanza TPRE e genera dei kfrags per User B.
2.  **Signaling**: User A invia un `TPRE_POKE` (notifica cifrata via SEA) a User B per informarlo della nuova stanza.
3.  **Cifratura**: User A cifra il messaggio con la **Community Public Key (CPK)** della stanza.
4.  **Sincronizzazione**: User B scarica il ciphertext e richiede al Relay la trasformazione. Il Relay esegue il re-keying e User B decifra localmente.

## 🚀 Vantaggi Operativi

### 1. Multi-Device nativo
Un utente può autorizzare i propri dispositivi aggiuntivi come membri del gruppo, permettendo la sincronizzazione della cronologia tramite il relay senza riesporre le chiavi master.

### 2. Forward Secrecy e Revoca
La rimozione di un membro è ora istantanea a livello di relay: cancellando il kfrag associato al membro rimosso, il relay smette di generare trasformazioni per lui, rendendo i nuovi messaggi indecifrabili.

### 3. Facilità di Scoperta
Grazie agli ID deterministici, due utenti Linda che si conoscono (hanno le rispettive Pubkey) sanno già "dove trovarsi" su GunDB per iniziare a comunicare via TPRE.

---

## ✅ Roadmap Tecnica Completata
- [x] **Research**: Integrazione della libreria NuCypher Umbral (WASM/JS).
- [x] **ThresholdService**: Implementazione del servizio core per la gestione di chiavi, cifertexts e kfrags.
- [x] **Relay Update**: Il server Shogun Relay supporta ora la computazione delle partial transform shares.
- [x] **Migration**: Disattivazione della vecchia logica SEA per il trasporto dei messaggi in favore del tunnel TPRE.

---

> "L'infrastruttura è il postino cieco che trasforma le serrature senza mai avere la chiave." (Principio di Proxy Re-Encryption in Linda)

---

> "L'infrastruttura è cieca finché un membro del gruppo non sceglie attivamente di tradire il gruppo." (Principio di Blind Routing)
