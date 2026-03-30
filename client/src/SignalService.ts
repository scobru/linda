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
  private myPair: any = null;

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
        // Wait for pair to be available
        let pair = (this.db.gun.user() as any)?._?.sea;
        if (!pair) {
           for (let i=0; i<10; i++) {
             await new Promise(r => setTimeout(r, 200));
             pair = (this.db.gun.user() as any)?._?.sea;
             if (pair) break;
           }
        }
        this.myPair = pair;
        
        await this.publishBundle(username, uniqueUsername);
        await this.persistAlias(username, uniqueUsername);
      } catch (e) {
        console.warn('[SignalService] Initialization steps failed:', e);
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
      // 1. Primary path: user node root 'epub'
      const user = this.db.gun.user();
      if (!user.is) {
          console.warn('[SignalService] Gun user is not logged in. Cannot publish bundle.');
          return;
      }

      await new Promise<void>((resolve, reject) => {
        user.get('epub').put(pair.epub, (ack: any) => {
          if (ack.err) {
              if (ack.err === 'Unverified data.') {
                  console.error('[SignalService] Critical: Unverified data error while publishing epub. Attempting to re-authenticate...');
                  // In GunDB, Unverified data usually means we are writing to a node without a valid session.
                  // We could try to trigger a re-login here, but for now we'll just log and try again once.
                  resolve(); // Don't throw to allow secondary path
              } else {
                  reject(ack.err);
              }
          } else {
              resolve();
          }
        });
      });
      
      // 2. Secondary path: 'signal_bundle_v7' for full bundle data
      user.get('signal_bundle_v7').put(bundlePayload as any, (ack: any) => {
          if (ack?.err) console.warn('[SignalService] Error in secondary bundle path:', ack.err);
      });
      
      console.log('[SignalService] Published SEA epub/bundle redundantly via direct put.');
    } catch (e) {
      console.error('[SignalService] GunDB error during bundle publish:', e);
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
      
      await new Promise<void>((resolve) => {
        this.db.gun.get('signal_aliases').get(pub).put(aliasPayload, () => resolve());
      });
      
      if (uniqueUsername) {
        const normalized = uniqueUsername.startsWith('@') ? uniqueUsername : `@${uniqueUsername}`;
        await new Promise<void>((resolve) => {
          this.db.gun.get('signal_unique_usernames').get(normalized).put(pub, () => resolve());
        });
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
  public async getEpubFromPub(pub: string): Promise<string> {
    const cached = this.epubCache.get(pub);
    if (cached) return cached;

    console.log(`[SignalService] Discovery: Fetching epub for: ${pub.slice(0, 8)}...`);
    for (let i = 0; i < 6; i++) {
      try {
        // Method A: Direct 'epub' node
        const directEpub = await this.db.Get(`~${pub}/epub`) as any;
        if (directEpub && typeof directEpub === 'string' && directEpub.length > 20) {
           console.log(`[SignalService] Found epub via direct node for: ${pub.slice(0, 8)}`);
           this.epubCache.set(pub, directEpub);
           return directEpub;
        }

        // Method B: Bundle node
        const bundle = await this.db.Get(`~${pub}/signal_bundle_v7`) as any;
        if (bundle && bundle.epub && typeof bundle.epub === 'string' && bundle.epub.length > 20) {
          console.log(`[SignalService] Found epub via bundle for: ${pub.slice(0, 8)}`);
          this.epubCache.set(pub, bundle.epub);
          return bundle.epub;
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 800 * (i + 1))); // Slightly longer wait
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
    
    // Diagnostic for images/files
    if (message.startsWith('{')) {
      console.log(`[SignalService] Encrypting metadata payload (length: ${message.length})`);
    }

    // Encrypt the message with the shared secret
    const encrypted = await this.db.sea.encrypt(message, secret);

    // Existing UI/hooks expect an object with body and type (0 = whisper, 1 = prekey)
    // We use type 0 for all SEA messages as they are effectively "whisper" messages.
    return { type: 0, body: encrypted };
  }

  /**
   * Decrypts a message using SEA.secret and SEA.decrypt.
   */
  async decryptMessage(senderUsernameOrPub: string, ciphertext: { type: number; body: string }): Promise<string | undefined> {
    try {
      let pubKey = senderUsernameOrPub;
      if (pubKey.length < 30 || pubKey.startsWith('@')) {
        pubKey = await this.getPubKeyFromUsername(senderUsernameOrPub);
      }

      const senderEpub = await this.getEpubFromPub(pubKey);
      if (!senderEpub) {
        console.warn(`[SignalService] No epub found for ${pubKey.slice(0, 8)}. Cannot decrypt.`);
        return undefined;
      }
      
      const myPair = this.myPair || (this.db.gun.user() as any)?._?.sea;
      if (!myPair) throw new Error('User keys not available for decryption');

      if (typeof ciphertext.body !== 'string') {
        console.warn(`[SignalService] Body of message from ${pubKey.slice(0, 8)} is not a string (${typeof ciphertext.body}). Skipping decryption.`);
        return undefined;
      }

      const secret = await this.db.sea.secret(senderEpub, myPair);
      if (!secret) {
        console.warn(`[SignalService] Could not derive secret for ${pubKey.slice(0, 8)}`);
        return undefined;
      }
      
      const decrypted = await this.db.sea.decrypt(ciphertext.body, secret);

      if (decrypted === undefined || decrypted === null) {
        console.warn(`[SignalService] SEA Decryption yielded ${decrypted === null ? 'NULL' : 'UNDEFINED'} for sender: ${pubKey.slice(0, 8)}`);
        return undefined;
      }

      // Ensure we return a string to avoid .startsWith errors later. 
      // If it's an object (file metadata), stringify it so downstream JSON.parse works.
      if (typeof decrypted !== 'string') {
        const stringified = typeof decrypted === 'object' ? JSON.stringify(decrypted) : String(decrypted);
        console.log(`[SignalService] Decrypted non-string payload (${typeof decrypted}). Serialized to:`, stringified.substring(0, 50));
        return stringified;
      }

      return decrypted;
    } catch (err: any) {
      console.error(`[SignalService] Error during decryption for ${senderUsernameOrPub}:`, err.message);
      return undefined;
    }
  }

  /**
   * Force republish the user's bundle. Useful for fixing synchronization issues.
   */
  async republishBundle(): Promise<void> {
    const username = localStorage.getItem('signal_alias') || 'Anonymous';
    const uniqueUsername = localStorage.getItem('signal_unique_username') || undefined;
    console.log('[SignalService] Action: Force republishing bundle...');
    await this.publishBundle(username, uniqueUsername);
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
