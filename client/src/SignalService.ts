import { DataBase } from 'shogun-core';

interface SignalBundle {
  username: string;
  uniqueUsername?: string;
  epub: string;
}

/**
 * SignalService
 *
 * Bridges shogun-core DataBase with SEA-based encryption.
 * Replaces the complex libsignal-protocol with native GunDB SEA.encrypt/decrypt.
 * 
 * Uses 'epub' (exchange public key) to derive a shared secret (SEA.secret)
 * for secure 1:1 messaging.
 */
export class SignalService {
  private db: DataBase;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private pubkeyCache: Map<string, string> = new Map();
  private epubCache: Map<string, string> = new Map();

  constructor(db: DataBase) {
    this.db = db;
  }

  public get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Waits for the service to be fully initialized.
   */
  public async waitReady(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;
    
    let retries = 0;
    while (!this.initPromise && !this.isInitialized && retries < 10) {
      await new Promise(r => setTimeout(r, 500));
      retries++;
    }
    
    if (this.initPromise) return this.initPromise;
    if (!this.isInitialized) throw new Error('SignalService not initializing');
  }

  /**
   * Initializes the SEA-based messaging session by publishing the user's bundle.
   */
  async initSession(username: string, uniqueUsername?: string) {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log('[SignalService] Initializing SEA session...');
      try {
        await this.publishBundle(username, uniqueUsername);
        await this.persistAlias(username, uniqueUsername);
      } catch (e) {
        console.warn('[SignalService] Initialization steps failed:', e);
        // We still mark as initialized to allow the app to function
      }
      this.isInitialized = true;
      this.initPromise = null;
      console.log('[SignalService] SEA Initialization complete.');
    })();
    return this.initPromise;
  }

  /**
   * Publishes the user's public 'epub' to GunDB so others can derive a shared secret.
   */
  private async publishBundle(username: string, uniqueUsername?: string): Promise<void> {
    const pair = (this.db.gun.user() as any)?._?.sea;
    if (!pair || !pair.epub) {
      console.warn('[SignalService] User keys not available yet, deferring bundle publish.');
      return;
    }

    const bundlePayload: SignalBundle = {
      username,
      uniqueUsername,
      epub: pair.epub
    };

    try {
      // We use a new node 'signal_bundle_v7' to avoid conflicts with libsignal bundles
      await this.db.userPut('signal_bundle_v7', bundlePayload as any);
      console.log('[SignalService] Published SEA bundle (epub: ' + pair.epub.slice(0, 8) + '...)');
    } catch (e) {
      console.error('[SignalService] GunDB error during bundle publish:', e);
      throw new Error('Failed to publish Signal bundle');
    }
  }

  /**
   * Persists the user's alias and unique username for discovery.
   */
  private async persistAlias(username: string, uniqueUsername?: string): Promise<void> {
    const pub = this.db.getUserPub();
    if (!pub) return;

    localStorage.setItem('signal_alias', username);
    if (uniqueUsername) {
      localStorage.setItem('signal_unique_username', uniqueUsername);
    }
    localStorage.setItem('signal_pub', pub);

    try {
      const aliasPayload: Record<string, string> = { alias: username };
      if (uniqueUsername) aliasPayload.uniqueUsername = uniqueUsername;
      
      await this.db.Put(`signal_aliases/${pub}`, aliasPayload);
      
      if (uniqueUsername) {
        const normalized = uniqueUsername.startsWith('@') ? uniqueUsername : `@${uniqueUsername}`;
        await this.db.Put(`signal_unique_usernames/${normalized}`, pub);
      }
    } catch (e) {
      console.warn('[SignalService] Failed to persist alias to GunDB:', e);
    }
  }

  /**
   * Resolves a human-readable username or unique username to a GunDB public key.
   */
  async getPubKeyFromUsername(username: string): Promise<string> {
    if (!username) throw new Error('Username/Pubkey is required');
    
    // If it looks like a pubkey already, return it
    if (username.length >= 30 && !username.startsWith('@')) return username;

    const cached = this.pubkeyCache.get(username);
    if (cached) return cached;

    console.log(`[SignalService] Resolving pubkey for: ${username}`);
    for (let i = 0; i < 6; i++) {
      try {
        if (username.startsWith('@')) {
          const uniquePubKey = await this.db.Get(`signal_unique_usernames/${username}`);
          if (uniquePubKey && typeof uniquePubKey === 'string' && uniquePubKey.length >= 30) {
            this.pubkeyCache.set(username, uniquePubKey);
            return uniquePubKey;
          }
        }

        const data = await this.db.Get(`~@${username}`) as any;
        if (data && typeof data === 'object') {
          const pubNode = Object.keys(data).find(k => k.startsWith('~') && k !== '_' && k.length > 5);
          if (pubNode) {
            const pub = pubNode.slice(1);
            if (pub.length >= 30) {
              this.pubkeyCache.set(username, pub);
              return pub;
            }
          }
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
    throw new Error(`User "${username}" not found.`);
  }

  /**
   * Retrieves the 'epub' (Exchange Public Key) for a given GunDB pubkey.
   */
  private async getEpubFromPub(pub: string): Promise<string> {
    const cached = this.epubCache.get(pub);
    if (cached) return cached;

    console.log(`[SignalService] Fetching epub for: ${pub.slice(0, 8)}...`);
    for (let i = 0; i < 5; i++) {
      try {
        const bundle = await this.db.Get(`~${pub}/signal_bundle_v7`) as any;
        if (bundle && bundle.epub) {
          this.epubCache.set(pub, bundle.epub);
          return bundle.epub;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
    throw new Error(`Could not find SEA epub for ${pub}. User might not be updated to V7.`);
  }

  /**
   * Encrypts a message using SEA.secret and SEA.encrypt.
   * Returns a format compatible with existing messaging hooks.
   */
  async encryptMessage(recipientUsernameOrPub: string, message: string) {
    let pubKey = recipientUsernameOrPub;
    if (pubKey.length < 30 || pubKey.startsWith('@')) {
      pubKey = await this.getPubKeyFromUsername(recipientUsernameOrPub);
    }

    const recipientEpub = await this.getEpubFromPub(pubKey);
    const myPair = (this.db.gun.user() as any)?._?.sea;
    if (!myPair) throw new Error('User not logged in');

    // Generate shared secret via Diffie-Hellman
    const secret = await this.db.sea.secret(recipientEpub, myPair);
    // Encrypt the message with the shared secret
    const encrypted = await this.db.sea.encrypt(message, secret);

    // Existing UI/hooks expect an object with body and type (0 = whisper, 1 = prekey)
    // We use type 0 for all SEA messages as they are effectively "whisper" messages.
    return { type: 0, body: encrypted };
  }

  /**
   * Decrypts a message using SEA.secret and SEA.decrypt.
   */
  async decryptMessage(senderUsernameOrPub: string, ciphertext: { type: number; body: string }) {
    let pubKey = senderUsernameOrPub;
    if (pubKey.length < 30 || pubKey.startsWith('@')) {
      pubKey = await this.getPubKeyFromUsername(senderUsernameOrPub);
    }

    const senderEpub = await this.getEpubFromPub(pubKey);
    const myPair = (this.db.gun.user() as any)?._?.sea;
    if (!myPair) throw new Error('User not logged in');

    const secret = await this.db.sea.secret(senderEpub, myPair);
    const decrypted = await this.db.sea.decrypt(ciphertext.body, secret);

    if (decrypted === undefined || decrypted === null) {
      throw new Error('SEA Decryption failed. Potentially wrong key or corrupted data.');
    }

    return decrypted as string;
  }

  /**
   * Reset session (No-op in stateless SEA mode, kept for API compatibility).
   */
  async resetSession(contactUsernameOrPub: string): Promise<void> {
    console.log(`[SignalService] Reset requested for ${contactUsernameOrPub} (SEA mode is stateless).`);
    // Clear cache to force fresh epub fetch
    this.epubCache.delete(contactUsernameOrPub);
    this.pubkeyCache.delete(contactUsernameOrPub);
  }
}
