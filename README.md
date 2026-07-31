# 🛡️ Shogun Linda (Signal)

**Linda** is a high-performance, decentralized, end-to-end encrypted messaging platform. It leverages **[Zen](https://github.com/scobru/zen)** for peer-to-peer data graph synchronization and **WebRTC** for direct, high-speed file transfers and audio/video calling.

The core communication and cryptographic capabilities of Linda are powered by the **[`linda-core`](../linda-core/README.md)** library.

---

## 🚀 Key Features

- 💬 **P2P 1:1 Messaging**: Instant messaging powered by native Zen authenticated writes and ECDH key derivation. No central servers or user databases.
- 👥 **Group Encrypted Conversations**: Shared AES-GCM encryption key generation and invite-based key exchange managed via `GroupService`.
- 🏷️ **Unique Handles (`@username`)**: Claim human-readable unique handles mapped directly to public keys in a decentralized graph index.
- 📁 **P2P File Transfers & Wormhole**: High-speed direct file transfers via WebRTC DataChannels with async fallback via temporary binary relay streams (`WormholeService`).
- 📞 **P2P Audio & Video Calls**: WebRTC session orchestration and ICE signaling over P2P graph rooms (`CallingService`).
- 🔐 **Self-Custodial Identity**: Your keypair (`secp256k1`) is your identity. Multi-path profile resolution guarantees eventual consistency across devices.

---

## 🏗️ Technical Architecture & Stack

### Core Service Layer (`linda-core`)
- **`CommunicationService`**: Handles identity bundles, 1:1 signaling, room routing (`p2p_<pubA>_<pubB>`), and inbox pokes.
- **`GroupService`**: Group creation, symmetric AES-GCM encryption engine, and member key management.
- **`CallingService`**: Real-time WebRTC audio/video call signaling.
- **`FileTransferService`**: WebRTC DataChannel chunked file streams.
- **`WormholeService`**: Temporary encrypted binary relay stream fallback.

### Technology Stack
- **Frontend**: React 19 + TypeScript + Vite.
- **Desktop & Mobile**: Electron (Desktop) + Capacitor (Android / iOS).
- **Core Library**: [`linda-core`](../linda-core/README.md).
- **Database**: [Zen P2P Graph Database](https://github.com/scobru/zen).
- **Styling & UI**: Tailwind CSS + DaisyUI (OLED Glassmorphic Design System in [`DESIGN.md`](./DESIGN.md)).

---

## 📚 Documentation Index

- 🏛️ **[System Architecture (`docs/ARCHITECTURE.md`)](./docs/ARCHITECTURE.md)**: Full architecture breakdown, identity derivation, and message flows.
- 🛡️ **[Flusso di Crittografia (`ENCRYPTION_FLOW.md`)](./ENCRYPTION_FLOW.md)**: Guida completa in italiano alla crittografia Zen-native (1:1 ECDH, gruppi, inboxes e relay).
- 📦 **[Linda Core Library (`linda-core/README.md`)](../linda-core/README.md)**: Documentation for the underlying core npm package.
- 🎨 **[Design System (`DESIGN.md`)](./DESIGN.md)**: Visual identity, typography, OLED color palette, and component specs.
- 📖 **[Documentation Directory (`docs/README.md`)](./docs/README.md)**: Central entry point for all developer guides and feature specifications.

---

## 🛠️ Development Setup

### Prerequisites
- Node.js (v18+)
- Yarn

### Quickstart

1. **Clone the repository**:
   ```bash
   git clone https://github.com/scobru/linda.git
   cd linda
   ```

2. **Install dependencies**:
   ```bash
   yarn install
   ```

3. **Start the development server**:
   ```bash
   yarn dev
   ```

4. **Run relay node locally (optional)**:
   ```bash
   yarn relay
   ```

5. **Build for Android / Desktop**:
   ```bash
   # Android
   yarn android

   # Electron
   yarn electron:dev
   ```

---

## 📄 License

This project is part of the **Shogun Ecosystem**. MIT Licensed.
