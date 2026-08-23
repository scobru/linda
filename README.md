# linda-pear

P2P, serverless encrypted messenger built on the [Holepunch](https://holepunch.to) stack (autobase, hyperbee, hyperswarm, corestore). Desktop (Electron) and mobile (Expo + [react-native-bare-kit](https://github.com/holepunchto/react-native-bare-kit)) clients share one core in [`src/`](src/).

Same architecture Keet (Holepunch's own flagship app) uses under the hood — same `react-native-bare-kit` version, same primitives.

## Repo layout

```
src/           shared core: identity, rooms (autobase), network (hyperswarm RPC), calls (WebRTC), files (hyperdrive)
electron/      desktop main process (thin wrapper, no app logic)
mobile/        Expo/React Native app; embeds src/ inside a Bare runtime worklet (mobile/worklet/)
test/          integration tests against real Hyperswarm
```

## Desktop (Electron)

```bash
npm install
npm run start          # dev, single identity
npm run start:a        # dev, separate storage dir (2nd peer for local testing)
npm run start:b
```

Build a distributable:

```bash
npm run make            # electron-forge → out/make/ (msix on win32, zip on darwin/linux)
```

### Publishing (Pear P2P)

The app self-updates via the `upgrade` key in `package.json` (`pear://fe1g7q...`). To push a new version:

```bash
npm run pear:stage -- --dry-run   # preview
npm run pear:stage                # publish
npm run pear:seed                 # announce on the network (keep running)
```

The ignore list in `pear:stage` already excludes `node_modules`, `.dev-storage` (local test identities), build caches, and the `mobile/` Android build output — see the script in `package.json` if you need to adjust it.

To include the native Windows installer in the same `pear://` link (so `pear install` works, not just `pear run`):

```bash
npm run make
pear build --package package.json --target <empty-dir> --win32-x64-app out/make/msix/x64/linda-pear.msix
# copy <empty-dir>/by-arch into the repo root, then npm run pear:stage again
```

## Mobile (Expo)

```bash
cd mobile
npm run worklet          # rebuild the Bare worklet bundle (needed after touching src/ or worklet/entry.ts)
npm run android           # dev build + install on device/emulator
npm run ios
```

Release APK:

```bash
cd mobile/android
./gradlew.bat assembleRelease
```

**Monorepo gotcha:** Expo CLI's workspace-root auto-detection resolves the wrong directory for this repo's npm workspace layout, breaking the release JS bundle step. Two things paper over it — don't remove without testing a release build:
- `/index.js` at the repo root (bridges to `mobile/index.js`)
- `root`/`entryFile` overrides in `mobile/android/app/build.gradle`

## Distribution

- **Desktop**: [GitHub Releases](https://github.com/scobru/linda-pear/releases) (`.msix`, self-signed — Windows will warn on install) or `pear://fe1g7q7wqqjundb7t3pdz93tz7n9cm7sakr46mdg6ipg4tk15xno`
- **Android**: [GitHub Releases](https://github.com/scobru/linda-pear/releases) (`.apk`, debug-signed beta)
- **iOS**: not built yet
- **macOS/Linux desktop**: not built yet (electron-forge targets exist, just not run)

## Known issues

- Release APK is unsigned beyond the RN debug keystore — fine for beta distribution, not for a Play Store submission.
- Push notifications only fire while the app process is alive (foreground or backgrounded, not force-quit) — there's no server, so nothing can wake a fully-killed app. A relay to fix that would need to be opt-in and content-blind to keep the P2P privacy model.

## Testing

```bash
npm test                        # room/autobase unit tests
node test/p2p-integration.ts    # two real Session instances over real Hyperswarm (build with esbuild first, see test.js for the pattern)
```
