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
  if (!data || typeof data !== 'object') return false;
  const bundle = data as Record<string, unknown>;
  if (typeof bundle.username !== 'string') return false;
  if (typeof bundle.registrationId !== 'number') return false;
  if (typeof bundle.identityKey !== 'string') return false;

  if (!bundle.signedPreKey || typeof bundle.signedPreKey !== 'object') return false;
  if (typeof (bundle.signedPreKey as Record<string, unknown>).keyId !== 'number') return false;
  if (typeof (bundle.signedPreKey as Record<string, unknown>).publicKey !== 'string') return false;
  if (typeof (bundle.signedPreKey as Record<string, unknown>).signature !== 'string') return false;

  if (!Array.isArray(bundle.preKeys)) return false;
  for (const preKey of bundle.preKeys as Array<Record<string, unknown>>) {
    if (!preKey || typeof preKey !== 'object') return false;
    if (typeof preKey.keyId !== 'number') return false;
    if (typeof preKey.publicKey !== 'string') return false;
  }

  return true;
}

export class SignalService {
  private store: SignalStore;
  private db: DataBase;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private resetCooldowns: Map<string, number> = new Map();
  private pubkeyCache: Map<string, string> = new Map();

  constructor(db: DataBase) {
    this.db = db;
    // The store eagerly loads from localStorage in its constructor
    this.store = new SignalStore();
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

  async initSession(username: string) {
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
          await this.generateAndPublishBundle(username);
          await this.backupKeysToGun();
        }
      }
      // Persist alias for message routing and identity
      await this.persistAlias(username);

