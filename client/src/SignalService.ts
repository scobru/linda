import {
  KeyHelper,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
} from '@privacyresearch/libsignal-protocol-typescript';
import { SignalStore } from './SignalStore';
import { DataBase } from 'shogun-core';
import type { IGunInstance } from 'shogun-core';

/**
 * SignalService
 *
 * Bridges GunDB (via shogun-core DataBase) with the Signal Protocol.
 * - register(): creates a GunDB/SEA identity AND generates Signal keys
 * - login():    authenticates with GunDB/SEA, reuses persisted Signal keys
 * - encrypt/decrypt: standard Signal Protocol E2EE
 *
 * The SignalStore persists all keys/sessions to localStorage, so
 * they survive page reloads. On login we simply re-use them.
 */
export class SignalService {
  private store: SignalStore;
  private gun: IGunInstance;
  private db: DataBase;

  constructor(gun: IGunInstance, db: DataBase) {
    this.gun = gun;
    this.db = db;
    // The store eagerly loads from localStorage in its constructor
    this.store = new SignalStore();
  }

  // ── Auth ─────────────────────────────────────────────────────

  async register(username: string, password: string) {
    const result = await this.db.signUp(username, password);
    if (!result.success) {
      throw new Error(result.error || 'Registration failed');
    }
    // Generate fresh Signal keys and push bundle to GunDB
    await this.generateAndPublishBundle(username);
    // Backup encrypted keys to GunDB for cross-device sync
    await this.backupKeysToGun();
    // Persist alias for session recall
    await this.persistAlias(username);
  }

  async login(username: string, password: string) {
    const result = await this.db.login(username, password);
    if (!result.success) {
      throw new Error(result.error || 'Login failed');
    }
    // Check if we have local Signal keys
    const existingKey = await this.store.getIdentityKeyPair();
    if (!existingKey) {
      // Try to restore from GunDB backup first (cross-device)
      const restored = await this.restoreKeysFromGun();
      if (restored) {
        console.log('[SignalService] Keys restored from GunDB backup!');
      } else {
        // No backup found — generate fresh keys
        console.warn('[SignalService] No keys found anywhere, generating new bundle...');
        await this.generateAndPublishBundle(username);
        await this.backupKeysToGun();
      }
    }
    // Persist alias for session recall
    await this.persistAlias(username);
  }

  // ── Encrypted key backup (cross-device) ─────────────────────

  /**
   * Backup all Signal keys to the user's private GunDB node.
   * gun.user().get() data is auto-encrypted by SEA — only the
   * authenticated user can read it.
   */
  private async backupKeysToGun(): Promise<void> {
    const snapshot = this.store.exportAll();
    return new Promise<void>((resolve, reject) => {
      this.gun.user().get('signal_keystore').put(snapshot, (ack: any) => {
        if (ack.err) {
          console.error('[SignalService] Key backup failed:', ack.err);
          reject(new Error(ack.err));
        } else {
          console.log('[SignalService] Keys backed up to GunDB (encrypted)');
          resolve();
        }
      });
    });
  }

  /**
   * Try to restore Signal keys from the user's private GunDB node.
   * Returns true if keys were found and restored, false otherwise.
   */
  private async restoreKeysFromGun(): Promise<boolean> {
    return new Promise((resolve) => {
      this.gun.user().get('signal_keystore').once((data: any) => {
        if (!data || typeof data !== 'string') {
          console.log('[SignalService] No key backup found on GunDB');
          return resolve(false);
        }
        try {
          this.store.importAll(data);
          console.log('[SignalService] Keys restored from GunDB backup');
          resolve(true);
        } catch (e) {
          console.error('[SignalService] Failed to restore keys:', e);
          resolve(false);
        }
      });
    });
  }

  /**
   * Persist username→pubkey mapping so we can recover the alias
   * after a page refresh (GunDB recall often loses `alias`).
   */
  private async persistAlias(username: string): Promise<void> {
    const pub = (this.gun.user() as any)?.is?.pub;
    if (!pub) return;
    // Save to localStorage for instant local lookup
    localStorage.setItem('signal_alias', username);
    localStorage.setItem('signal_pub', pub);
    // Save to a public GunDB node so any peer can resolve it
    return new Promise<void>((resolve) => {
      this.gun.get('signal_aliases').get(pub).put({ alias: username }, () => resolve());
    });
  }

