import {
  KeyHelper,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
} from '@privacyresearch/libsignal-protocol-typescript';
import { SignalStore } from './SignalStore';
import { DataBase } from 'shogun-core';

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
      // Check if we have local Signal keys
      const existingKey = await this.store.getIdentityKeyPair();
      if (!existingKey) {
        // Try to restore from GunDB backup first (cross-device)
        console.log('[SignalService] Searching for Signal key backup on GunDB...');
        const restored = await this.restoreKeysFromGun();
        if (restored) {
          console.log('[SignalService] Keys restored from GunDB backup!');
        } else {
          // No backup found or failed to load — generate fresh keys
          console.warn('[SignalService] No keys found on GunDB after retries, generating new bundle and clearing inbox...');
          await this.generateAndPublishBundle(username);
          await this.backupKeysToGun();
          // Catastrophic failure: we have new keys, all old inbox messages are now unreadable.
          // Wipe them to avoid Bad MAC loops.
          await this.clearFullInbox();
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
          this.store.importAll(data);
          console.log(`[SignalService] Keys restored from GunDB (attempt ${i + 1})`);
          return true;
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
    const signedPreKeyId = Math.floor(Math.random() * 100000);
    const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);

    const preKeys = [];
    for (let i = 0; i < 10; i++) {
      const preKeyId = Math.floor(Math.random() * 100000);
      const preKey = await KeyHelper.generatePreKey(preKeyId);
      preKeys.push(preKey);
      await this.store.storePreKey(preKeyId, preKey.keyPair);
    }

    await this.store.storeIdentityKey(identityKeyPair);
    await this.store.storeRegistrationId(registrationId);
    await this.store.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair);

    const bundle: SignalBundle = {
      username,
      registrationId,
      identityKey: this.ab2b64(identityKeyPair.pubKey),
      signedPreKey: {
        keyId: signedPreKeyId,
        publicKey: this.ab2b64(signedPreKey.keyPair.pubKey),
        signature: this.ab2b64(signedPreKey.signature),
      },
      preKeys: preKeys.map(pk => ({
        keyId: pk.keyId,
        publicKey: this.ab2b64(pk.keyPair.pubKey),
      })),
    };

    // Publish to the user's GunDB node via shogun-core
    const result = await this.db.userPut('signal_bundle', JSON.stringify(bundle));
    if (result.error.length > 0) {
      throw new Error('Failed to publish Signal bundle');
    }
  }

  async checkAndRotatePreKeys(): Promise<void> {
    const remaining = this.store.getPreKeyCount();
    console.log(`[SignalService] Pre-keys remaining locally: ${remaining}`);

    // Threshold to trigger rotation
    if (remaining > 5) return;

    console.log(`[SignalService] Generating new pre-keys to replenish bundle...`);
    const newPreKeys = [];
    for (let i = 0; i < 15; i++) {
      const preKeyId = Math.floor(Math.random() * 100000);
      const preKey = await KeyHelper.generatePreKey(preKeyId);
      newPreKeys.push(preKey);
      await this.store.storePreKey(preKeyId, preKey.keyPair);
    }

    // Backup the newly generated local keys
    await this.backupKeysToGun();

    // Fetch existing bundle and append the new public keys
    try {
      const bundleStr = await this.db.userGet('signal_bundle');
      if (bundleStr && typeof bundleStr === 'string') {
        const bundle = JSON.parse(bundleStr) as SignalBundle;
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

        await this.db.userPut('signal_bundle', JSON.stringify(bundle));
        console.log(`[SignalService] Successfully published ${newPreKeys.length} new pre-keys to bundle.`);
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
        const data = await this.db.Get(`~@${username}`) as any;
        if (data && typeof data === 'object') {
          // Filter out GunDB internal fields and ensure it starts with ~
          const pubNode = Object.keys(data).find(k => k.startsWith('~') && k !== '_' && k.length > 5);
          if (pubNode) {
            const pub = pubNode.slice(1);
            if (pub.length >= 30) {
              this.pubkeyCache.set(username, pub);
              console.log(`[SignalService] Resolved ${username} -> ${pub}`);
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
    throw new Error(`User "${username}" not found on GunDB after 6 attempts. Check alias existence.`);
  }

  private async getBundleFromUsername(usernameOrPub: string): Promise<SignalBundle> {
    let pubKey = usernameOrPub;
    if (pubKey.length < 30) {
      pubKey = await this.getPubKeyFromUsername(usernameOrPub);
    }
    try {
      const data = await this.db.Get(`~${pubKey}/signal_bundle`);
      if (!data) throw new Error(`Bundle not found for ${pubKey}`);
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return parsed as SignalBundle;
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

      // Aggressively clear unreadable inbox history for this sender
      await this.clearInboxForSender(pubKey);
    } catch (e) {
      console.error(`[SignalService] Reset failed for ${contactUsernameOrPub}:`, e);
    }
  }

  /**
   * Clears the entire inbox for the current user.
   * Useful when fresh keys are generated and NO backup exists.
   */
  async clearFullInbox(): Promise<void> {
    const userPub = this.db.getUserPub();
    if (!userPub) return;

    console.warn(`[SignalService] Wiping ALL historical messages for ${userPub} (Fresh Keys Generated)`);
    try {
      await this.db.purge(`signal_inbox_${userPub}`);
      console.log(`[SignalService] Inbox purged successfully`);
    } catch (e) {
      console.error(`[SignalService] Failed to purge inbox:`, e);
    }
  }

  /**
   * Experimental: Nullifies all messages from a specific sender in the current user's inbox on GunDB.
   * This prevents "Bad MAC" loops by physically removing the unreadable history.
   */
  private async clearInboxForSender(senderPub: string): Promise<void> {
    const userPub = this.db.getUserPub();
    if (!userPub) return;

    console.log(`[SignalService] Clearing GunDB inbox for sender: ${senderPub}`);
    const inbox = this.db.gun.get(`signal_inbox_${userPub}`);

    inbox.map().once(async (data: any, key: string) => {
      if (data && data.sender === senderPub) {
        console.log(`[SignalService] Nullifying unreadable message ${key} from ${senderPub}`);
        try {
          await this.db.Del(`signal_inbox_${userPub}/${key}`);
        } catch (e) {
          console.error(`[SignalService] Failed to delete message ${key}:`, e);
        }
      }
    });
  }

  // ── Binary helpers ───────────────────────────────────────────

  private ab2b64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
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
