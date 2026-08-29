# Complete Architecture Guide for Linda Pear

This document provides a clear, simple, and structured explanation of how **Linda Pear** works, its internal architecture, the responsibility of each file, and where specific features and subsystems are implemented.

---

## 1. What is Linda Pear (In Simple Terms)

**Linda Pear** is a **100% Peer-to-Peer (P2P)**, encrypted, **serverless** messaging and file-sharing application.

Unlike traditional messengers (such as WhatsApp, Telegram, or Signal) or other P2P apps that rely on third-party relay servers (like TURN/relay infrastructure):
- **No central server**: There is no central database, no cloud backend, and no account registration with an email or phone number.
- **Zero relay dependency**: Data flows directly from device to device.
- **Sovereign end-to-end cryptography**: User identities are cryptographic keypairs (derived from a 12-word BIP39 mnemonic seed phrase).
- **Built on the Holepunch Stack**: Powered by the battle-tested open-source primitives created by Holepunch/Keet (*Hypercore*, *Corestore*, *Autobase*, *Hyperbee*, *Hyperswarm*, *Hyperdrive*).

---

## 2. Core Architectural Pillars (The Holepunch Stack)

To understand the codebase, here are the 6 foundational building blocks:

```
+-------------------------------------------------------------------------+
|                                USER INTERFACE                           |
|  Desktop: Electron + Web Components (src/ui/app-shell.ts)               |
|  Mobile:  React Native / Expo + Bare-Kit Worklet (mobile/)              |
+-------------------------------------------------------------------------+
|                         SESSION COORDINATOR                             |
|  Global state management, profile, bookmarks, contacts, RPC channels    |
+------------------------------------+------------------------------------+
|               DATA                 |              NETWORKING            |
|  • Autobase: multi-writer room log |  • Hyperswarm: DHT & Holepunching  |
|  • Hyperbee: B-tree key-value store|  • Protomux / RPC: ephemeral data  |
|  • Hyperdrive: P2P files & media   |    (typing, acks, write grants)    |
|  • Corestore: Hypercore manager    |                                    |
+------------------------------------+------------------------------------+
|                        SECURITY & IDENTITY                              |
|  • Libsodium / Argon2id: encrypted local storage with user passphrase   |
|  • BIP39: 12-word mnemonic recovery phrase                              |
|  • Epoch Keys: rotating room encryption keys                            |
+-------------------------------------------------------------------------+
```

1. **Hypercore**: An append-only, cryptographically signed log of binary blocks.
2. **Corestore**: A manager that creates, persists, and namespacing multiple Hypercores.
3. **Autobase**: Coordinates multi-user rooms. Each member appends to their own local Hypercore; Autobase deterministically linearizes all participants' logs into a single causal message stream.
4. **Hyperbee**: A B-tree key-value database built on top of Hypercore/Autobase. Used for indexing room state, messages, overlays, contacts, and user profiles.
5. **Hyperswarm & DHT**: A distributed networking layer that connects peers over the internet using 32-byte topic hashes and UDP holepunching—without intermediaries.
6. **Hyperdrive**: A distributed P2P filesystem. Shared files are written to the sender's local drive and transferred block-by-block directly to peers (who in turn become seeders).

---

## 3. Directory Map & File Responsibilities

