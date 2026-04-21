# 🛡️ Shogun Linda (Signal)

**Linda** is a high-performance, decentralized, end-to-end encrypted messaging platform. It leverages **Zen (P2P Graph)** for data synchronization and **WebRTC** for direct, high-speed file transfers.

## 🚀 Key Features

-   **P2P Messaging**: Instant messaging with Zen-native authenticated writes. No central database; your data lives on the decentralized graph.
-   **TPRE Encryption**: Post-quantum resistant Threshold Proxy Re-Encryption for all chats (1:1 and Groups).
-   **P2P File Transfers**: Send images and files of any size directly to peers using WebRTC Data Channels.
-   **Wormhole Integration**: Async file transfers via temporary binary relays.
-   **Self-Custody**: Your identity is your public key. No phone number or email required.

## 🏗️ Architecture

### Core Services
-   **`CommunicationService`**: Handles Zen signaling, user authentication, and deterministic room discovery.
-   **`GroupService`**: The core encryption engine. Manages TPRE logic for all conversations.
-   **`ThresholdService`**: Wraps the NuCypher Umbral TPRE implementation.
-   **`FileTransferService`**: Manages WebRTC connections for secure file exchange.

### Technological Stack
-   **Frontend**: React + TypeScript + Vite.
-   **Database**: [Zen](https://github.com/akaoio/zen) (Decentralized/P2P).
-   **Encryption**: **NuCypher Umbral TPRE** (Unified Model).
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
