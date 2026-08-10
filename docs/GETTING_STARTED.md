# 🚀 Getting Started

## Prerequisites

- **Node.js 20+** (CI builds on 24; the Electron toolchain needs 20 or newer).
- **npm** — `package-lock.json` is the checked-in lockfile. A `.yarnrc` exists
  for historical reasons, but `npm ci` is what the release workflow runs.
- **Android Studio** — only for Android builds.

## Install and run

```bash
git clone https://github.com/scobru/linda.git
cd linda
npm install
npm run dev
```

The dev server binds port 5173 with `strictPort: true`, so it fails loudly
instead of silently moving if the port is taken. Set `PORT` to change it.

On first launch the client connects to the public Zen relay hard-coded in
`src/App.tsx` and bootstraps an empty graph. Create an account from the auth
screen: the keypair is derived from your username and password, so **the same
credentials always regenerate the same identity, and there is no recovery path
if you lose them.**

## Configuration

Copy `.env.example` to `.env.local` and fill in what you need:

| Variable | Used by | Effect if unset |
| :--- | :--- | :--- |
| `VITE_RELAY_URL` | Wormhole async file transfer | Wormhole uploads fail; direct WebRTC transfers still work. |
| `VITE_AUTH_TOKEN` | Wormhole relay auth | File transfer is disabled and reported as unconfigured; nothing falls back to a shared default. |
| `RELAY_HOST` | `simple-relay.js` | Defaults to localhost behaviour. |
| `GEMINI_API_KEY` | `npm run bot:gemini` | The Gemini bot cannot start. |
| `VITE_BASE_PATH` | Build only | Defaults to `/`. Must be `./` for Electron and Capacitor. |

`.env` and `.env*.local` are gitignored. Keep them that way.

## Scripts

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Vite dev server on :5173. |
| `npm run build` | `tsc -b` then `vite build` into `dist/`. |
| `npm test` | Vitest in watch mode (`npx vitest run` for one shot). |
| `npm run lint` | ESLint over the repo. See the caveat below. |
| `npm run relay` | Local Zen relay on :8765, storage in `radata_storage/`. |
| `npm run bot` / `npm run bot:gemini` | Chat bots joining a channel by id or invite link. |
| `npm run android` | Web build, `cap sync`, then open Android Studio. |
| `npm run electron:dev` | Electron shell against the dev server. |
| `npm run electron:build` | Packaged desktop app via electron-builder. |

## Running a relay

Relays are blind: they replicate the encrypted graph and verify signatures, and
they never see plaintext. Running your own is the way to stop depending on the
default public relay.

```bash
npm run relay          # node simple-relay.js, port 8765
```

Or in Docker, with graph data persisted to `./radata`:

```bash
docker compose up -d
```

To point the client at your relay, edit the `relays` array in `src/App.tsx`.
This is currently hard-coded rather than environment-driven — see the caveats
below.

## Platform builds

**Desktop (Electron).** `npm run electron:build` produces installers via
`.electron-builder.json`. Because the app loads over `file:`, the build sets
`VITE_BASE_PATH=./`, the router switches to `HashRouter`, and the service worker
is skipped.

**Android (Capacitor).** `npm run android` builds the web assets, syncs them
into `android/`, and opens Android Studio. Configuration lives in
`capacitor.config.ts`.

**Web.** Any static host works. `vercel.json` rewrites all routes to
`index.html` so deep links like `/chat/<pub>` resolve.

## Verifying a change

```bash
npx tsc -b        # type check — currently clean
npx vitest run    # 10 tests across 2 files
```

## Known caveats

- **`npm run lint` currently fails**, not because of lint errors but because a
  globally installed ESLint 8 shadows the local ESLint 9 flat config:
  `TypeError: Error while loading rule '@typescript-eslint/no-unused-expressions'`.
  Run `npx eslint .` from within the project, or uninstall the global ESLint.
- **The relay list is hard-coded** in `src/App.tsx`. Self-hosters must edit
  source rather than set an environment variable.
- **Test coverage is thin** — the two suites cover `utils/ui` and `utils/avatar`
  only. Messaging, group, and crypto flows are exercised manually.
