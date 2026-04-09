import { DataBase } from "shogun-core";
import Gun from "gun/gun";
import "gun/sea";

/**
 * CommunicationService
 *
 * Bridges shogun-core DataBase with SEA-based encryption.
 * Replaces the complex libsignal-protocol with native GunDB SEA.encrypt/decrypt.
 *
 * Uses 'epub' (exchange public key) to derive a shared secret (SEA.secret)
 * for secure 1:1 messaging.
 */
export class CommunicationService {
  private db: DataBase;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private pubkeyCache: Map<string, string> = new Map();
  private epubCache: Map<string, string> = new Map();
  private secretCache: Map<string, any> = new Map(); // Memoized DH secrets
  private inboxCertCache: Map<string, string> = new Map(); // Memoized SEA certs
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

    // Wait for initPromise to be set or isInitialized to become true
    for (let i = 0; i < 20; i++) {
      if (this.isInitialized) return;
      if (this.initPromise) return this.initPromise;
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  /**
   * Initializes the SEA-based messaging session by publishing the user's bundle.
   */
  async initSession(username: string, uniqueUsername?: string) {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      console.log("[CommunicationService] Initializing SEA session...");
      try {
        // Wait for pair to be available and user to be logged in
        let user = this.db.gun.user();
        let pair = (user as any)?._?.sea;
        if (!pair || !user.is) {
          await new Promise<void>((resolve) => {
            let timeoutId: ReturnType<typeof setTimeout>;
            let checkInterval: ReturnType<typeof setInterval>;

            const checkAndResolve = () => {
              user = this.db.gun.user();
              pair = (user as any)?._?.sea;
              if (pair && user.is) {
                clearTimeout(timeoutId);
                clearInterval(checkInterval);
                resolve();
              }
            };

            // Listen for the auth event for immediate resolution
            (this.db.gun as any).once("auth", checkAndResolve);

            // Fast polling fallback in case auth already triggered or event gets dropped
            checkInterval = setInterval(checkAndResolve, 50);

            // Give up after 3 seconds (same as original 15 * 200ms)
            timeoutId = setTimeout(() => {
              clearInterval(checkInterval);
              resolve();
            }, 3000);
          });

          user = this.db.gun.user();
          pair = (user as any)?._?.sea;
        }

        if (!user.is) {
          console.warn(
            "[CommunicationService] User not logged in after waiting. Bundle publish might fail.",
          );
        }

        this.myPair = pair;

        await this.publishBundle(username, uniqueUsername);
        await this.regenerateCertificate();

        // Discovery metadata persistence is non-blocking to prevent slow relays from hanging initialization
        this.persistAlias(username, uniqueUsername).catch((e) => {
          console.warn(
            "[CommunicationService] Background alias persistence failed (session still active):",
            e,
          );
        });
      } catch (e) {
        console.warn("[CommunicationService] Initialization steps failed:", e);
      }
      this.isInitialized = true;
      this.initPromise = null;
      console.log("[CommunicationService] SEA Initialization complete.");
    })();
    return this.initPromise;
  }

  /**
   * Publishes the user's public 'epub' to GunDB so others can derive a shared secret.
   */
  private async publishBundle(
    username: string,
    uniqueUsername?: string,
  ): Promise<void> {
    const pair = (this.db.gun.user() as any)?._?.sea;
    if (!pair || !pair.epub) {
      console.warn(
        "[CommunicationService] User keys not available yet, deferring bundle publish.",
      );
      return;
    }

    try {
      // 1. Primary path: user node root 'epub'
      // This is the most important field for E2E encryption.
      const user = this.db.gun.user();
      if (!user.is) {
        console.warn(
          "[CommunicationService] Gun user is not logged in. Cannot verify identity for bundle publish.",
        );
        return;
      }

      const epubPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Primary epub publish timeout")),
          8000,
        );
        user.get("epub").put(pair.epub, (ack: any) => {
          clearTimeout(timeout);
          if (ack.err) {
            if (ack.err === "Unverified data.") {
              console.error(
                "[CommunicationService] Critical: Unverified data error while publishing epub. Attempting staged recovery...",
              );
              resolve(); // Proceed to secondary fields to see if they stick
            } else {
              reject(new Error(ack.err));
            }
          } else {
            resolve();
          }
        });
      });

      await epubPromise.catch((e) =>
        console.warn(
          "[CommunicationService] Primary EPUB write failed (non-critical if secondary succeeds):",
          e.message,
        ),
      );

      // 2. Secondary path: individual fields for maximum GunDB verification reliability
      // We space these out to avoid overwhelming the Gun graph with simultaneous puts on the same root
      await new Promise((r) => setTimeout(r, 1000));

      if (user.is) {
        console.log(
          "[CommunicationService] Publishing secondary signal_bundle_v7 metadata...",
        );
        user.get("signal_bundle_v7").get("epub").put(pair.epub);
        user.get("signal_bundle_v7").get("username").put(username);
        if (uniqueUsername)
          user
            .get("signal_bundle_v7")
            .get("uniqueUsername")
            .put(uniqueUsername);

        // Individual fields are already published above.
        // We remove the object-level put to avoid "Unverified data" conflicts on the same node.
      }

      console.log(
        "[CommunicationService] Published SEA bundle properties successfully.",
      );
    } catch (e: any) {
      console.error(
        "[CommunicationService] GunDB error during bundle publish:",
        e.message || e,
      );
    }
  }

  /**
   * Persists the user's alias and unique username for discovery.
   */
  private async persistAlias(
    username: string,
    uniqueUsername?: string,
  ): Promise<void> {
    const pub = this.db.getUserPub();
    if (!pub) return;

    localStorage.setItem("signal_alias", username);
    if (uniqueUsername) {
      localStorage.setItem("signal_unique_username", uniqueUsername);
    }
    localStorage.setItem("signal_pub", pub);

    try {
      const aliasPayload: Record<string, string> = { alias: username };
      if (uniqueUsername) aliasPayload.uniqueUsername = uniqueUsername;

      const aliasTimeout = 5000;

      await Promise.race([
        new Promise<void>((resolve) => {
          this.db.gun
            .get("signal_aliases")
            .get(pub)
            .put(aliasPayload, () => resolve());
        }),
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error("Alias put timeout")),
            aliasTimeout,
          ),
        ),
      ]);

      if (uniqueUsername) {
        const normalized = uniqueUsername.startsWith("@")
          ? uniqueUsername
          : `@${uniqueUsername}`;
        await Promise.race([
          new Promise<void>((resolve) => {
            this.db.gun
              .get("signal_unique_usernames")
              .get(normalized)
              .put(pub, () => resolve());
          }),
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error("Unique username put timeout")),
              aliasTimeout,
            ),
          ),
        ]);
      }
    } catch (e) {
      console.warn(
        "[CommunicationService] Failed to persist alias to GunDB (possibly slow relay or timeout):",
        e,
      );
    }
  }

  /**
   * Resolves a human-readable username or unique username to a GunDB public key.
   */
  async getPubKeyFromUsername(username: string): Promise<string> {
    if (!username) throw new Error("Username/Pubkey is required");

    // If it looks like a pubkey already, return it
    if (username.length >= 30 && !username.startsWith("@")) return username;

    const cached = this.pubkeyCache.get(username);
    if (cached) return cached;

    console.log(`[CommunicationService] Resolving pubkey for: ${username}`);
    for (let i = 0; i < 6; i++) {
      try {
        if (username.startsWith("@")) {
          const uniquePubKey = await this.db.Get(
            `signal_unique_usernames/${username}`,
          );
          if (
            uniquePubKey &&
            typeof uniquePubKey === "string" &&
            uniquePubKey.length >= 30
          ) {
            this.pubkeyCache.set(username, uniquePubKey);
            return uniquePubKey;
          }
        }

        const data = (await this.db.Get(`~@${username}`)) as any;
        if (data && typeof data === "object") {
          const pubNode = Object.keys(data).find(
            (k) => k.startsWith("~") && k !== "_" && k.length > 5,
          );
          if (pubNode) {
            const pub = pubNode.slice(1);
            if (pub.length >= 30) {
              this.pubkeyCache.set(username, pub);
              return pub;
            }
          }
        }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
    throw new Error(`User "${username}" not found.`);
  }

  /**
   * Retrieves the 'epub' (Exchange Public Key) for a given GunDB pubkey.
   */
  public async getEpubFromPub(pub: string): Promise<string> {
    if (!pub) throw new Error("Pubkey is required for epub fetch");
    const cached = this.epubCache.get(pub);
    if (cached) return cached;

    console.log(
      `[CommunicationService] Discovery: Fetching epub for: ${pub.slice(0, 8)}...`,
    );

    // Attempt multiple paths and methods to find the epub
    for (let i = 0; i < 10; i++) {
      try {
        // Method A: Direct Gun node (bypassing db.Get abstraction for speed/reliability)
        const gunEpub = await new Promise<string | null>((resolve) => {
          const timeout = setTimeout(() => resolve(null), 2500);
          this.db.gun
            .get(`~${pub}`)
            .get("epub")
            .once((data: any) => {
              clearTimeout(timeout);
              if (data && typeof data === "string" && data.length > 20)
                resolve(data);
              else resolve(null);
            });
        });
        if (gunEpub) {
          console.log(
            `[CommunicationService] Found epub via direct Gun node for: ${pub.slice(0, 8)}`,
          );
          this.epubCache.set(pub, gunEpub);
          return gunEpub;
        }

        // Method B: Bundle node (V7 format)
        const bundle = await new Promise<any>((resolve) => {
          const timeout = setTimeout(() => resolve(null), 2500);
          this.db.gun
            .get(`~${pub}`)
            .get("signal_bundle_v7")
            .once((data: any) => {
              clearTimeout(timeout);
              if (data && data.epub) resolve(data);
              else resolve(null);
            });
        });
        if (
          bundle &&
          typeof bundle.epub === "string" &&
          bundle.epub.length > 20
        ) {
          console.log(
            `[CommunicationService] Found epub via bundle for: ${pub.slice(0, 8)}`,
          );
          this.epubCache.set(pub, bundle.epub);
          return bundle.epub;
        }

        // Method C: Root node (Old/Alternative format)
        const rootData = (await this.db.Get(`~${pub}`)) as any;
        if (
          rootData &&
          typeof rootData.epub === "string" &&
          rootData.epub.length > 20
        ) {
          console.log(
            `[CommunicationService] Found epub via root node for: ${pub.slice(0, 8)}`,
          );
          this.epubCache.set(pub, rootData.epub);
          return rootData.epub;
        }
      } catch (e: any) {
        console.warn(
          `[CommunicationService] Epub fetch attempt ${i + 1} for ${pub.slice(0, 8)} failed:`,
          e?.message || e || "Unknown error",
        );
      }

      // Jittered exponential-ish backoff
      const backoff = Math.min(5000, 1000 * (i + 1) + Math.random() * 500);
      await new Promise((r) => setTimeout(r, backoff));
    }
    throw new Error(
      `Could not find SEA epub for ${pub.slice(0, 8)} after 10 attempts.`,
    );
  }

  /**
   * Initializes the user's SEA certificate for their secure signal_inbox
   * allowing anyone (or specific peers) to write signals to ~${pub}/signal_inbox
   */
  public async regenerateCertificate(force: boolean = false): Promise<void> {
    const pair = this.myPair || (this.db.gun.user() as any)?._?.sea;
    if (!pair) {
      console.warn("[CommunicationService] No user keys available for certificate regeneration.");
      return;
    }
    const user = this.db.gun.user();
    if (!user.is) return;

    try {
      if (!force) {
        let currentCert = await new Promise<any>((resolve) => {
          let timeout = setTimeout(() => resolve(null), 2500);
          user.get("inbox_cert_v13").once((data: any) => {
            clearTimeout(timeout);
            resolve(data);
          });
        });

        let isValid = false;
        if (currentCert && typeof currentCert === "string") {
          try {
            const verified = await (Gun as any).SEA.verify(currentCert, pair.pub);
            if (verified && verified.c) {
              // Check if the policy mentions signal_inbox_v13
              const policyStr = JSON.stringify(verified.c);
              if (
                policyStr.includes("signal_inbox_v13") ||
                policyStr.includes('"*"')
              ) {
                isValid = true;
              }
            }
          } catch (e) {
            console.warn(
              "[CommunicationService] Existing certificate verification failed, will regenerate.",
            );
          }
        }

        if (isValid) {
          console.log(
            "[CommunicationService] Valid SEA inbox certificate (v13) found for current session.",
          );
          return;
        }
      }

      console.log(
        `[CommunicationService] Generating fresh recursive SEA certificate (v13) for current session (force: ${force})...`,
      );
      // Policy: Allow anyone (public inbox) to write to this user's signal_inbox_v13 soul.
      // We include multiple soul variations (trailing slash, nested wildcard) for maximum relay compatibility.
      const soul = `~${pair.pub}/signal_inbox_v13`;
      const policyContent = [
        { "#": { "*": soul } },
        { "#": soul },
        { "#": soul + "/" },
        { "#": { "*": soul + "/" } },
        { "#": { "*": soul + "/." } },
        { "#": { "*": "*" } }, // absolute wildcard fallback for relay compatibility
      ];

      const cert = await (Gun as any).SEA.certify(
        "*", // Allow anyone (public inbox)
        policyContent,
        pair,
        null,
      );

      // Publish in multiple locations for maximum discoverability
      user.get("signal_bundle_v8").get("inbox_cert").put(cert);
      user.get("inbox_cert_v13").put(cert, (ack: any) => {
        if (ack?.err) {
          console.warn(
            "[CommunicationService] Failed to publish primary inbox certificate (v13):",
            ack.err,
          );
        } else {
          console.log(
            "[CommunicationService] Published fresh recursive inbox certificates (v13).",
          );
        }
      });
    } catch (e) {
      console.error(
        "[CommunicationService] Error during inbox certificate generation:",
        e,
      );
    }
  }

  /**
   * Issues a specific SEA certificate for a peer.
   */
  public async issueCertificate(peerPub: string): Promise<string> {
    if (!this.myPair) throw new Error("Not logged in");
    console.log(
      `[CommunicationService] Issuing specific recursive certificate for: ${peerPub.slice(0, 8)}...`,
    );

    const soul = `~${this.myPair.pub}/signal_inbox_v13`;
    const cert = await (Gun as any).SEA.certify(
      [peerPub],
      [
        { "#": { "*": soul } },
        { "#": soul },
        { "#": soul + "/" },
        { "#": { "*": soul + "/" } },
        { "#": { "*": "*" } }, // absolute wildcard
      ],
      this.myPair,
      null,
    );

    const user = this.db.gun.user();
    user.get("certs").get(peerPub).put(cert);
    return cert;
  }

  /**
   * Revokes a specific certificate for a peer.
   */
  public async revokeCertificate(peerPub: string): Promise<void> {
    const user = this.db.gun.user();
    if (!user.is) return;
    console.log(
      `[CommunicationService] Revoking certificate for: ${peerPub.slice(0, 8)}`,
    );
    user
      .get("certs")
      .get(peerPub)
      .put(null as any);
  }

  /**
   * Retrieves the SEA certificate allowing writes to a peer's signal_inbox
   */
  public async getInboxCertificate(pub: string): Promise<string> {
    if (!pub)
      throw new Error("Recipient pubkey required for certificate fetch");
    const cached = this.inboxCertCache.get(pub);
    if (cached) return cached;

    const myPub = this.db.getUserPub();
    console.log(
      `[CommunicationService] Discovery: Fetching inbox certificate for: ${pub.slice(0, 8)}...`,
    );

    // Helper: validate that a cert's policy actually covers signal_inbox_v12
    const validateCert = async (
      cert: string,
      label: string,
    ): Promise<boolean> => {
      try {
        const verified = await (Gun as any).SEA.verify(cert, pub);
        if (!verified || !verified.c) {
          console.warn(
            `[CommunicationService] ${label} cert for ${pub.slice(0, 8)} failed SEA.verify`,
          );
          return false;
        }
        const policyStr = JSON.stringify(verified.c);
        // Accept policies that explicitly mention v13 OR have a global wildcard "*"
        if (
          policyStr.includes("signal_inbox_v13") ||
          policyStr.includes('"*"')
        ) {
          return true;
        }
        // Wildcard-only policies ("*") are now accepted above if they match the string.
        console.warn(
          `[CommunicationService] ${label} cert for ${pub.slice(0, 8)} has incompatible policy: ${policyStr.substring(0, 80)}`,
        );
        return false;
      } catch (e) {
        console.warn(
          `[CommunicationService] ${label} cert validation error for ${pub.slice(0, 8)}:`,
          e,
        );
        return false;
      }
    };

    for (let i = 0; i < 10; i++) {
      try {
        // Method 1: Specific certificate issued for ME — still needs policy validation
        if (myPub) {
          const specificCert = await new Promise<string | null>((resolve) => {
            const timeout = setTimeout(() => resolve(null), 3000);
            this.db.gun
              .get(`~${pub}`)
              .get("certs")
              .get(myPub)
              .once((data: any) => {
                clearTimeout(timeout);
                if (data && typeof data === "string") resolve(data);
                else resolve(null);
              });
          });
          if (specificCert && (await validateCert(specificCert, "specific"))) {
            console.log(
              `[CommunicationService] Found valid specific certificate for ${pub.slice(0, 8)}`,
            );
            this.inboxCertCache.set(pub, specificCert);
            return specificCert;
          }
        }

        // Method 2: Public certificate v13 (latest) — validated
        const v13Cert = await new Promise<string | null>((resolve) => {
          const timeout = setTimeout(() => resolve(null), 3500);
          this.db.gun
            .get(`~${pub}`)
            .get("inbox_cert_v13")
            .once((data: any) => {
              clearTimeout(timeout);
              if (data && typeof data === "string") resolve(data);
              else resolve(null);
            });
        });
        if (v13Cert && (await validateCert(v13Cert, "v13"))) {
          console.log(
            `[CommunicationService] Found valid v13 certificate for ${pub.slice(0, 8)}`,
          );
          this.inboxCertCache.set(pub, v13Cert);
          return v13Cert;
        }

        // Method 3: Public certificate in bundle v8 — validated
        const bundleCert = await new Promise<string | null>((resolve) => {
          const timeout = setTimeout(() => resolve(null), 2000);
          this.db.gun
            .get(`~${pub}`)
            .get("signal_bundle_v8")
            .get("inbox_cert")
            .once((data: any) => {
              clearTimeout(timeout);
              if (data && typeof data === "string") resolve(data);
              else resolve(null);
            });
        });
        if (bundleCert && (await validateCert(bundleCert, "bundle_v8"))) {
          console.log(
            `[CommunicationService] Found valid bundle v8 certificate for ${pub.slice(0, 8)}`,
          );
          this.inboxCertCache.set(pub, bundleCert);
          return bundleCert;
        }

        // Skip v9/v8/root — they never have signal_inbox_v12 policies and will always fail validation
      } catch (e) {}

      const backoff = Math.min(3000, 500 * (i + 1) + Math.random() * 500);
      await new Promise((r) => setTimeout(r, backoff));
    }

    throw new Error(
      `Could not find valid SEA inbox certificate for ${pub.slice(0, 8)} after multiple attempts.`,
    );
  }

  /**
   * Clears the cached certificate for a specific pubkey.
   * Call this when GunDB reports "Certificate verification fail" so we refetch a fresh cert.
   */
  public clearCertCache(pub: string): void {
    this.inboxCertCache.delete(pub);
    console.log(`[CommunicationService] Cleared cert cache for ${pub.slice(0, 8)}`);
  }

  /**
   * Encrypts a message using SEA.secret and SEA.encrypt.
   * Returns a format compatible with existing messaging hooks.
   */
  async encryptMessage(
    recipientUsernameOrPub: string,
    message: string,
  ): Promise<{ type: number; body: string }> {
    return new Promise((resolve, reject) => {
      this.cryptoMutex = this.cryptoMutex.then(async () => {
        try {
          let pubKey = recipientUsernameOrPub;
          if (pubKey.length < 30 || pubKey.startsWith("@")) {
            pubKey = await this.getPubKeyFromUsername(recipientUsernameOrPub);
          }

          const recipientEpub = await this.getEpubFromPub(pubKey);
          const myPair = (this.db.gun.user() as any)?._?.sea;
          if (!myPair) throw new Error("User not logged in");

          let secret = this.secretCache.get(recipientEpub);
          if (!secret) {
            secret = await this.db.sea.secret(recipientEpub, myPair);
            if (secret) this.secretCache.set(recipientEpub, secret);
          }

          if (!secret) throw new Error("DH Derivation failed");

          if (message.startsWith("{")) {
            console.log(
              `[CommunicationService] Encrypting metadata payload (length: ${message.length})`,
            );
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
  async decryptMessage(
    senderUsernameOrPub: string,
    ciphertext: { type: number; body: string },
  ): Promise<string | undefined> {
    try {
      let pubKey = senderUsernameOrPub;
      if (pubKey.length < 30 || pubKey.startsWith("@")) {
        pubKey = await this.getPubKeyFromUsername(senderUsernameOrPub);
      }

      const senderEpub = await this.getEpubFromPub(pubKey);
      if (!senderEpub) {
        console.warn(
          `[CommunicationService] No epub found for ${pubKey.slice(0, 8)}. Cannot decrypt.`,
        );
        return undefined;
      }

      const myPair = this.myPair || (this.db.gun.user() as any)?._?.sea;
      if (!myPair) throw new Error("User keys not available for decryption");

      if (typeof ciphertext.body !== "string") {
        console.warn(
          `[CommunicationService] Body of message from ${pubKey.slice(0, 8)} is not a string (${typeof ciphertext.body}). Skipping decryption.`,
        );
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
        console.warn(
          `[CommunicationService] Could not derive secret for ${pubKey.slice(0, 8)}`,
        );
        return undefined;
      }

      console.log(
        `[CommunicationService] Derived secret for ${pubKey.slice(0, 8)}. Calling SEA.decrypt... (cipher length: ${ciphertext.body.length})`,
      );
      let decrypted;
      try {
        decrypted = await Promise.race([
          this.db.sea.decrypt(ciphertext.body, secret),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("SEA.decrypt timeout")), 10000),
          ),
        ]);
        console.log(
          `[CommunicationService] SEA.decrypt resolved. decryped value type: ${typeof decrypted}`,
        );
      } catch (decryptErr: any) {
        console.error(
          `[CommunicationService] SEA.decrypt threw or timed out:`,
          decryptErr.message,
        );
        decrypted = undefined;
      }

      // If decryption fails, try a one-time "silent heal" by refreshing the epub
      if (decrypted === undefined || decrypted === null) {
        console.log(
          `[CommunicationService] Decryption failed for ${pubKey.slice(0, 8)}. Attempting one-time EPUB refresh...`,
        );

        // Anti-flap guard: if we already refreshed this sender in the last 10s, don't loop
        const lastRefresh = (this as any)._lastRefreshMap?.[pubKey] || 0;
        if (Date.now() - lastRefresh < 10000) {
          console.warn(
            `[CommunicationService] Skipping redundant EPUB refresh for ${pubKey.slice(0, 8)} (anti-flap).`,
          );
          return undefined;
        }
        (this as any)._lastRefreshMap = {
          ...((this as any)._lastRefreshMap || {}),
          [pubKey]: Date.now(),
        };

        this.epubCache.delete(pubKey);
        this.secretCache.delete(senderEpub);
        try {
          const freshEpub = await this.getEpubFromPub(pubKey);
          const freshSecret = await this.db.sea.secret(freshEpub, myPair);
          if (freshSecret) this.secretCache.set(freshEpub, freshSecret);
          else throw new Error("Fresh secret derivation failed");

          decrypted = await Promise.race([
            this.db.sea.decrypt(ciphertext.body, freshSecret),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("SEA.decrypt fresh retry timeout")),
                8000,
              ),
            ),
          ]);

          if (decrypted) {
            console.log(
              `[CommunicationService] Silent heal SUCCESS for ${pubKey.slice(0, 8)}`,
            );
          }
        } catch (e: any) {
          console.warn(
            `[CommunicationService] One-time refresh failed for ${pubKey.slice(0, 8)}:`,
            e.message,
          );
        }
      }

      if (decrypted === undefined || decrypted === null) {
        console.warn(
          `[CommunicationService] SEA Decryption yielded ${decrypted === null ? "NULL" : "UNDEFINED"} for sender: ${pubKey.slice(0, 8)} after retry.`,
        );
        return undefined;
      }

      // Ensure we return a string to avoid .startsWith errors later.
      // If it's an object (file metadata), stringify it so downstream JSON.parse works.
      if (typeof decrypted !== "string") {
        const stringified =
          typeof decrypted === "object"
            ? JSON.stringify(decrypted)
            : String(decrypted);
        console.log(
          `[CommunicationService] Decrypted non-string payload (${typeof decrypted}). Serialized to:`,
          stringified.substring(0, 50),
        );
        return stringified;
      }

      return decrypted;
    } catch (err: any) {
      console.error(
        `[CommunicationService] Error during decryption for ${senderUsernameOrPub}:`,
        err.message,
      );
      return undefined;
    }
  }

  /**
   * Force republish the user's bundle. Useful for fixing synchronization issues.
   */
  async republishBundle(): Promise<void> {
    const username = localStorage.getItem("signal_alias") || "Anonymous";
    const uniqueUsername =
      localStorage.getItem("signal_unique_username") || undefined;
    console.log("[CommunicationService] Action: Force republishing bundle...");
    await this.publishBundle(username, uniqueUsername);
  }

  /**
   * Reset session (No-op in stateless SEA mode, kept for API compatibility).
   */
  async resetSession(contactUsernameOrPub: string): Promise<void> {
    console.log(
      `[CommunicationService] Reset requested for ${contactUsernameOrPub} (SEA mode is stateless).`,
    );
    // Clear cache to force fresh epub fetch
    const oldEpub = this.epubCache.get(contactUsernameOrPub);
    if (oldEpub) this.secretCache.delete(oldEpub);
    this.epubCache.delete(contactUsernameOrPub);
    this.pubkeyCache.delete(contactUsernameOrPub);
  }
}
