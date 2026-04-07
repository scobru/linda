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