      // Check prekey health
      await this.checkAndRotatePreKeys();

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
    const snapshot = this.store.exportAll();
    const result = await this.db.userPut('signal_keystore', snapshot);
    if (result.error.length > 0) {
      console.error('[SignalService] Key backup failed:', result.error);
      throw new Error('Key backup failed');
    }
    console.log('[SignalService] Keys backed up to GunDB (encrypted)');
  }

  /**
   * Try to restore Signal keys from the user's private GunDB node.
   * Returns true if keys were found and restored, false otherwise.
   */
  private async restoreKeysFromGun(): Promise<boolean> {
    // Retry because GunDB might take a moment to sync the user node
    for (let i = 0; i < 3; i++) {
      try {
        const data = await this.db.userGet('signal_keystore');
        if (data && typeof data === 'string' && data.length > 50) {
          await this.store.importAll(data);
          
          // Validate restored keys immediately
          const key = await this.store.getIdentityKeyPair();
          const isValid = key && key.privKey && key.pubKey &&
                         key.privKey.byteLength === 32 && 
                         key.pubKey.byteLength === 32;

          if (isValid) {
            console.log(`[SignalService] Keys restored from GunDB (attempt ${i + 1})`);
            return true;
          } else {
            console.warn(`[SignalService] Restore attempt ${i + 1}: Restored keys are invalid/corrupted. Clearing.`);
            await this.store.clearAll();
          }
        }
      } catch (e) {
        console.error(`[SignalService] Restore attempt ${i + 1} failed:`, e);
      }
      // Wait 1.5s between retries
      await new Promise(r => setTimeout(r, 1500));
    }
    return false;
  }

  /**
   * Persist username→pubkey mapping so we can recover the alias
   * after a page refresh (GunDB recall often loses `alias`).
   */
  private async persistAlias(username: string): Promise<void> {
    const pub = this.db.getUserPub();
    if (!pub) return;
    // Save to localStorage for instant local lookup
    localStorage.setItem('signal_alias', username);
    localStorage.setItem('signal_pub', pub);
    // Save to a public GunDB node so any peer can resolve it
    try {
      await this.db.Put(`signal_aliases/${pub}`, { alias: username });
    } catch (e) {
      console.warn('[SignalService] Failed to persist alias to GunDB:', e);
    }
  }



  // sessionRecall was removed as ShogunCore handles session restoration.

  // ── Key management ───────────────────────────────────────────

  private async generateAndPublishBundle(username: string): Promise<void> {
    const registrationId = KeyHelper.generateRegistrationId();
    const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
    const signedPreKeyId = generateSecureRandomInt(100000);
    const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);

    const preKeys = [];
    for (let i = 0; i < 10; i++) {
      const preKeyId = generateSecureRandomInt(100000);
      const preKey = await KeyHelper.generatePreKey(preKeyId);
      preKeys.push(preKey);
      await this.store.storePreKey(preKeyId, preKey.keyPair);
    }

    await this.store.storeIdentityKey(identityKeyPair);
    await this.store.storeRegistrationId(registrationId);
    await this.store.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair);

    const bundleStr = {
      username,
      registrationId: registrationId.toString(),
      identityKey: this.ab2b64(identityKeyPair.pubKey),
      signedPreKey: JSON.stringify({
        keyId: signedPreKeyId,
        publicKey: this.ab2b64(signedPreKey.keyPair.pubKey),
        signature: this.ab2b64(signedPreKey.signature),
      }),
      preKeys: JSON.stringify(preKeys.map(pk => ({
        keyId: pk.keyId,
        publicKey: this.ab2b64(pk.keyPair.pubKey),
      }))),
    };

    // Publish to the user's GunDB node via shogun-core
    const result = await this.db.userPut('signal_bundle', bundleStr);
    if (result.error.length > 0) {
      console.error('[SignalService] GunDB err during bundle publish:', result.error);
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
      await this.store.storePreKey(preKeyId, preKey.keyPair);
    }

    // Backup the newly generated local keys
    await this.backupKeysToGun();

    // Fetch existing bundle and append the new public keys
    try {
      const bundleData = await this.db.userGet('signal_bundle');
      if (bundleData) {
        let bundle: SignalBundle;
        if (typeof bundleData === 'string') {
          bundle = JSON.parse(bundleData);
        } else {
          bundle = {
            username: (bundleData as any).username,
            registrationId: parseInt((bundleData as any).registrationId, 10),
            identityKey: (bundleData as any).identityKey,
            signedPreKey: typeof (bundleData as any).signedPreKey === 'string' 
              ? JSON.parse((bundleData as any).signedPreKey) 
              : (bundleData as any).signedPreKey,
            preKeys: typeof (bundleData as any).preKeys === 'string'
              ? JSON.parse((bundleData as any).preKeys)
              : (bundleData as any).preKeys,
          };
        }
        
        if (!isValidSignalBundle(bundle)) {
          throw new Error('Invalid SignalBundle format');
        }
        const currentPreKeys = bundle.preKeys || [];
        const combinedPreKeys = [
          ...currentPreKeys,
          ...newPreKeys.map(pk => ({
            keyId: pk.keyId,
            publicKey: this.ab2b64(pk.keyPair.pubKey),
          }))
        ];

        // Cap to 50 pre-keys to avoid GunDB bloating
        bundle.preKeys = combinedPreKeys.slice(-50);

        const updatedBundleStr = {
          username: bundle.username,
          registrationId: bundle.registrationId.toString(),
          identityKey: bundle.identityKey,
          signedPreKey: JSON.stringify(bundle.signedPreKey),
          preKeys: JSON.stringify(bundle.preKeys)
        };

        const result = await this.db.userPut('signal_bundle', updatedBundleStr);
        if (result.error.length > 0) {
           console.error('[SignalService] GunDB err appending pre-keys:', result.error);
        } else {
           console.log(`[SignalService] Successfully published ${newPreKeys.length} new pre-keys to bundle.`);
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
    if (username.length >= 30) return username;

    // Check local cache first
    const cached = this.pubkeyCache.get(username);
    if (cached) return cached;

    console.log(`[SignalService] Resolving pubkey for: ${username}`);
    // Increased retries and wait time for better sync coverage
    for (let i = 0; i < 6; i++) {
      try {
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
    if (pubKey.length < 30) {
      pubKey = await this.getPubKeyFromUsername(usernameOrPub);
    }
    try {
      const data = await this.db.Get(`~${pubKey}/signal_bundle`);
      if (!data) throw new Error(`Bundle not found for ${pubKey}`);
      
      let parsed: SignalBundle;
      if (typeof data === 'string') {
        parsed = JSON.parse(data);
      } else {
        parsed = {
          username: (data as any).username,
          registrationId: parseInt((data as any).registrationId, 10),
          identityKey: (data as any).identityKey,
          signedPreKey: typeof (data as any).signedPreKey === 'string'
            ? JSON.parse((data as any).signedPreKey)
            : (data as any).signedPreKey,
          preKeys: typeof (data as any).preKeys === 'string'
            ? JSON.parse((data as any).preKeys)
            : (data as any).preKeys,
        };
      }
      
      if (!isValidSignalBundle(parsed)) {
        throw new Error(`Invalid SignalBundle format for ${pubKey}`);
      }
      return parsed;
    } catch (e) {
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
      console.log(`[SignalService] Building new session for ${pubKey} using bundle (RegistrationID: ${bundle.registrationId})`);
      const builder = new SessionBuilder(this.store, address);

      await builder.processPreKey({
        registrationId: bundle.registrationId,
        identityKey: this.b642ab(bundle.identityKey),
        signedPreKey: {
          keyId: bundle.signedPreKey.keyId,
          publicKey: this.b642ab(bundle.signedPreKey.publicKey),
          signature: this.b642ab(bundle.signedPreKey.signature),
        },
        // Omit One-Time PreKey to prevent exhaustion. X3DH gracefully falls back
        // to using the SignedPreKey, allowing infinite session rebirths from a static bundle.
        preKey: undefined,
      });
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

    let plaintext: ArrayBuffer;
    if (ciphertext.type === 3) {
      plaintext = await cipher.decryptPreKeyWhisperMessage(ciphertext.body, 'binary');
    } else {
      plaintext = await cipher.decryptWhisperMessage(ciphertext.body, 'binary');
    }
    return new TextDecoder().decode(plaintext);
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
