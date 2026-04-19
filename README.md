# 🛡️ Shogun Linda (Signal)

**Linda** is a high-performance, decentralized, end-to-end encrypted messaging platform. It leverages **GunDB** for P2P data synchronization and **WebRTC** for direct, high-speed file transfers.

## 🚀 Key Features

-   **P2P Messaging**: Instant messaging with GunDB SEA (Security, Encryption, and Authorization). No central database; your data lives with you and your peers.
-   **Encrypted Group Chats**: Secure group management with decentralized certificates.
-   **P2P File Transfers**: Send images and files of any size directly to peers using WebRTC Data Channels.
-   **Cross-Device Sync**: The `Sync Kick` mechanism ensures your inbox stays active even on mobile background states.
-   **Self-Custody**: Your identity is your public key. No phone number or email required.

## 🏗️ Architecture

### Core Services
-   **`CommunicationService`**: Handles GunDB signaling, user authentication, and deterministic room discovery using SEA certificates.
-   **`GroupService`**: The core encryption engine. Manages **TPRE (Threshold Proxy Re-Encryption)** for both group and 1:1 chats.
-   **`ThresholdService`**: Wraps the NuCypher Umbral TPRE implementation for end-to-end post-quantum resistant security.
-   **`FileTransferService`**: Manages the lifecycle of WebRTC connections for secure file exchange.

### Technological Stack
-   **Frontend**: React + TypeScript + Vite.
-   **Database**: [GunDB](https://gun.eco/) (Decentralized/P2P).
-   **Encryption**: **NuCypher Umbral TPRE** (Main Payloads) + Gun SEA (Signaling & Identity).
-   **Communication**: WebRTC for P2P streams + TPRE Relay for asynchronous re-encryption.

## 🔒 Security & Encryption

Shogun Linda implements a unified security model based on **Proxy Re-Encryption (PRE)**, ensuring privacy even when one party is offline.

### Unified TPRE Architecture (1:1 and Group)
Unlike traditional systems that use different primitives for different chat types, Linda treats all conversations as TPRE groups:
-   **Deterministic P2P Rooms**: 1:1 chats are treated as private groups between two members, using deterministic IDs (`p2p_...`).
-   **Delegation & Re-encryption**: A user (Admin) delegates decryption rights to a peer by generating **kfrags** (keyshare fragments).
-   **TPRE Relay**: The relay server acts as a "semi-trusted" proxy. It uses the kfrags to transform ciphertexts for specific recipients without ever being able to see the plaintext content.
-   **Offline Sincronization**: TPRE allows the relay to helper-transform messages for a recipient even if the sender is offline, facilitating a robust asynchronous P2P experience.

### Signaling & Discovery (Gun SEA)
Gun SEA (Security, Encryption, and Authorization) is used as the foundational signaling layer:
-   **Deterministic Discovery**: Peers find their shared TPRE rooms by calculating IDs based on their respective public keys.
-   **TPRE POKE**: A small E2EE "poke" is sent via the legacy SEA inbox to notify a peer when a new TPRE group has been initialized for them.
-   **Certificates**: SEA certificates (`inbox_cert`) manage write-permissions for the signaling nodes.

## 🛠️ Development

### Prerequisites
-   Node.js (v18+)
-   NPM or Yarn

### Local Setup
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    yarn install
    ```
3.  Start the development server:
    ```bash
    yarn dev
    ```

### Deployment
Shogun Linda is optimized for deployment on **Vercel**:
```bash
yarn vercel --prod
```

## 📅 Roadmap / Future Features
-   [ ] **P2P Audio/Video Calling**: (Infrastructure under `CallingService.ts` is in progress but not yet implemented in the UI).


## 📄 License
This project is part of the Shogun Ecosystem.
