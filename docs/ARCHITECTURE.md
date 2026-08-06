# 🏛️ Linda System Architecture

## Executive Overview

**Linda** is a decentralised, end-to-end encrypted messaging platform. The
application is built on top of [`linda-core`](https://github.com/scobru/linda-core),
which integrates [Zen](https://github.com/scobru/zen) for peer-to-peer graph
synchronisation and native secp256k1 / AES-GCM cryptography.

There is no application server. The React client is a static bundle; the only
network peers are Zen relays, which replicate a signed, encrypted graph and can
read nothing they carry.

```
┌─────────────────────────────────────────────────────────────┐
│                          Linda UI                           │
│         React 19 + TypeScript + Vite + Tailwind/DaisyUI     │
│      Web (PWA)  |  Capacitor (Android)  |  Electron (Desktop)│
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                          linda-core                         │
│  ┌──────────────────────┐  ┌───────────────────────────────┐│
│  │ CommunicationService │  │ GroupService                  ││
│  └──────────────────────┘  └───────────────────────────────┘│
│  ┌──────────────────────┐  ┌───────────────────────────────┐│
│  │ CallingService       │  │ FileTransfer & WormholeService ││
│  └──────────────────────┘  └───────────────────────────────┘│
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Zen P2P Graph Network                    │
│          Blind relays + authenticated signed nodes          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 1. Identity & Cryptography Engine

### Single keypair model

Each user operates on a single **secp256k1 keypair** generated via `zen.pair()`:

```json
{
  "pub": "<secp256k1_public_key>",
  "priv": "<secp256k1_private_key>",
  "address": "<zen_address>"
}
```

- **Unified key**: the same keypair signs graph operations and performs
  Elliptic-Curve Diffie-Hellman (ECDH) key agreement.
- **No exchange keypair**: unlike Gun SEA, which uses a separate `epub`/`epriv`
  pair, Zen needs no second key. For backwards compatibility with older graph
  readers, `CommunicationService.publishBundle` republishes `pair.pub` under the
  legacy `epub` field.
- **Deterministic derivation**: `generatePairFromSeed(username, password)`
  reproduces the same keypair on any device, so account recovery needs no
  identity server — and no password reset is possible.

### Multi-path profile resolution

To keep first paint fast while relays converge, `useProfile` queries several
deterministic graph paths in parallel and takes the first usable answer:

1. **Primary app profile** — `~<pub>/profile/nickname`
2. **Verified handle** — `~<pub>/profile/uniqueUsername`
3. **Communication bundle** — `~<pub>/linda_bundle_v7/username`
4. **Global registry** — `linda_aliases/<pub>/alias`
5. **Legacy alias** — `~<pub>/alias`

---

## 🚪 2. Unified Room Model

- **Room abstraction**: 1:1 chats, group channels, and call sessions all live
  under `linda_rooms/<id>`, so subscription, pinning, and deletion logic is
  written once.
- **Deterministic 1:1 routing**: for two public keys `pubA` and `pubB`, the room
  id is computed, not negotiated:

  ```
  p2p_<min(pubA, pubB)>_<max(pubA, pubB)>
  ```

  Any two users who know each other's public key agree on their meeting point in
  the graph without a discovery server ever being involved.

The full path inventory lives in [DATA_MODEL.md](./DATA_MODEL.md).

---

## 💬 3. Message Flows

### 1:1 direct messaging (Zen-native E2EE)

1. **Handle resolution** — `@username` maps to the peer's `pub` via
   `linda_unique_usernames`.
2. **Shared secret derivation** — `zen.secret(peerPub, myPair)` performs ECDH.
   Derived secrets are memoised in `CommunicationService`.
3. **Payload encryption** — `zen.encrypt(message, secret)` produces AES-GCM
   output as a three-part base62 string (`ciphertext.iv.tag`). Legacy payloads
   beginning with `SEA{` are rejected rather than decrypted.
4. **Graph delivery and inbox poke** — the ciphertext is written to
   `linda_rooms/<p2p_id>/messages`, and an encrypted poke is delivered to the
   recipient's inbox so their client knows to subscribe.
5. **Decryption** — the recipient derives the identical secret from
   `zen.secret(senderPub, myPair)` and decrypts locally.

### Group messaging (shared AES-GCM key)

1. **Group secret** — the creator generates a 256-bit AES-GCM key.
2. **Invite distribution** — the key reaches new members over encrypted 1:1
   channels, never through the group room itself.
3. **Group cryptography** — `GroupService` encrypts and decrypts payloads with
   WebCrypto AES-GCM, prepending a 12-byte IV to the ciphertext.
4. **Key durability** — every path that learns a secret also escrows it,
   encrypted to the owner's own keypair, at `linda_room_keys/<groupId>`, so a
   cleared browser profile does not lock a member out of their own group.

---

## 📁 4. Media & File Transfers

| Transfer mode | Technology | Use case |
| :--- | :--- | :--- |
| **Direct P2P file stream** | WebRTC DataChannels (`FileTransferService`) | High-speed encrypted transfer between peers that are online simultaneously. |
| **Async binary relay** | Wormhole protocol (`WormholeService`) | Encrypted upload to a temporary relay for offline or asynchronous delivery. |
| **A/V calling** | WebRTC audio/video (`CallingService`) | Real-time calls, with ICE signalling carried over Zen graph rooms. |

---

## 🧩 5. Client Runtime Composition

`App.tsx` bootstraps Zen, restores the session, and then composes the feature
set out of hooks. Each hook owns one concern and one subscription lifecycle:

| Hook | Responsibility |
| :--- | :--- |
| `useAuthManager` | Magic-link and QR login payload parsing, toast notifications. |
| `useCommunicationInit` | Handle sync or generation, `CommunicationService` and `GroupService` construction. |
| `useMessaging` | Contacts, rooms, send/receive, unread counts, typing, pins, deletions. The largest module by far. |
| `useSignalingListener` | Incoming call and file-transfer signals. |
| `useFileTransfer` / `useWormhole` | Transfer progress and received blobs. |
| `useProfile` | Multi-path nickname and avatar resolution for the contact list. |

`startConnectionWatchdog` keeps relay sockets alive across sleep and network
changes, because a dropped WebSocket silently freezes every live subscription
until the page is reloaded.

### Platform targets

| Target | Entry | Notes |
| :--- | :--- | :--- |
| Web / PWA | `index.html` + `public/sw.js` | Uses `BrowserRouter`; service worker handles push notifications. |
| Desktop | `electron/main.js` | Built with `VITE_BASE_PATH=./`; `file:` protocol forces `HashRouter` and disables the service worker. |
| Android | `android/` via Capacitor | Same `file:` constraints; local notifications via `@capacitor/local-notifications`. |

---

## 🛡️ 6. Blind Relay Architecture

Relays are **blind sync nodes**:

- They replicate the graph and validate node signatures.
- They hold no private keys, decrypt nothing, and perform no cryptographic
  transformation on message content.
- Inbox writes are authorised by per-peer Zen certificates rather than wildcard
  policies, so a leaked certificate grants one writer one path.

A relay operator can still observe metadata: which souls are written, when, and
by which public key. See [SECURITY.md](./SECURITY.md) for what that implies.

---

## 🇮🇹 Flusso di Crittografia (Sintesi in Italiano)

1. **Identità**: singola coppia di chiavi secp256k1 da `zen.pair()`. La stessa
   chiave firma i pacchetti ed esegue lo scambio ECDH (`zen.secret`).
2. **Chat 1:1**: ECDH diretto sulla chiave pubblica del destinatario. La
   cifratura avviene con `zen.encrypt` (AES-GCM in tre segmenti base62
   `ct.iv.tag`). L'avviso di nuovo messaggio viaggia come "poke" cifrato
   nell'inbox del destinatario.
3. **Gruppi**: chiave simmetrica AES-GCM condivisa, distribuita all'ingresso dei
   membri e gestita da `GroupService`, con escrow cifrato in
   `linda_room_keys/<groupId>`.
4. **Relay cieco**: i nodi relay sincronizzano il grafo ma non possono decifrare
   alcun messaggio né accedere alle chiavi degli utenti.

Il documento completo è in [ENCRYPTION_FLOW.md](../ENCRYPTION_FLOW.md).
