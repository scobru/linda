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
-   **`CommunicationService`**: The backbone of the application. Handles GunDB signaling, user authentication, and inbox certificate management (recently refactored from `SignalService`).
-   **`FileTransferService`**: Manages the lifecycle of WebRTC connections for secure file exchange.
-   **`GroupService`**: Handles decentralized group creation and membership.

### Technological Stack
-   **Frontend**: React + TypeScript + Vite.
-   **Database**: [GunDB](https://gun.eco/) (Decentralized/P2P).
-   **Encryption**: Gun SEA (AES, RSA, SHA).
-   **Communication**: WebRTC for P2P data streams.

## 🔒 Security & Encryption

Shogun Linda implements a multi-layered security model to ensure privacy without a central authority.

### 1:1 End-to-End Encryption (E2E)
Managed by the `CommunicationService`, it uses **Gun SEA** for robust P2P identity and security:
-   **Key Exchange**: Uses Diffie-Hellman (DH) derivation. Each user has an `epub` (Exchange Public Key).
-   **Shared Secrets**: A unique shared secret is computed between two peers using `SEA.secret(peer_epub, my_pair)`.
-   **Cipher**: Messages are encrypted/decrypted using `SEA.encrypt` and `SEA.decrypt` with the derived secret.
-   **Public Inboxes**: Secure "write-only" inboxes are managed via recursive SEA certificates (`inbox_cert`), allowing peers to signal you without having global write permissions to your node.

### Group Encryption
Managed by the `GroupService`, using a **Symmetric Key Sharing** model:
-   **Group Secret**: A random 32-byte symmetric key is generated upon group creation.
-   **Key Distribution**: The secret is bundled inside the Base64 invite link. Joining the group grants access to the key.
-   **Cipher**: messages are encrypted using **AES-GCM** with the group's symmetric key. This ensures high performance for large groups while maintaining "Group E2E" privacy (only members can decrypt).
-   **Permissions**: decentralized Role-Based Access Control (RBAC) manages who can kick, mute, or pin messages.

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
