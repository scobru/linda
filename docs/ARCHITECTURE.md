# Architecture: Zen-Native Symmetric E2EE

## Overview
Linda uses [Zen](https://github.com/akaoio/zen)'s native cryptography end to end: one keypair per user, direct peer-to-peer ECDH, and AES-GCM payloads — in the style of Keet/Holepunch. The previous Threshold Proxy Re-Encryption (Umbral) and post-quantum (ML-KEM) layers have been removed; relays now only sync the encrypted graph and never participate in cryptography.

## Identity

Each user has a **single secp256k1 keypair** from `zen.pair()`:

```
{ pub, priv, address }
```

The same key signs and performs ECDH. There is **no separate `epub`/`epriv`** as in Gun SEA. For backward compatibility with peers still reading the `epub` field from the graph, `CommunicationService.publishBundle` publishes `pair.pub` under that name.

Keys are derived deterministically from username+password (`generatePairFromSeed`), so login requires no auth server.

## Unified Room Model

- **Everything is a room**: 1:1 chats and groups both live under `linda_rooms/<id>`.
- **Deterministic P2P IDs**: for 1:1 chats the room ID is `p2p_<pubA>_<pubB>` with the two public keys sorted — two users who know each other's keys already know where to meet on the graph, no matching database needed.

## Message Flow (1:1)

1. **Resolve**: username/@handle → `pub` via decentralized indices (`linda_unique_usernames`, `usernames`, Gun alias nodes).
2. **Derive**: `zen.secret(peerPub, myPair)` — direct ECDH on the peer's `pub`. Shared secrets are memoized per pub.
3. **Encrypt**: `zen.encrypt(msg, secret)` — AES-GCM, output is base62 `ct.iv.s` (dot-separated). Bodies starting with `SEA{` are old Gun SEA ciphertexts and are rejected as `LEGACY_UNSUPPORTED`.
4. **Deliver**: ciphertext is written to the deterministic P2P room, plus an encrypted `P2P_POKE` to the recipient's inbox (`linda_v3_inbox_<pub>`) so their client knows to subscribe to the room.
5. **Decrypt**: the recipient derives the same secret from the sender's `pub` and decrypts locally.

## Message Flow (Groups)

- The admin generates a group secret (`meta.secret`, base64 AES-GCM key) shared with members via invites.
- `GroupService.encryptGroupMessage`/`decryptGroupMessage` use WebCrypto AES-GCM (12-byte IV prepended to the ciphertext).
- P2P rooms reuse the same pipeline with an empty `secret`: the payload is already encrypted by the ECDH envelope above.

## Role of the Relay

The relay is a **blind sync node**: it replicates the encrypted graph and enforces authenticated writes (Zen signed puts), but holds no keys and performs no transformations. Wildcard (`*`) certificates are explicitly unsupported in Zen-native; peer write access to inboxes uses specific per-peer certificates.

---

## Identity & Discovery

Linda maps cryptographic keys to human-readable names through a decentralized identity system.

### Unique Handles (@username)
Users can claim a unique handle stored in a global decentralized index (`linda_unique_usernames`). The handle acts as a discoverable pointer to the user's public key.

### Multi-path Profile Resolution
To ensure eventual consistency across network conditions and relay states, the `useProfile` hook resolves identity over multiple paths:

1.  **Primary Path**: `~${pub}/profile/nickname` (app-specific display name).
2.  **Unique Handle**: `~${pub}/profile/uniqueUsername` (verified handle).
3.  **Communication Bundle**: `~${pub}/linda_bundle_v7/username` (published by `CommunicationService`).
4.  **Global Index**: `linda_aliases/${pub}/alias` (searchable alias registry).
5.  **Legacy Fallback**: `~${pub}/alias` (backward compatibility).

The UI updates reactively as soon as any path yields a valid identity, falling back to a truncated public key only as a last resort.

---

> "Two peers who know each other's keys already share a meeting point and a secret — the network in between only carries noise."
