# 🏛️ Linda System Architecture

## Executive Overview

**Linda** is a high-performance, decentralized, end-to-end encrypted messaging platform. The application is built on top of **[`linda-core`](../../linda-core/README.md)**, which integrates **[Zen](https://github.com/scobru/zen)** for peer-to-peer data graph synchronization and native secp256k1 / AES-GCM cryptography.

```
┌─────────────────────────────────────────────────────────────┐
│                       Linda UI                              │
│         (React 19 + TypeScript + Vite + DaisyUI)             │
│            Capacitor (Android) | Electron (Desktop)         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                      linda-core                             │
│ ┌──────────────────────┐ ┌────────────────────────────────┐ │
│ │ CommunicationService │ │ GroupService                   │ │
│ └──────────────────────┘ └────────────────────────────────┘ │
│ ┌──────────────────────┐ ┌────────────────────────────────┐ │
│ │ CallingService       │ │ FileTransfer & WormholeService │ │
│ └──────────────────────┘ └────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Zen P2P Graph Network                    │
│      (Blind Relays + Authenticated P2P Signed Nodes)        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 1. Identity & Cryptography Engine

### Single Keypair Model
Each user operates on a single **secp256k1 keypair** generated via `zen.pair()`:

```json
{
  "pub": "<secp256k1_public_key>",
  "priv": "<secp256k1_private_key>",
  "address": "<zen_address>"
}
```

- **Unified Key**: The exact same keypair signs graph operations and performs direct Elliptic-Curve Diffie-Hellman (ECDH) key agreement.
- **No Exchange Keypair**: Unlike legacy protocols (e.g. Gun SEA using separate `epub`/`epriv`), Zen native requires no separate exchange key. For backward compatibility with older graph readers, `CommunicationService.publishBundle` maps `pair.pub` to the legacy `epub` field.
- **Deterministic Key Derivation**: Keys are derived deterministically using `generatePairFromSeed(username, password)`, allowing instant authentication without central identity servers.

### Multi-path Profile Resolution
To guarantee fast rendering and eventual profile consistency across relay nodes, identity resolution (`useProfile`) queries five deterministic graph paths in parallel:

1. **Primary App Profile**: `~${pub}/profile/nickname`
2. **Verified Handle**: `~${pub}/profile/uniqueUsername`
3. **Communication Bundle**: `~${pub}/linda_bundle_v7/username`
4. **Global Registry**: `linda_aliases/${pub}/alias`
5. **Legacy Alias**: `~${pub}/alias`

---

## 🚪 2. Unified Room Model

- **Room Abstraction**: 1:1 direct chats, group channels, and call sessions all use unified room paths under `linda_rooms/<id>`.
- **Deterministic 1:1 Room Routing**: For two public keys `pubA` and `pubB`, the room ID is deterministically computed as:
  ```
  p2p_${min(pubA, pubB)}_${max(pubA, pubB)}
  ```
  This eliminates discovery servers: any two users who know each other's public key automatically agree on their graph meeting point.

---

## 💬 3. Message Flows

### 1:1 Direct Messaging (Zen-Native E2EE)
1. **Handle Resolution**: `@username` is mapped to the peer's `pub` via `linda_unique_usernames`.
2. **Shared Secret Derivation**: `zen.secret(peerPub, myPair)` executes direct ECDH key agreement. Shared secrets are memoized in `CommunicationService`.
3. **Payload Encryption**: `zen.encrypt(message, secret)` encrypts content via AES-GCM, producing base62 three-part strings (`ciphertext.iv.tag`). Legacy payloads starting with `SEA{` are automatically rejected.
4. **Graph Delivery & Inbox Poke**: The encrypted payload is written to `linda_rooms/<p2p_id>`. Simultaneously, an encrypted poke is delivered to `linda_v3_inbox_<peerPub>` to signal incoming messages.
5. **Decryption**: The recipient derives the matching secret from `zen.secret(senderPub, myPair)` and decrypts locally.

### Group Messaging (Shared AES-GCM Key)
1. **Group Secret**: The group creator generates a 256-bit AES-GCM key (`meta.secret`).
2. **Invite Distribution**: Member invitations distribute the encrypted `meta.secret` over encrypted 1:1 channels.
3. **Group Cryptography**: `GroupService` encrypts/decrypts group payloads using WebCrypto AES-GCM (with a 12-byte IV prepended to the payload).

---

## 📁 4. Media & File Transfers

| Transfer Mode | Technology | Use Case |
| :--- | :--- | :--- |
| **Direct P2P File Stream** | WebRTC DataChannels (`FileTransferService`) | High-speed, direct encrypted transfer for online peers. |
| **Async Binary Relay** | Wormhole Protocol (`WormholeService`) | Temporary encrypted relay uploads for offline or async delivery. |
| **A/V Calling** | WebRTC Audio/Video (`CallingService`) | Real-time voice/video calls with signaling over Zen graph rooms. |

---

## 🛡️ 5. Blind Relay Architecture

Relay servers in the Linda ecosystem function strictly as **blind sync nodes**:
- Relays replicate the graph and validate signed nodes.
- Relays do **not** possess private keys, do **not** decrypt message contents, and perform zero cryptographic transformations.
- Inboxes use individual Zen write certificates per peer rather than unsafe wildcard certificates.

---

## 🇮🇹 Flusso di Crittografia (Sintesi in Italiano)

1. **Identità**: Singola coppia di chiavi secp256k1 da `zen.pair()`. La stessa chiave firma i pacchetti ed esegue lo scambio ECDH (`zen.secret`).
2. **Chat 1:1**: ECDH diretto sulla chiave pubblica del destinatario. La cifratura avviene con `zen.encrypt` (AES-GCM in tre segmenti base62 `ct.iv.s`). L'avviso di nuovo messaggio viaggia tramite "poke" cifrato nell'inbox `linda_v3_inbox_<pub>`.
3. **Gruppi**: Chiave simmetrica AES-GCM condivisa (`meta.secret`), distribuita all'ingresso dei membri e gestita da `GroupService`.
4. **Relay Cieco**: I nodi relay sincronizzano il grafo ma non possono decifrare alcun messaggio né accedere alle chiavi degli utenti.
