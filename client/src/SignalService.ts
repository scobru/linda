import {
  KeyHelper,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
} from '@privacyresearch/libsignal-protocol-typescript';
import { SignalStore } from './SignalStore';
import { DataBase } from 'shogun-core';
import { generateSecureRandomInt } from './utils/crypto';

interface SignalPreKey {
  keyId: number;
  publicKey: string;
}

interface SignalSignedPreKey extends SignalPreKey {
  signature: string;
}

interface SignalBundle {
  username: string;
  uniqueUsername?: string;
  registrationId: number;
  identityKey: string;
  signedPreKey: SignalSignedPreKey;
  preKeys: SignalPreKey[];
}

/**
 * SignalService
 *
 * Bridges shogun-core DataBase with the Signal Protocol.
 * - initSession(): Ensure Signal keys exist after auth, backup/restore to GunDB
 * - encrypt/decrypt: standard Signal Protocol E2EE
 *
 * All GunDB interactions go through this.db (shogun-core DataBase),
 * never touching raw GunDB directly.
 */

export function isValidSignalBundle(data: unknown): data is SignalBundle {
  if (!data || typeof data !== "object") {
    console.warn("[SignalService] Bundle validation failed: data is null or not an object", data);
    return false;
  }
  const bundle = data as Record<string, unknown>;
  if (typeof bundle.username !== "string") {
    console.warn("[SignalService] Bundle validation failed: username is not a string", bundle.username);
    return false;
  }
  if (typeof bundle.registrationId !== "number") {
    console.warn("[SignalService] Bundle validation failed: registrationId is not a number", bundle.registrationId);
    return false;
  }
  if (typeof bundle.identityKey !== "string") {
    console.warn("[SignalService] Bundle validation failed: identityKey is not a string", bundle.identityKey);
    return false;
  }
  if (bundle.uniqueUsername !== undefined && typeof bundle.uniqueUsername !== "string") {
    console.warn("[SignalService] Bundle validation failed: uniqueUsername is defined but not a string", bundle.uniqueUsername);
    return false;
  }

  if (!bundle.signedPreKey || typeof bundle.signedPreKey !== "object") {
    console.warn("[SignalService] Bundle validation failed: signedPreKey is missing or not an object", bundle.signedPreKey);
    return false;
  }
  const spk = bundle.signedPreKey as Record<string, unknown>;
  if (typeof spk.keyId !== "number") {
    console.warn("[SignalService] Bundle validation failed: signedPreKey.keyId is not a number", spk.keyId);
    return false;
  }
  if (typeof spk.publicKey !== "string") {
    console.warn("[SignalService] Bundle validation failed: signedPreKey.publicKey is not a string", spk.publicKey);
    return false;
  }
  if (typeof spk.signature !== "string") {
    console.warn("[SignalService] Bundle validation failed: signedPreKey.signature is not a string", spk.signature);
    return false;
  }

  if (!Array.isArray(bundle.preKeys)) {
    console.warn("[SignalService] Bundle validation failed: preKeys is not an array", bundle.preKeys);
    return false;
  }
  for (let i = 0; i < (bundle.preKeys as any[]).length; i++) {
    const preKey = (bundle.preKeys as any[])[i];
    if (!preKey || typeof preKey !== "object") {
       console.warn(`[SignalService] Bundle validation failed: preKey at index ${i} is not an object`, preKey);
       return false;
    }
    if (typeof preKey.keyId !== "number") {
       console.warn(`[SignalService] Bundle validation failed: preKey at index ${i} keyId is not a number`, preKey.keyId);
       return false;
    }
    if (typeof preKey.publicKey !== "string") {
       console.warn(`[SignalService] Bundle validation failed: preKey at index ${i} publicKey is not a string`, preKey.publicKey);
       return false;
    }
  }

  return true;
}

export class SignalService {
  private store: SignalStore;
  private db: DataBase ;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private resetCooldowns: Map<string, number> = new Map();
  private pubkeyCache: Map<string, string> = new Map();

