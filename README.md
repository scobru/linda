# 🛡️ Shogun Linda (Signal)

**Linda** is a high-performance, decentralized, end-to-end encrypted messaging platform. It leverages **Zen (P2P Graph)** for data synchronization and **WebRTC** for direct, high-speed file transfers.

## 🚀 Key Features

-   **P2P Messaging**: Instant messaging with Zen-native authenticated writes. No central database; your data lives on the decentralized graph.
-   **Symmetric E2E Encryption**: Direct, authenticated symmetric encryption for all chats (1:1 and Groups).
-   **Unique Handles (@username)**: Claim a human-readable unique identifier mapped to your public key via a decentralized discovery index.
-   **P2P File Transfers**: Send images and files of any size directly to peers using WebRTC Data Channels.
-   **Wormhole Integration**: Async file transfers via temporary binary relays.
-   **Self-Custody**: Your identity is your public key. Multi-path profile resolution ensures you always see your contacts' identities across all devices.

## 🏗️ Architecture

### Core Services
-   **`CommunicationService`**: Handles Zen signaling, user authentication, and deterministic room discovery.
-   **`GroupService`**: The core encryption engine. Manages symmetric E2EE keys and logic for all conversations.
-   **`FileTransferService`**: Manages WebRTC connections for secure file exchange.

### Technological Stack
-   **Frontend**: React + TypeScript + Vite.
-   **Database**: [Zen](https://github.com/akaoio/zen) (Decentralized/P2P).
-   **Encryption**: Symmetric E2EE (AES-GCM).
-   **Styling**: Tailwind CSS + DaisyUI (Premium Glassmorphic Design).

## 🔒 Security & Documentation
Detailed architectural overview can be found in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## 🛠️ Development

### Prerequisites
-   Node.js (v18+)
-   Yarn

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

## 📅 Roadmap
- [ ] **P2P Audio/Video Calling**: Infrastructure in progress.
- [ ] **Desktop Client**: Electron-based distribution.

## 📄 License
This project is part of the Shogun Ecosystem.
