import type {
  StorageType,
  KeyPairType,
  PreKeyPairType,
} from '@privacyresearch/libsignal-protocol-typescript';
import { Direction } from '@privacyresearch/libsignal-protocol-typescript';

/**
 * A persistent SignalProtocol store that uses a single IndexedDB entry ("vault").
 * 
 * To reduce clutter and improve security, all keys are stored in a single 'signal_v3_vault'
 * entry as a serialized JSON object in IndexedDB. This class also handles migration from
 * legacy individual 'signal_*' LocalStorage entries and the old 'signal_v3_vault' LocalStorage entry.
 */
export class SignalStore implements StorageType {
  private store: Map<string, any> = new Map();
  private readonly vaultKey: string;
  private readonly legacyPrefix = 'signal_';
  private readonly dbName = 'SignalStoreDB';
  private readonly storeName = 'vaults';
  private db: IDBDatabase | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  constructor(userPub: string = "default") {
    this.vaultKey = userPub === "default" ? "signal_v3_vault" : `signal_v3_vault_${userPub}`;
    // Eager initialization is handled via `init()`, which should be called
    // right after construction.
  }

  /**
   * Initialize IndexedDB, load vault, and migrate any old LocalStorage data.
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.isInitializing = true;
      try {
        await this.openDB();
        await this.loadFromVault();
        await this.migrateLegacyKeys();
      } finally {
        this.isInitializing = false;
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  private openDB(): Promise<void> {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve();
      if (this.db) return resolve();

      const request = indexedDB.open(this.dbName, 1);

      request.onerror = (event) => {
        console.error('[SignalStore] IndexedDB open error:', event);
        resolve();
      };

      request.onblocked = () => {
        console.warn('[SignalStore] IndexedDB open blocked. Please close other tabs.');
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        
        this.db.onversionchange = () => {
          console.warn('[SignalStore] IndexedDB version change detected. Closing connection.');
          this.db?.close();
          this.db = null;
        };

        this.db.onabort = () => {
          console.error('[SignalStore] IndexedDB connection aborted.');
          this.db = null;
        };

        this.db.onerror = (err) => {
          console.error('[SignalStore] IndexedDB connection error:', err);
        };

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  /**
   * Load the entire store from the single vault entry in IndexedDB.
   */
  private async loadFromVault(): Promise<void> {
    if (!this.db) {
      // IndexedDB failed or is not available. Try loading from localStorage.
      if (typeof localStorage !== 'undefined') {
        // The actual load from localStorage happens in migrateLegacyKeys
      }
      return;
    }

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction([this.storeName], 'readonly');
        const objectStore = transaction.objectStore(this.storeName);
        const request = objectStore.get(this.vaultKey);

        request.onsuccess = (event) => {
          const rawVault = (event.target as IDBRequest).result;
          if (rawVault) {
            try {
              const snapshot = JSON.parse(rawVault);
              for (const [key, val] of Object.entries(snapshot)) {
                this.store.set(key, this.decodeBuffers(val));
              }
              console.log(`[SignalStore] Vault loaded: ${this.store.size} items.`);
            } catch (e) {
              console.error('[SignalStore] Failed to parse vault:', e);
            }
          }
          resolve();
        };

        request.onerror = () => resolve();
      } catch (e) {
        console.error('[SignalStore] Failed to read from IndexedDB:', e);
        resolve();
      }
    });
  }

  /**
   * One-time migration: Find legacy 'signal_*' keys or old vault from LocalStorage,
   * move them to IndexedDB, and delete the legacy entries to clean up.
   */
  private async migrateLegacyKeys(): Promise<void> {
    if (typeof localStorage === 'undefined') return;

    let migratedCount = 0;
    const legacyKeys: string[] = [];

    // Check old vault
    const rawVault = localStorage.getItem(this.vaultKey);
    if (rawVault) {
      try {
        const snapshot = JSON.parse(rawVault);
        for (const [key, val] of Object.entries(snapshot)) {
          // Only add if not already present from IndexedDB
          if (!this.store.has(key)) {
            this.store.set(key, this.decodeBuffers(val));
            migratedCount++;
          }
        }
      } catch (e) {
        console.error('[SignalStore] Failed to parse old LocalStorage vault:', e);
      }
      // Only delete old vault if we successfully migrated to IndexedDB
      if (this.db) {
        legacyKeys.push(this.vaultKey);
      }
    }

    // Check individual legacy keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.legacyPrefix) && key !== this.vaultKey) {
        legacyKeys.push(key);
      }
    }

    if (legacyKeys.length === 0 && migratedCount === 0) return;

    console.log(`[SignalStore] Found old LocalStorage keys. Migrating to ${this.db ? 'IndexedDB' : 'LocalStorage fallback'} vault...`);

    for (const fullKey of legacyKeys) {
      if (fullKey === this.vaultKey) continue; // Already processed

      const raw = localStorage.getItem(fullKey);
      if (raw) {
        try {
          // Robust JSON detection
          let val: any;
          if (raw.startsWith('{') || raw.startsWith('[') || raw.startsWith('"')) {
            val = this.decodeBuffers(JSON.parse(raw));
          } else {
            // It's a plain string (like signal_pub or signal_alias)
            val = raw;
          }
          
          const shortKey = fullKey.slice(this.legacyPrefix.length);
          if (!this.store.has(shortKey)) {
            this.store.set(shortKey, val);
            migratedCount++;
          }
        } catch (e) {
          console.warn(`[SignalStore] Failed to migrate legacy key: ${fullKey}`, e);
        }
      }
    }

    // If we migrated anything, save the new vault and delete old keys
    if (migratedCount > 0) {
      await this.persist();
      for (const fullKey of legacyKeys) {
        localStorage.removeItem(fullKey);
      }
      console.log(`[SignalStore] Migration complete. Items moved to ${this.db ? 'IndexedDB' : 'LocalStorage fallback'}.`);
    }
  }

  /**
   * Persist the entire in-memory Map to the single vault entry.
   */
  private async persist(): Promise<void> {
    const snapshot: Record<string, any> = {};
    for (const [key, val] of this.store.entries()) {
      snapshot[key] = this.encodeBuffers(val);
    }
    const serialized = JSON.stringify(snapshot);

    if (!this.db) {
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(this.vaultKey, serialized);
        } catch (e) {
          console.warn('[SignalStore] Failed to persist to localStorage fallback:', e);
        }
      }
      return;
    }

    return new Promise((resolve) => {
      try {
        if (!this.db) return resolve();
        
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const objectStore = transaction.objectStore(this.storeName);
        
        transaction.onabort = (event) => {
          console.error('[SignalStore] Persist transaction aborted:', event);
          resolve();
        };

        transaction.onerror = (event) => {
          console.error('[SignalStore] Persist transaction error:', event);
          resolve();
        };

        const request = objectStore.put(serialized, this.vaultKey);

        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      } catch (e) {
        console.error('[SignalStore] Failed to persist to IndexedDB:', e);
        // Fallback to localStorage if IDB fails during operation
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(this.vaultKey, serialized);
          } catch (lsErr) {}
        }
        resolve();
      }
    });
  }

  // ── Serialization helpers ──────────────────────────────────────

  private encodeBuffers(value: any): any {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return { __ab: this.ab2b64(value) };
    }
    if (value instanceof Uint8Array) {
      return { __ab: this.ab2b64(value.buffer) };
    }
    if (ArrayBuffer.isView(value)) {
      return { __ab: this.ab2b64((value as any).buffer) };
    }
    if (Array.isArray(value)) {
      return value.map(v => this.encodeBuffers(v));
    }
    const out: any = {};
    for (const k of Object.keys(value)) {
      if (k === '_') continue;
      out[k] = this.encodeBuffers(value[k]);
    }
    return out;
  }

  private decodeBuffers(value: any): any {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if ('__ab' in value) {
      return this.b642ab(value.__ab);
    }
    if (Array.isArray(value)) {
      return value.map(v => this.decodeBuffers(v));
    }
    const out: any = {};
    for (const k of Object.keys(value)) {
      if (k === '_') continue;
      out[k] = this.decodeBuffers(value[k]);
    }
    return out;
  }

  private ab2b64(buf: ArrayBufferLike): string {
    const bytes = new Uint8Array(buf);
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

  // ── Core get / put / remove ────────────────────────────────────

  async get(key: string, defaultValue: any): Promise<any> {
    if (this.store.has(key)) {
      return this.store.get(key);
    }
    return defaultValue;
  }

  async put(key: string, value: any): Promise<void> {
    // libsignal often passes the same object reference, so we decode the encoded buffers
    // to ensure the in-memory store has clean, fresh objects.
    this.store.set(key, this.decodeBuffers(this.encodeBuffers(value)));
    await this.persist();
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
    await this.persist();
  }

  // ── StorageType interface ──────────────────────────────────────

  async isTrustedIdentity(
    _identifier: string,
    _identityKey: ArrayBuffer,
    _direction: Direction,
  ): Promise<boolean> {
    return true;
  }

  async saveIdentity(
    encodedAddress: string,
    publicKey: ArrayBuffer,
  ): Promise<boolean> {
    await this.put(`identityKey${encodedAddress}`, publicKey);
    return true;
  }

  async loadIdentityKey(encodedAddress: string): Promise<ArrayBuffer | undefined> {
    return this.get(`identityKey${encodedAddress}`, undefined);
  }

  async removeIdentity(encodedAddress: string): Promise<void> {
    await this.remove(`identityKey${encodedAddress}`);
  }

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    return this.get('identityKey', undefined);
  }

  async storeIdentityKey(keyPair: KeyPairType): Promise<void> {
    await this.put('identityKey', keyPair);
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    return this.get('registrationId', undefined);
  }

  async storeRegistrationId(registrationId: number): Promise<void> {
    await this.put('registrationId', registrationId);
  }

  async loadPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    return this.get(`25519KeypreKey${keyId}`, undefined);
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await this.put(`25519KeypreKey${keyId}`, keyPair);
  }

  async bulkStorePreKeys(preKeys: PreKeyPairType[]): Promise<void> {
    for (const pk of preKeys) {
      this.store.set(`25519KeypreKey${pk.keyId}`, this.decodeBuffers(this.encodeBuffers(pk.keyPair)));
    }
    await this.persist();
  }

  async removePreKey(keyId: number | string): Promise<void> {
    await this.remove(`25519KeypreKey${keyId}`);
  }

  getPreKeyCount(): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith('25519KeypreKey')) {
        count++;
      }
    }
    return count;
  }

  async loadSignedPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    return this.get(`25519KeysignedKey${keyId}`, undefined);
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await this.put(`25519KeysignedKey${keyId}`, keyPair);
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    await this.remove(`25519KeysignedKey${keyId}`);
  }

  async loadSession(identifier: string): Promise<string | undefined> {
    return this.get(`session${identifier}`, undefined);
  }

  async storeSession(identifier: string, record: string): Promise<void> {
    await this.put(`session${identifier}`, record);
  }

  async removeSession(identifier: string): Promise<void> {
    await this.remove(`session${identifier}`);
  }

  async removeAllSessions(identifier: string): Promise<void> {
    const toRemove: string[] = [];
    for (const k of this.store.keys()) {
      if (
        k.startsWith(`session${identifier}`) ||
        k.startsWith(`identityKey${identifier}`) ||
        (k.includes('preKey') && k.includes(identifier))
      ) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      this.store.delete(k);
    }
    await this.persist();
  }

  // ── Backup / Restore helpers ──────────────────────────────────

  exportAll(): string {
    const snapshot: Record<string, any> = {};
    for (const [key, val] of this.store.entries()) {
      snapshot[key] = this.encodeBuffers(val);
    }
    return JSON.stringify(snapshot);
  }

  async importAll(serialized: string): Promise<void> {
    const snapshot: Record<string, any> = JSON.parse(serialized);
    this.store.clear();
    for (const [key, val] of Object.entries(snapshot)) {
      this.store.set(key, this.decodeBuffers(val));
    }
    await this.persist();
  }

  /**
   * Clears everything (used on logout).
   */
  async clearAll(): Promise<void> {
    this.store.clear();

    if (this.db) {
      await new Promise<void>((resolve) => {
        try {
          const transaction = this.db!.transaction([this.storeName], 'readwrite');
          const objectStore = transaction.objectStore(this.storeName);
          const request = objectStore.delete(this.vaultKey);

          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        } catch (e) {
          console.error('[SignalStore] Failed to delete vault from IndexedDB:', e);
          resolve();
        }
      });
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.vaultKey);
      // Also clean any legacy keys just in case
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.legacyPrefix)) {
          localStorage.removeItem(key);
        }
      }
    }
  }
}