  constructor(db: DataBase) {
    this.db = db;
    // The store eagerly loads from localStorage in its constructor
    this.store = new SignalStore(db.getUserPub() || "default");
  }

  public get initialized(): boolean {
    return this.isInitialized;
  }

  public async waitReady(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;
    // If not even started, we might need to wait or throw
    let retries = 0;
    while (!this.initPromise && !this.isInitialized && retries < 10) {
      await new Promise(r => setTimeout(r, 500));
      retries++;
    }
    if (this.initPromise) return this.initPromise;
    if (!this.isInitialized) throw new Error('SignalService not initializing');
  }

  async initSession(username: string, uniqueUsername?: string) {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log('[SignalService] Initializing session...');
      await this.store.init();
      // Check if we have local Signal keys
      let existingKey = await this.store.getIdentityKeyPair();

      // Validation: Curve25519 keys must be exactly 32 bytes.
      // Corrupted keys from a previous storage bug might have wrong lengths.
      if (existingKey) {
        const isValid = existingKey.privKey && existingKey.pubKey &&
                       existingKey.privKey.byteLength === 32 && 
                       existingKey.pubKey.byteLength === 32;

        if (!isValid) {
          console.warn('[SignalService] Corrupted local identity keys detected. Clearing store to allow fresh start.');
          await this.store.clearAll();
          existingKey = undefined;
        }
      }

      if (!existingKey) {
        // Try to restore from GunDB backup first (cross-device)
        console.log('[SignalService] Searching for Signal key backup on GunDB...');
        const restored = await this.restoreKeysFromGun();
        if (restored) {
          console.log('[SignalService] Keys restored from GunDB backup!');
        } else {
          // No backup found or failed to load — generate fresh keys
          console.warn('[SignalService] No valid keys found on GunDB, generating new bundle...');
          await this.generateAndPublishBundle(username, uniqueUsername);
          await this.backupKeysToGun();
        }
      }
      
      try {
        // Persist alias and unique username for message routing and identity
        await this.persistAlias(username, uniqueUsername);
        // Check prekey health
        await this.checkAndRotatePreKeys();
      } catch (e) {
        console.warn('[SignalService] Post-init steps failed (non-critical):', e);
      }

      this.isInitialized = true;
      this.initPromise = null;
      console.log('[SignalService] Initialization complete.');
    })();
    return this.initPromise;
  }

  // ── Encrypted key backup (cross-device) ─────────────────────

  /**
   * Backup all Signal keys to the user's private GunDB node.
   * Uses db.userPut() — data under user space is auto-encrypted by SEA.
   */
  private async backupKeysToGun(): Promise<void> {
    try {
      // Use the raw exported JSON string directly. 
      // ShogunCore's userPut handles encryption via SEA.
      const snapshot = this.store.exportAll();
      await this.db.userPut('signal_keystore_v6', { payload: snapshot });
      console.log('[SignalService] Keys backed up to GunDB');
    } catch (e) {
      console.error('[SignalService] Key backup failed:', e);
      // We don't throw here to avoid crashing the whole session if backup fails
    }
  }

  /**
   * Try to restore Signal keys from the user's private GunDB node.
   * Returns true if keys were found and restored, false otherwise.
   */
  private async restoreKeysFromGun(): Promise<boolean> {
    // Retry because GunDB might take a moment to sync the user node
    for (let i = 0; i < 6; i++) {
      try {
        const wrapper = await this.db.userGet('signal_keystore_v6') as any;
        if (wrapper && wrapper.payload && typeof wrapper.payload === 'string') {
          const data = wrapper.payload;
          let jsonStr = data;

          // Robust detection: If it doesn't look like JSON, try decoding from B64/URI
          if (!data.trim().startsWith('{')) {
            try {
              jsonStr = decodeURIComponent(atob(data));
            } catch(e) {
              jsonStr = data;
            }
          }
          
          await this.store.importAll(jsonStr);
          
          // Validate restored keys immediately
          const key = await this.store.getIdentityKeyPair();
          const isValid = !!(key && key.privKey && key.pubKey &&
                         key.privKey.byteLength === 32 && 
                         key.pubKey.byteLength === 32);

          if (isValid) {
            console.log(`[SignalService] Keys restored from GunDB (attempt ${i + 1})`);
            return true;
          } else {
            console.warn(`[SignalService] Restore attempt ${i + 1}: Restored keys are invalid/corrupted.`, {
              hasKey: !!key,
              privLen: key?.privKey?.byteLength,
              pubLen: key?.pubKey?.byteLength
            });
            await this.store.clearAll();
          }
        }
      } catch (e: any) {
        if (e && e.err !== 'notfound') {
          console.error(`[SignalService] Restore attempt ${i + 1} failed:`, e);
        }
      }
      // Wait between retries
      await new Promise(r => setTimeout(r, 1000 + (i * 500)));
    }
    return false;
  }

  /**
   * Persist username→pubkey mapping so we can recover the alias
   * after a page refresh (GunDB recall often loses `alias`).
   */
  private async persistAlias(username: string, uniqueUsername?: string): Promise<void> {
    const pub = this.db.getUserPub();
    if (!pub) return;
    // Save to localStorage for instant local lookup
    localStorage.setItem('signal_alias', username);
    if (uniqueUsername) {
      localStorage.setItem('signal_unique_username', uniqueUsername);
    }
    localStorage.setItem('signal_pub', pub);
    // Save to a public GunDB node so any peer can resolve it
    try {
      const aliasPayload: Record<string, string> = { alias: username };
      if (uniqueUsername) aliasPayload.uniqueUsername = uniqueUsername;
      await this.db.Put(`signal_aliases/${pub}`, aliasPayload);
      
      // Also save to a global registry for unique usernames if provided
      if (uniqueUsername) {
        // Ensure it starts with @ for consistency in lookups
        const normalized = uniqueUsername.startsWith('@') ? uniqueUsername : `@${uniqueUsername}`;
        await this.db.Put(`signal_unique_usernames/${normalized}`, pub);
      }
    } catch (e) {
      console.warn('[SignalService] Failed to persist alias to GunDB:', e);
    }
  }



  // sessionRecall was removed as ShogunCore handles session restoration.

  // ── Key management ───────────────────────────────────────────

  private async generateAndPublishBundle(username: string, uniqueUsername?: string): Promise<void> {
    const registrationId = KeyHelper.generateRegistrationId();
    const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
    const signedPreKeyId = generateSecureRandomInt(100000);
    const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);

    const preKeys = [];
    for (let i = 0; i < 10; i++) {
      const preKeyId = generateSecureRandomInt(100000);
      const preKey = await KeyHelper.generatePreKey(preKeyId);
      preKeys.push(preKey);
    }
    await this.store.bulkStorePreKeys(preKeys);

    await this.store.storeIdentityKey(identityKeyPair);
    await this.store.storeRegistrationId(registrationId);
    await this.store.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair);

    // Construct a FLAT object where all nested JSON is strictly Base64 encoded.
    // GunDB SEA strictly requires objects for nodes, but fails to sign objects containing
    // JSON strings with escaped quotes. A flat object of Base64 strings avoids BOTH bugs!
    const bundlePayload: any = {
      username,
      registrationId,
      identityKey: this.ab2b64(identityKeyPair.pubKey),
      signedPreKeyB64: btoa(JSON.stringify({
        keyId: signedPreKeyId,
        publicKey: this.ab2b64(signedPreKey.keyPair.pubKey),
        signature: this.ab2b64(signedPreKey.signature),
      })),
      preKeysB64: btoa(JSON.stringify(preKeys.map(pk => ({
        keyId: pk.keyId,
        publicKey: this.ab2b64(pk.keyPair.pubKey),
      })))),
    };

    if (uniqueUsername) {
      bundlePayload.uniqueUsername = uniqueUsername;
    }

    try {
      await this.db.userPut('signal_bundle_v6', bundlePayload);
    } catch (e) {
      console.error('[SignalService] GunDB err during bundle publish:', e);
      throw new Error('Failed to publish Signal bundle');
    }
  }

  async checkAndRotatePreKeys(): Promise<void> {
    const remaining = this.store.getPreKeyCount();

    // Threshold to trigger rotation
    if (remaining > 5) return;

    console.log(`[SignalService] Generating new pre-keys to replenish bundle...`);
    const newPreKeys = [];
    for (let i = 0; i < 15; i++) {
      const preKeyId = generateSecureRandomInt(100000);
      const preKey = await KeyHelper.generatePreKey(preKeyId);
      newPreKeys.push(preKey);
    }
    await this.store.bulkStorePreKeys(newPreKeys);

    // Backup the newly generated local keys
    await this.backupKeysToGun();

    // Fetch existing bundle and append the new public keys
    try {
      const bundleData = await this.db.userGet('signal_bundle_v6') as any;
      if (bundleData && bundleData.username) {
        let parsedPreKeys: any[] = [];
        try {
          if (bundleData.preKeysB64) {
            const raw = atob(bundleData.preKeysB64);
            parsedPreKeys = JSON.parse(raw.startsWith('%') ? decodeURIComponent(raw) : raw);
          } else if (bundleData.preKeys && typeof bundleData.preKeys === 'string') {
             parsedPreKeys = JSON.parse(bundleData.preKeys);
          } else if (Array.isArray(bundleData.preKeys)) {
             parsedPreKeys = bundleData.preKeys;
          }
        } catch (e) {
          console.warn('[SignalService] Failed to parse bundle pre-keys during rotation:', e);
        }

        const combinedPreKeys = [
          ...parsedPreKeys,
          ...newPreKeys.map(pk => ({
            keyId: pk.keyId,
            publicKey: this.ab2b64(pk.keyPair.pubKey),
          }))
        ];

        // Cap to 50 pre-keys to avoid GunDB bloating
        const cappedPreKeys = combinedPreKeys.slice(-50);

        const updatedPayload: any = {
          username: bundleData.username,
          registrationId: typeof bundleData.registrationId === 'string' ? parseInt(bundleData.registrationId, 10) : bundleData.registrationId,
          identityKey: bundleData.identityKey,
          signedPreKeyB64: bundleData.signedPreKeyB64 || (bundleData.signedPreKey ? btoa(typeof bundleData.signedPreKey === 'string' ? bundleData.signedPreKey : JSON.stringify(bundleData.signedPreKey)) : ''),
          preKeysB64: btoa(JSON.stringify(cappedPreKeys))
        };

        if (bundleData.uniqueUsername) {
          updatedPayload.uniqueUsername = bundleData.uniqueUsername;
        }

        try {
          await this.db.userPut('signal_bundle_v6', updatedPayload);
          console.log(`[SignalService] Successfully published ${newPreKeys.length} new pre-keys to bundle.`);
        } catch (e) {
          console.error('[SignalService] GunDB err appending pre-keys:', e);
        }
      }
    } catch (e) {
      console.warn(`[SignalService] Failed to append new pre-keys to GunDB bundle.`, e);
    }
  }

  // ── GunDB helpers ────────────────────────────────────────────

  async getMyPubKey(): Promise<string> {
    const pub = this.db.getUserPub();
    if (!pub) throw new Error('User not logged in');
    return pub;
  }

  async getPubKeyFromUsername(username: string): Promise<string> {
    if (!username) throw new Error('Username/Pubkey is required');
    // SEA pubkeys are usually 43 or 87 chars. Most aliases are short.
    if (username.length >= 30 && !username.startsWith('@')) return username;

    // Check local cache first
    const cached = this.pubkeyCache.get(username);
    if (cached) return cached;

    console.log(`[SignalService] Resolving pubkey for: ${username}`);
    // Increased retries and wait time for better sync coverage
    for (let i = 0; i < 6; i++) {
      try {
        // 0. Try resolving via unique usernames registry (new logic)
        if (username.startsWith('@')) {
          const uniquePubKey = await this.db.Get(`signal_unique_usernames/${username}`);
          if (uniquePubKey && typeof uniquePubKey === 'string' && uniquePubKey.length >= 30) {
            this.pubkeyCache.set(username, uniquePubKey);
            console.log(`[SignalService] Resolved via Unique Username: ${username} -> ${uniquePubKey}`);
            return uniquePubKey;
          }
        }

        // 1. Try resolving via global nicknames registry (fixes WebAuthn users)
        const globalNickPubKey = await this.db.Get(`signal_global_nicknames/${username}`);
        if (globalNickPubKey && typeof globalNickPubKey === 'string' && globalNickPubKey.length >= 30) {
          this.pubkeyCache.set(username, globalNickPubKey);
          console.log(`[SignalService] Resolved via Global Nicknames: ${username} -> ${globalNickPubKey}`);
          return globalNickPubKey;
        }

        // 2. Fallback to standard GunDB alias lookup (~@username)
        const data = await this.db.Get(`~@${username}`) as any;
        if (data && typeof data === 'object') {
          // Filter out GunDB internal fields and ensure it starts with ~
          const pubNode = Object.keys(data).find(k => k.startsWith('~') && k !== '_' && k.length > 5);
          if (pubNode) {
            const pub = pubNode.slice(1);
            if (pub.length >= 30) {
              this.pubkeyCache.set(username, pub);
              console.log(`[SignalService] Resolved via Alias: ${username} -> ${pub}`);
              return pub;
            }
          }
        }
      } catch (e) {
        // Silent retry for GunDB sync
      }
      // Wait longer each time: 500ms, 1s, 2s, 3s, 4s...
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
    throw new Error(`User "${username}" not found on GunDB after 6 attempts. Check nickname/alias existence.`);
  }

  private async getBundleFromUsername(usernameOrPub: string): Promise<SignalBundle> {
    let pubKey = usernameOrPub;
    if (pubKey.length < 30 || pubKey.startsWith('@')) {
      pubKey = await this.getPubKeyFromUsername(usernameOrPub);
    }
    try {
      const data = await this.db.Get(`~${pubKey}/signal_bundle_v6`) as any;
      if (!data) throw new Error(`Bundle not found for ${pubKey}`);
      
      let parsed: SignalBundle;
      
      // Handle the new flat object structure
      if (data.username && (data.signedPreKeyB64 || data.signedPreKey)) {
        let spk;
        if (data.signedPreKeyB64) {
          const raw = atob(data.signedPreKeyB64);
          spk = JSON.parse(raw.startsWith('%') ? decodeURIComponent(raw) : raw);
        } else {
          spk = typeof data.signedPreKey === 'string' ? JSON.parse(data.signedPreKey) : data.signedPreKey;
        }

        let pK;
        if (data.preKeysB64) {
          const raw = atob(data.preKeysB64);
          pK = JSON.parse(raw.startsWith('%') ? decodeURIComponent(raw) : raw);
        } else {
          pK = typeof data.preKeys === 'string' ? JSON.parse(data.preKeys) : data.preKeys;
        }

        parsed = {
          username: data.username,
          uniqueUsername: data.uniqueUsername,
          registrationId: parseInt(data.registrationId, 10),
          identityKey: data.identityKey,
          signedPreKey: spk,
          preKeys: pK,
        };
      } else if (typeof data === 'string') {
        const jsonStr = data.startsWith('{') ? data : decodeURIComponent(atob(data));
        parsed = JSON.parse(jsonStr);
      } else {
        parsed = data as SignalBundle;
      }
      
      if (!isValidSignalBundle(parsed)) {
        throw new Error(`Invalid SignalBundle format for ${pubKey}`);
      }
      return parsed;
    } catch (e) {
      console.error(`Failed to parse bundle from ${pubKey}:`, e);
      throw new Error(`Failed to get bundle for ${pubKey}`);
    }
  }

  // ── Encrypt / Decrypt ────────────────────────────────────────

  async encryptMessage(recipientUsernameOrPub: string, message: string) {
    let pubKey = recipientUsernameOrPub;
    if (pubKey.length < 30) {
      pubKey = await this.getPubKeyFromUsername(recipientUsernameOrPub);
    }
    const address = new SignalProtocolAddress(pubKey, 1);
    const sessionExists = await this.store.loadSession(address.toString());

    if (!sessionExists) {
      const bundle = await this.getBundleFromUsername(pubKey);
      console.log(`[SignalService] Building NEW session for ${pubKey.slice(0, 8)}... (RegistrationID: ${bundle.registrationId})`);
      const builder = new SessionBuilder(this.store, address);

      try {
        await builder.processPreKey({
          registrationId: bundle.registrationId,
          identityKey: this.b642ab(bundle.identityKey),
          signedPreKey: {
            keyId: bundle.signedPreKey.keyId,
            publicKey: this.b642ab(bundle.signedPreKey.publicKey),
            signature: this.b642ab(bundle.signedPreKey.signature),
          },
          preKey: undefined,
        });
        console.log(`[SignalService] Session successfully built for ${pubKey.slice(0, 8)}`);
      } catch (e: any) {
        console.error(`[SignalService] Failed to process pre-key for ${pubKey.slice(0, 8)}:`, e.message);
        throw e;
      }
    } else {
      console.log(`[SignalService] Using existing session for ${pubKey.slice(0, 8)}`);
    }

    const cipher = new SessionCipher(this.store, address);
    return cipher.encrypt(new TextEncoder().encode(message).buffer);
  }

  async decryptMessage(senderUsernameOrPub: string, ciphertext: { type: number; body: string }) {
    let pubKey = senderUsernameOrPub;
    if (pubKey.length < 30) {
      pubKey = await this.getPubKeyFromUsername(senderUsernameOrPub);
    }
    const address = new SignalProtocolAddress(pubKey, 1);
    const cipher = new SessionCipher(this.store, address);

    try {
      let plaintext: ArrayBuffer;
      if (ciphertext.type === 3) {
        plaintext = await cipher.decryptPreKeyWhisperMessage(ciphertext.body, 'binary');
      } else {
        plaintext = await cipher.decryptWhisperMessage(ciphertext.body, 'binary');
      }
      return new TextDecoder().decode(plaintext);
    } catch (e: any) {
      console.error(`[SignalService] Decryption error for ${senderUsernameOrPub.slice(0, 8)} (Type ${ciphertext.type}):`, e.message);
      throw e;
    }
  }

  // ── Session Healing ──────────────────────────────────────────

  /**
   * Clears the local Signal session for a given contact.
   * This forces the next encrypt() to fetch a fresh bundle and build a new session.
   */
  async resetSession(contactUsernameOrPub: string): Promise<void> {
    const now = Date.now();
    const lastReset = this.resetCooldowns.get(contactUsernameOrPub) || 0;
    if (now - lastReset < 10000) {
      console.log(`[SignalService] Reset for ${contactUsernameOrPub} throttled (cooldown).`);
      return;
    }
    this.resetCooldowns.set(contactUsernameOrPub, now);

    try {
      let pubKey = contactUsernameOrPub;
      if (pubKey.length < 30) {
        pubKey = await this.getPubKeyFromUsername(contactUsernameOrPub);
      }
      const address = new SignalProtocolAddress(pubKey, 1);
      const addrStr = address.toString();

      // Thoroughly clear all fragments related to this contact
      await this.store.removeAllSessions(addrStr);
      await this.store.removeIdentity(addrStr);


      console.warn(`[SignalService] Hard reset session and identity for ${pubKey} (${addrStr})`);

      // Experimental: clearing inbox history causes GunDB HAM TypeErrors in some environments.
      // Disabled for stability.
      // await this.clearInboxForSender(pubKey);
    } catch (e) {
      console.error(`[SignalService] Reset failed for ${contactUsernameOrPub}:`, e);
    }
  }


  // ── Binary helpers ───────────────────────────────────────────

  private ab2b64(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private b642ab(b64: string): ArrayBuffer {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
