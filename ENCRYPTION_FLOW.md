# Flusso di Crittografia Linda (Post-Quantum Hybrid)

Linda utilizza un'architettura di crittografia a più livelli (Defense in Depth) che combina crittografia classica e post-quantum.

## 1. Identità e Radice (ZEN)
- **ZEN (ZenDB)**: Layer di database decentralizzato.
- **SEA Keys**: Ogni utente ha una coppia di chiavi SEA (ECDSA/ECDH). Tutte le altre chiavi (Umbral, ML-KEM) sono derivate deterministicamente dal segreto radice (`seaPriv`).

## 2. Threshold Proxy Re-Encryption (Umbral PRE)
Utilizzato per chat 1:1 e di gruppo scalabili.
- **Admin**: Genera una chiave di gruppo (`groupPK`). Crea "Key Fragments" (`kfrags`) per ogni membro.
- **Relay (Proxy)**: Riceve i `kfrags`. Quando arriva un messaggio, il Relay lo "trasforma" per il destinatario senza mai poterlo leggere (non possiede la chiave di decrittazione).
- **Destinatario**: Riceve il messaggio trasformato e lo finalizza con la propria chiave privata.

## 3. Layer Post-Quantum (ML-KEM/Kyber)
Linda è **Hybrid Post-Quantum Resistant**.
- **Algoritmo**: ML-KEM-768 (Kyber).
- **Flusso**: Insieme al messaggio Umbral, l'app genera una "capsula" ML-KEM per ogni destinatario.
- **Sicurezza**: Anche se in futuro un computer quantistico dovesse rompere il layer Umbral (basato su ECC), il messaggio rimarrebbe protetto dal layer ML-KEM.

## 4. Sicurezza degli Stream (Secret-Stream & WebRTC)
- **Handshake**: I segnali di coordinamento (SDP/ICE) viaggiano sul canale Umbral/PQ.
- **Dati (File)**: Utilizzano WebRTC o **Secret-Stream** (Noise Protocol) per creare un tunnel peer-to-peer crittografato e autenticato direttamente tra i dispositivi.

| Layer | Tecnologia | Scopo |
| :--- | :--- | :--- |
| **Persistenza** | ZEN (ZenDB) | Storage decentralizzato e sync. |
| **Identità** | SEA Keys | Firma, autorizzazione e radice crittografica. |
| **Gruppi** | Umbral PRE | Re-encryption lato Relay senza accesso ai dati. |
| **Post-Quantum** | ML-KEM-768 | Protezione contro futuri attacchi quantistici. |
| **Stream** | Secret-Stream | Crittografia dei flussi dati diretti (P2P). |
