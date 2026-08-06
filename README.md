# Linda

**Linda** is a decentralised, end-to-end encrypted messaging platform. It uses
**[Zen](https://github.com/scobru/zen)** for peer-to-peer graph synchronisation
and **WebRTC** for direct file transfers and audio/video calls.

There is no application server and no user database. Your keypair is your
account, and relays replicate ciphertext they cannot read. The cryptography and
messaging services live in the **[`linda-core`](https://github.com/scobru/linda-core)**
library.

---

## 🚀 Key Features

- 💬 **P2P 1:1 messaging** — Zen authenticated writes with ECDH-derived keys.
- 👥 **Encrypted group conversations** — shared AES-GCM key, invite-based key
  exchange, encrypted key escrow so members survive a cleared browser profile.
- 🏷️ **Unique handles (`@username`)** — human-readable names mapped to public
  keys in a decentralised graph index.
- 📁 **P2P file transfer and Wormhole** — WebRTC DataChannels for online peers,
  with an encrypted temporary relay as the async fallback.
- 📞 **P2P audio and video calls** — WebRTC sessions with ICE signalling carried
  over Zen graph rooms.
- 🔐 **Self-custodial identity** — a `secp256k1` keypair derived deterministically
  from your credentials. No recovery path, by design.
- 🖥️ **Web, Desktop, and Android** from one codebase.

---

## 🏗️ Architecture at a Glance

### Core service layer (`linda-core`)

| Service | Responsibility |
| :--- | :--- |
| `CommunicationService` | Identity bundles, 1:1 signalling, room routing, inbox pokes and certificates. |
| `GroupService` | Group lifecycle, AES-GCM encryption, member roles, key distribution and escrow. |
| `CallingService` | WebRTC audio/video call signalling. |
| `FileTransferService` | Chunked file streams over WebRTC DataChannels. |
| `WormholeService` | Encrypted binary relay fallback for offline delivery. |

### Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Desktop / Mobile**: Electron + Capacitor
- **Database**: [Zen P2P graph](https://github.com/scobru/zen)
- **UI**: Tailwind CSS + DaisyUI, OLED glassmorphic system described in [`DESIGN.md`](./DESIGN.md)

---

## 🛠️ Quickstart

```bash
git clone https://github.com/scobru/linda.git
cd linda
npm install
cp .env.example .env.local   # optional: needed for Wormhole transfers
npm run dev                  # http://localhost:5173
```

Run your own blind relay instead of the default public one:

```bash
npm run relay        # node simple-relay.js on :8765
# or
docker compose up -d
```

Build for other targets:

```bash
npm run electron:dev     # desktop shell
npm run android          # web build + cap sync + Android Studio
npm run build            # static web bundle in dist/
```

Full setup, environment variables, and platform notes:
**[docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md)**.

---

## 📚 Documentation

| Document | Contents |
| :--- | :--- |
| [docs/GETTING_STARTED.md](./docs/GETTING_STARTED.md) | Install, configure, run, build, and known caveats. |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Identity model, room routing, message flows, client composition. |
| [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) | Every graph path Linda reads and writes. |
| [docs/SECURITY.md](./docs/SECURITY.md) | Threat model, guarantees, and explicit limitations. |
| [ENCRYPTION_FLOW.md](./ENCRYPTION_FLOW.md) | Cryptographic detail, in Italian. |
| [DESIGN.md](./DESIGN.md) | Colour, typography, motion, and component specification. |
| [docs/README.md](./docs/README.md) | Documentation index. |

---

## ✅ Project Status

Version `1.0.10`. Type check is clean and the test suite passes, but coverage is
limited to utility modules — messaging, group, and crypto flows are verified
manually. Before trusting Linda with anything sensitive, read
[docs/SECURITY.md](./docs/SECURITY.md): in particular, the identity keypair is
only as strong as the password it is derived from, and message metadata is
visible to relay operators.

---

## 📄 License

Part of the **Shogun Ecosystem**. MIT licensed.
