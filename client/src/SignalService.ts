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
  private secretCache: Map<string, any> = new Map(); // Memoized DH secrets
  private myPair: any = null;
  private cryptoMutex: Promise<any> = Promise.resolve(); // Serialize all WebCrypto operations

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
        // Wait for pair to be available and user to be logged in
        let user = this.db.gun.user();
        let pair = (user as any)?._?.sea;
        if (!pair || !user.is) {
           for (let i=0; i<20; i++) {
             await new Promise(r => setTimeout(r, 200));
             user = this.db.gun.user();
             pair = (user as any)?._?.sea;
             if (pair && user.is) break;
           }
        }
        
        if (!user.is) {
          console.warn('[SignalService] User not logged in after waiting. Bundle publish might fail.');
        }

        this.myPair = pair;
        
        await this.publishBundle(username, uniqueUsername);
        
        // Discovery metadata persistence is non-blocking to prevent slow relays from hanging initialization
        this.persistAlias(username, uniqueUsername).catch(e => {
           console.warn('[SignalService] Background alias persistence failed (session still active):', e);
        });
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

      const publishTimeout = setTimeout(() => {
          console.warn('[SignalService] Primary epub publish timed out after 5s. Continuing with initialization...');
      }, 5000);

      await new Promise<void>((resolve, reject) => {
        user.get('epub').put(pair.epub, (ack: any) => {
          clearTimeout(publishTimeout);
          if (ack.err) {
              if (ack.err === 'Unverified data.') {
                  console.error('[SignalService] Critical: Unverified data error while publishing epub. This usually means the Gun session is invalid.');
                  // Fallback: Try to use the root 'epub' path anyway, but don't resolve yet if we want to honor the error, 
                  // but here we resolve to unblock the UI.
                  resolve(); 
              } else {
                  reject(ack.err);
              }
          } else {
              resolve();
          }
        });
      });
      
      // 2. Secondary path: individual fields for maximum GunDB verification reliability
      // We wrap this in a timeout to avoid blocking if the primary path is already struggling
      setTimeout(() => {
        if (user.is) {
          // Publish individual fields to ensure relay verification succeeds even if the full object fails
          user.get('signal_bundle_v7').get('epub').put(pair.epub);
          user.get('signal_bundle_v7').get('username').put(username);
          if (uniqueUsername) user.get('signal_bundle_v7').get('uniqueUsername').put(uniqueUsername);
          
          // Also put the full object as back-compatibility for some discovery modes
          user.get('signal_bundle_v7').put(bundlePayload as any, (ack: any) => {
            if (ack?.err) {
              if (ack.err === 'Unverified data.') {
                console.warn('[SignalService] Secondary full bundle publish failed: Unverified data (individual fields likely succeeded).');
              } else {
                console.warn('[SignalService] Error in secondary bundle path:', ack.err);
              }
            }
          });
        }
      }, 500);
      
      console.log('[SignalService] Published SEA epub/bundle redundantly.');
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
      
      const aliasTimeout = 5000;

      await Promise.race([
        new Promise<void>((resolve) => {
          this.db.gun.get('signal_aliases').get(pub).put(aliasPayload, () => resolve());
        }),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Alias put timeout')), aliasTimeout))
      ]);
      
      if (uniqueUsername) {
        const normalized = uniqueUsername.startsWith('@') ? uniqueUsername : `@${uniqueUsername}`;
        await Promise.race([
          new Promise<void>((resolve) => {
            this.db.gun.get('signal_unique_usernames').get(normalized).put(pub, () => resolve());
          }),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Unique username put timeout')), aliasTimeout))
        ]);
      }
    } catch (e) {
      console.warn('[SignalService] Failed to persist alias to GunDB (possibly slow relay or timeout):', e);
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
  async encryptMessage(recipientUsernameOrPub: string, message: string): Promise<{ type: number, body: string }> {
    return new Promise((resolve, reject) => {
      this.cryptoMutex = this.cryptoMutex.then(async () => {
        try {
          let pubKey = recipientUsernameOrPub;
          if (pubKey.length < 30 || pubKey.startsWith('@')) {
            pubKey = await this.getPubKeyFromUsername(recipientUsernameOrPub);
          }

          const recipientEpub = await this.getEpubFromPub(pubKey);
          const myPair = (this.db.gun.user() as any)?._?.sea;
          if (!myPair) throw new Error('User not logged in');

          let secret = this.secretCache.get(recipientEpub);
          if (!secret) {
              secret = await this.db.sea.secret(recipientEpub, myPair);
              if (secret) this.secretCache.set(recipientEpub, secret);
          }

          if (!secret) throw new Error('DH Derivation failed');

          if (message.startsWith('{')) {
            console.log(`[SignalService] Encrypting metadata payload (length: ${message.length})`);
          }

          const encrypted = await this.db.sea.encrypt(message, secret);
          resolve({ type: 0, body: encrypted });
        } catch (e) {
          reject(e);
        }
      });
    });
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

      // LEGACY GUARD: If it doesn't look like a SEA ciphertext, don't try to decrypt it with SEA
      // SEA strings usually start with SEA{"ct":...}
      if (!ciphertext.body.startsWith('SEA{"')) {
        // Return a special indicator for legacy messages to avoid heal loops
        return "LEGACY_UNSUPPORTED";
      }

      let secret = this.secretCache.get(senderEpub);
      if (!secret) {
        secret = await this.db.sea.secret(senderEpub, myPair);
        if (secret) this.secretCache.set(senderEpub, secret);
      }

      if (!secret) {
        console.warn(`[SignalService] Could not derive secret for ${pubKey.slice(0, 8)}`);
        return undefined;
      }
      
      console.log(`[SignalService] Derived secret for ${pubKey.slice(0, 8)}. Calling SEA.decrypt... (cipher length: ${ciphertext.body.length})`);
      let decrypted;
      try {
        decrypted = await Promise.race([
          this.db.sea.decrypt(ciphertext.body, secret),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SEA.decrypt timeout')), 10000))
        ]);
        console.log(`[SignalService] SEA.decrypt resolved. decryped value type: ${typeof decrypted}`);
      } catch (decryptErr: any) {
        console.error(`[SignalService] SEA.decrypt threw or timed out:`, decryptErr.message);
        decrypted = undefined;
      }

      // If decryption fails, try a one-time "silent heal" by refreshing the epub
      if (decrypted === undefined || decrypted === null) {
        console.log(`[SignalService] Decryption failed for ${pubKey.slice(0, 8)}. Attempting one-time EPUB refresh...`);
        this.epubCache.delete(pubKey);
        this.secretCache.delete(senderEpub);
        try {
          const freshEpub = await this.getEpubFromPub(pubKey);
          const freshSecret = await this.db.sea.secret(freshEpub, myPair);
          if (freshSecret) this.secretCache.set(freshEpub, freshSecret);
          decrypted = await Promise.race([
            this.db.sea.decrypt(ciphertext.body, freshSecret),
            new Promise((_, reject) => setTimeout(() => reject(new Error('SEA.decrypt fresh retry timeout')), 10000))
          ]);
        } catch (e) {
          console.warn(`[SignalService] One-time refresh failed for ${pubKey.slice(0, 8)}`);
        }
      }

      if (decrypted === undefined || decrypted === null) {
        console.warn(`[SignalService] SEA Decryption yielded ${decrypted === null ? 'NULL' : 'UNDEFINED'} for sender: ${pubKey.slice(0, 8)} after retry.`);
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
    const oldEpub = this.epubCache.get(contactUsernameOrPub);
    if (oldEpub) this.secretCache.delete(oldEpub);
    this.epubCache.delete(contactUsernameOrPub);
    this.pubkeyCache.delete(contactUsernameOrPub);
  }
}