### 📁 Root Directory
- [package.json](file:///c:/Users/dev/source/repos/linda-pear/package.json): Project dependencies, startup scripts (`npm run start`, `start:a`, `start:b` for local multi-peer testing), build tools, and Pear/Electron packaging.
- [build.js](file:///c:/Users/dev/source/repos/linda-pear/build.js): Bundles TypeScript source code into `dist/app.js` using *esbuild* and automatically generates `src/version.ts`.
- [index.html](file:///c:/Users/dev/source/repos/linda-pear/index.html): HTML entry point for the desktop Electron application.
- [style.css](file:///c:/Users/dev/source/repos/linda-pear/style.css): Complete CSS stylesheet for the desktop interface (themes, layout, chat bubbles, modals).
- [test.js](file:///c:/Users/dev/source/repos/linda-pear/test.js): Integration test runner executing TypeScript test suites via Node.js native test runner.

---

### 📁 `src/` (The Shared Core Engine)

All business logic in `src/` is platform-agnostic and shared between Electron and React Native.

#### 🔐 `src/identity/` (Identity & Key Management)
- [index.ts](file:///c:/Users/dev/source/repos/linda-pear/src/identity/index.ts): Main interface for creating, unlocking, recovering, and pairing identities.
- [keypair.ts](file:///c:/Users/dev/source/repos/linda-pear/src/identity/keypair.ts): Generates Ed25519 public/secret keypairs using `hypercore-crypto`.
- [mnemonic.ts](file:///c:/Users/dev/source/repos/linda-pear/src/identity/mnemonic.ts): Handles 12-word BIP39 recovery phrases and seed generation.
- [storage.ts](file:///c:/Users/dev/source/repos/linda-pear/src/identity/storage.ts): Persists `identity.json` to disk, encrypting the secret key using **Argon2id** (`crypto_pwhash`) and `crypto_secretbox`.
- [pairing.ts](file:///c:/Users/dev/source/repos/linda-pear/src/identity/pairing.ts): QR code device-pairing protocol. Securely transfers an identity over a temporary Hyperswarm channel to a secondary device.
- [profile.ts](file:///c:/Users/dev/source/repos/linda-pear/src/identity/profile.ts): Basic nickname and avatar schema.

---

#### 🌐 `src/network/` (P2P Swarm & Ephemeral RPC)
- [swarm.ts](file:///c:/Users/dev/source/repos/linda-pear/src/network/swarm.ts): Initializes **Hyperswarm**, connects to DHT topics, and performs NAT traversal.
- [rpc.ts](file:///c:/Users/dev/source/repos/linda-pear/src/network/rpc.ts): Protomux-based RPC protocol (`linda-rpc/1`) for ephemeral interactions: typing indicators, presence, read receipts, room write-access requests, public announcements, and encryption key exchanges.
- [encoding.ts](file:///c:/Users/dev/source/repos/linda-pear/src/network/encoding.ts): Compact binary encoders and decoders (`compact-encoding`) for network RPC payloads.
- [lobby.ts](file:///c:/Users/dev/source/repos/linda-pear/src/network/lobby.ts): Global discovery topic for announcing and discovering public rooms.

---

#### 💬 `src/rooms/` (Multi-Writer Room Engine)
- [room.ts](file:///c:/Users/dev/source/repos/linda-pear/src/rooms/room.ts): **The core engine of Linda Pear rooms.**
  - Organizes multi-writer distributed logs using **Autobase**.
  - **Deterministic `apply()` function**: Applies and validates all room operations (messages, edits, deletions, emoji reactions, writer additions, moderation roles, mutes, bans, broadcast mode).
  - **Rotating Room Encryption**: Manages message encryption across rotating *Epoch Keys*.
  - **Reactions & Overlays**: Tracks message metadata changes without violating the immutability of the underlying log.

---

#### 📁 `src/files/` (File Sharing & Media Streaming)
- [drive.ts](file:///c:/Users/dev/source/repos/linda-pear/src/files/drive.ts): `FileStore` abstraction built on **Hyperdrive** for seeding and fetching files P2P.
- [media-range.ts](file:///c:/Users/dev/source/repos/linda-pear/src/files/media-range.ts): Computes HTTP `Range` headers (e.g. `bytes=0-1048576`) to support seeking and instant playback.
- [media-server.ts](file:///c:/Users/dev/source/repos/linda-pear/src/files/media-server.ts): Platform-agnostic request handler protected by session tokens (`/<token>/<driveKey>/<filePath>`).
- [media-server-node.ts](file:///c:/Users/dev/source/repos/linda-pear/src/files/media-server-node.ts): Node.js loopback HTTP server (`127.0.0.1`) that pipes requested file slices directly into the native video/audio player.

---

#### 🧠 `src/app/` (Application State & Coordination)
- [session.ts](file:///c:/Users/dev/source/repos/linda-pear/src/app/session.ts): **The central orchestrator.**
  - Glues together identity, Hyperswarm networking, Hyperdrive file management, room lifecycle, contact requests, and file downloads.
- [profile-store.ts](file:///c:/Users/dev/source/repos/linda-pear/src/app/profile-store.ts): Local **Hyperbee** store containing:
  - Saved room bookmarks (`bookmarks`).
  - Contact book and pending requests (`contacts`).
  - Room encryption keys (`room_keys`).
  - Reusable room invite tokens (`room_invites`).
  - Peer avatar cache (`peer_avatars`).
  - Local preferences (chat wallpapers, nickname).

---

#### 🖥️ `src/ui/` & `src/util/` (Desktop UI & Utilities)
- [app-shell.ts](file:///c:/Users/dev/source/repos/linda-pear/src/ui/app-shell.ts): Custom Web Component `<app-shell>` implementing the complete Electron GUI (authentication screens, room directory, chat stream, audio recorder, modals).
- [qr.ts](file:///c:/Users/dev/source/repos/linda-pear/src/ui/qr.ts) & [qr-core.ts](file:///c:/Users/dev/source/repos/linda-pear/src/ui/qr-core.ts): QR code rendering and video stream scanning.
- [wallpapers.ts](file:///c:/Users/dev/source/repos/linda-pear/src/ui/wallpapers.ts): Preset chat wallpapers and background styles.
- [avatar.ts](file:///c:/Users/dev/source/repos/linda-pear/src/util/avatar.ts), [bytes.ts](file:///c:/Users/dev/source/repos/linda-pear/src/util/bytes.ts), [hashtag.ts](file:///c:/Users/dev/source/repos/linda-pear/src/util/hashtag.ts), [id.ts](file:///c:/Users/dev/source/repos/linda-pear/src/util/id.ts): Utility functions for deterministic color generation, size formatting, hashtag parsing, and ID generation.

---

### 🖥️ `electron/` (Desktop Shell)
- [main.cjs](file:///c:/Users/dev/source/repos/linda-pear/electron/main.cjs): Electron main process. Configures native window settings, security permissions (microphone capture for voice notes, screen capture, clipboard), and boots `index.html`.
- [preload.cjs](file:///c:/Users/dev/source/repos/linda-pear/electron/preload.cjs): Safe preload bridge for system-level APIs.

---

### 📱 `mobile/` (React Native / Expo Mobile App)
- [App.tsx](file:///c:/Users/dev/source/repos/linda-pear/mobile/App.tsx): Root React Native component with theme and navigation containers.
- [mobile/worklet/entry.ts](file:///c:/Users/dev/source/repos/linda-pear/mobile/worklet/entry.ts): The **mobile P2P engine**. Executes the shared `src/` core in a native background worklet (*Bare Kit*) and interfaces with the UI via asynchronous IPC frames.
- [mobile/worklet/media-server.ts](file:///c:/Users/dev/source/repos/linda-pear/mobile/worklet/media-server.ts): Mobile HTTP streaming server powered by `bare-http1`.
- `mobile/src/bare/`: Proxy clients bridging React Native hooks to the Bare background worklet.
- `mobile/src/screens/`: Screens for Room Chat, Room List, Contacts, Profile, QR Device Pairing, and Authentication.
- `mobile/src/components/`: Reusable components (Chat Bubbles, Video Player Modal, Audio Player, Contact List Item).

---

### 🧪 `test/` (Integration Test Suite)
- [session.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/session.test.ts): Spawns two full `Session` instances communicating over an in-process testnet DHT to test end-to-end sync and write grants.
- [room.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/room.test.ts): Tests Autobase ordering, message mutations, emoji reactions, and moderation rules.
- [security.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/security.test.ts): Verifies security boundaries against forged entries and unauthorized writers.
- [media-stream.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/media-stream.test.ts) & [media-range.test.ts](file:///c:/Users/dev/source/repos/linda-pear/test/media-range.test.ts): Validates chunked HTTP media streaming.

---

## 4. Key Operational Workflows

### A. Account Creation & Unlock
1. On launch, `storage.ts` checks for an existing `identity.json`.
2. **If new**: `mnemonic.ts` generates a 12-word phrase, deriving an Ed25519 keypair. The user chooses a passphrase, which encrypts the private key via Argon2id into `identity.json`.
3. **If existing**: The user enters their passphrase, `storage.ts` decrypts the secret key, and `Session` initializes.

### B. Sending a Chat Message
1. User enters text and sends.
2. `Session` calls `room.postMessage()`.
3. The message body is encrypted with the room's current *Epoch Key*.
4. Autobase appends the entry to the user's local Hypercore.
5. Hyperswarm pushes new blocks to connected room peers.
6. Each peer's deterministic `apply()` function validates the author, indexes the entry in the linearized message view, and notifies the UI.

### C. File Sharing & Range Streaming
1. User attaches a video or audio file.
2. `FileStore` ([drive.ts](file:///c:/Users/dev/source/repos/linda-pear/src/files/drive.ts)) writes the binary data to the user's local Hyperdrive.
3. A chat message containing the file metadata (`driveKey`, path, size, MIME type) is published.
4. The file automatically appears in both the chat feed and the **Room Files** tab.
5. When a peer clicks play, their local media player requests byte slices from the internal HTTP server (`media-server.ts`).
6. The server streams requested chunks directly over the P2P swarm, enabling instant playback without downloading the entire file first.
