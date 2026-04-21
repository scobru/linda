# State of the Art: Unified Cryptography via Threshold Proxy Re-Encryption (TPRE)

## 🎯 Objective Achieved
Linda has moved beyond the symmetric key exchange model to adopt a **Threshold Proxy Re-Encryption (TPRE)** system based on the **Umbral** (NuCypher) library. This system enables an asynchronous P2P experience where the infrastructure (Relay) facilitates decryption for recipients without ever having access to the keys or plaintext content.

## 🏗️ Implemented Architecture (Unified TPRE)

### Unified Model
Unlike traditional systems, Linda no longer distinguishes between 1:1 and Group chats at the cryptographic level.
- **Everything is a Group**: Even private chats are TPRE rooms with a threshold (2-of-N).
- **Deterministic IDs**: For 1:1 chats, the room ID (`p2p_...`) is calculated deterministically from the public keys of the two participants, eliminating the need for central matching databases.

### The Role of the Relay (Proxy)
The Relay acts as a **semi-trusted Proxy**:
1. **KFrag Reception**: The group Admin (or P2P chat initiator) generates delegation key fragments (**kfrags**) and sends them to the Relay.
2. **Blind Transformation**: When a recipient requests a message, the Relay uses the kfrag to transform the original ciphertext into an "intermediate product" (**cfrag**).
3. **Local Decryption**: The recipient downloads the cfrag and combines it with their private key to obtain the original plaintext.

## 🔄 Messaging Flow

1. **Initialization**: User A creates a TPRE room and generates kfrags for User B.
2. **Signaling**: User A sends a `TPRE_POKE` (encrypted notification via SEA/Zen) to User B to inform them of the new room.
3. **Encryption**: User A encrypts the message with the room's **Community Public Key (CPK)**.
4. **Synchronization**: User B downloads the ciphertext and requests the transformation from the Relay. The Relay performs the re-keying, and User B decrypts locally.

## 🚀 Operational Advantages

### 1. Native Multi-Device
A user can authorize their additional devices as group members, allowing history synchronization via the relay without re-exposing master keys.

### 2. Forward Secrecy and Revocation
Member removal is now instantaneous at the relay level: by deleting the kfrag associated with the removed member, the relay stops generating transformations for them, making new messages undecipherable.

### 3. Ease of Discovery
Thanks to deterministic IDs, two Linda users who know each other's public keys already know "where to meet" on the Zen graph to start communicating via TPRE.

---

## ✅ Technical Roadmap Completed
- [x] **Research**: Integration of the NuCypher Umbral library (WASM/JS).
- [x] **ThresholdService**: Implementation of the core service for key, ciphertext, and kfrag management.
- [x] **Relay Update**: Shogun Relay now supports partial transform share computation.
- [x] **Migration**: Deactivation of legacy SEA logic for message transport in favor of the TPRE tunnel.

---

> "Infrastructure is the blind postman who transforms locks without ever having the key." (The Principle of Proxy Re-Encryption in Linda)