  /**
   * Recover the human-readable alias for a given pubkey.
   * Tries: 1) localStorage  2) GunDB signal_aliases node
   */
  private async recoverAlias(pub: string): Promise<string | null> {
    // 1) Fast path: localStorage
    const savedPub = localStorage.getItem('signal_pub');
    const savedAlias = localStorage.getItem('signal_alias');
    if (savedPub === pub && savedAlias) return savedAlias;
    // 2) GunDB lookup
    return new Promise((resolve) => {
      this.gun.get('signal_aliases').get(pub).once((data: any) => {
        if (data?.alias) {
          localStorage.setItem('signal_alias', data.alias);
          localStorage.setItem('signal_pub', pub);
          resolve(data.alias);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Attempt to auto-login by recalling the GunDB/SEA session from
   * sessionStorage. Returns the username if successful, null otherwise.
   * Includes a timeout to prevent hanging when no session exists.
   */
  async sessionRecall(): Promise<string | null> {
    const TIMEOUT_MS = 3000;

    return new Promise((resolve) => {
      let resolved = false;
      const done = (val: string | null) => {
        if (resolved) return;
        resolved = true;
        resolve(val);
      };

      // Timeout fallback — if recall never fires, show login screen
      const timer = setTimeout(() => {
        console.log('[SignalService] Session recall timed out');
        done(null);
      }, TIMEOUT_MS);

      this.gun.user().recall({ sessionStorage: true }, (_ack: any) => {
        // Small delay so Gun has time to populate user.is
        setTimeout(() => {
          clearTimeout(timer);
          const user = this.gun.user() as any;
          if (!user?.is?.pub) {
            return done(null);
          }
          const pub = user.is.pub as string;
          const rawAlias = user.is.alias as string | undefined;

          // If alias looks valid (not a pubkey), use it directly
          const aliasIsValid = rawAlias && rawAlias.length < 60 && !rawAlias.includes('.');

          const finalize = (alias: string) => {
            console.log('[SignalService] Session recalled for', alias);
            this.store.getIdentityKeyPair().then((key) => {
              if (!key) {
                console.warn('[SignalService] No Signal keys, re-generating...');
                this.generateAndPublishBundle(alias).then(() => done(alias)).catch(() => done(alias));
              } else {
                done(alias);
              }
            }).catch(() => done(alias));
          };

          if (aliasIsValid) {
            finalize(rawAlias!);
          } else {
            // Alias lost — recover from localStorage / GunDB
            this.recoverAlias(pub).then((recovered) => {
              if (recovered) {
                finalize(recovered);
              } else {
                // Last resort: use truncated pubkey
                finalize(pub.slice(0, 8) + '...');
              }
            });
          }
        }, 300);
      });
    });
  }

  // ── Key management ───────────────────────────────────────────

  private async generateAndPublishBundle(username: string) {
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

    const bundle = {
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

    // Publish to the user's GunDB node
    return new Promise<void>((resolve, reject) => {
      this.gun.user().get('signal_bundle').put(JSON.stringify(bundle), (ack: any) => {
        if (ack.err) reject(new Error(ack.err));
        else resolve();
      });
    });
  }

  // ── GunDB helpers ────────────────────────────────────────────

  async getMyPubKey(): Promise<string> {
    const pub = (this.gun.user() as any)?.is?.pub;
    if (!pub) throw new Error('User not logged in');
    return pub as string;
  }

  async getPubKeyFromUsername(username: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.gun.get(`~@${username}`).once((data: any) => {
        if (!data) {
          return reject(new Error(`User "${username}" not found`));
        }
        // Gun stores alias→pub mappings as { _: {...}, ~<pubkey>: {...} }
        const pubNode = Object.keys(data).find(k => k.startsWith('~') && k !== '_');
        if (pubNode) {
          return resolve(pubNode.slice(1)); // strip leading ~
        }
        reject(new Error(`User "${username}" not found`));
      });
    });
  }

  private async getBundleFromUsername(username: string): Promise<any> {
    const pubKey = await this.getPubKeyFromUsername(username);
    return new Promise((resolve, reject) => {
      this.gun.user(pubKey).get('signal_bundle').once((d: any) => {
        if (!d) return reject(new Error(`Bundle not found for ${username}`));
        try {
          const parsed = typeof d === 'string' ? JSON.parse(d) : d;
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse bundle for ${username}`));
        }
      });
    });
  }

  // ── Encrypt / Decrypt ────────────────────────────────────────

  async encryptMessage(recipientUsername: string, message: string) {
    const address = new SignalProtocolAddress(recipientUsername, 1);
    const sessionExists = await this.store.loadSession(address.toString());

    if (!sessionExists) {
      const bundle = await this.getBundleFromUsername(recipientUsername);
      const builder = new SessionBuilder(this.store, address);
      const firstPreKey = bundle.preKeys?.length > 0 ? bundle.preKeys[0] : undefined;

      await builder.processPreKey({
        registrationId: bundle.registrationId,
        identityKey: this.b642ab(bundle.identityKey),
        signedPreKey: {
          keyId: bundle.signedPreKey.keyId,
          publicKey: this.b642ab(bundle.signedPreKey.publicKey),
          signature: this.b642ab(bundle.signedPreKey.signature),
        },
        preKey: firstPreKey ? {
          keyId: firstPreKey.keyId,
          publicKey: this.b642ab(firstPreKey.publicKey),
        } : undefined,
      });
    }

    const cipher = new SessionCipher(this.store, address);
    return cipher.encrypt(new TextEncoder().encode(message).buffer);
  }

  async decryptMessage(senderUsername: string, ciphertext: { type: number; body: string }) {
    const address = new SignalProtocolAddress(senderUsername, 1);
    const cipher = new SessionCipher(this.store, address);

    let plaintext: ArrayBuffer;
    if (ciphertext.type === 3) {
      plaintext = await cipher.decryptPreKeyWhisperMessage(ciphertext.body, 'binary');
    } else {
      plaintext = await cipher.decryptWhisperMessage(ciphertext.body, 'binary');
    }
    return new TextDecoder().decode(plaintext);
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
