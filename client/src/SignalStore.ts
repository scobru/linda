import type {
  StorageType,
  KeyPairType,
} from '@privacyresearch/libsignal-protocol-typescript';
import { Direction } from '@privacyresearch/libsignal-protocol-typescript';

/**
 * A persistent SignalProtocol store that uses a single LocalStorage entry ("vault").
 * 
 * To reduce clutter in LocalStorage, all keys are stored in a single 'signal_v3_vault'
 * entry as a serialized JSON object. This class also handles migration from
 * legacy individual 'signal_*' entries.
 */
export class SignalStore implements StorageType {
  private store: Map<string, any> = new Map();
  private readonly vaultKey = 'signal_v3_vault';
  private readonly legacyPrefix = 'signal_';

  constructor() {
    this.loadFromVault();
    this.migrateLegacyKeys();
  }

  /**
   * Load the entire store from the single vault entry.
   */
  private loadFromVault(): void {
    const rawVault = localStorage.getItem(this.vaultKey);
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
  }

  /**
   * One-time migration: Find legacy 'signal_*' keys, move them to the vault,
   * and delete the legacy entries to clean up.
   */
  private migrateLegacyKeys(): void {
    let migratedCount = 0;
    const legacyKeys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Skip the vault itself and only process legacy signal_ keys
      if (key && key.startsWith(this.legacyPrefix) && key !== this.vaultKey) {
        legacyKeys.push(key);
      }
    }

    if (legacyKeys.length === 0) return;

    console.log(`[SignalStore] Found ${legacyKeys.length} legacy keys. Migrating to vault...`);

    for (const fullKey of legacyKeys) {
      const raw = localStorage.getItem(fullKey);
      if (raw) {
        try {
          // Legacy format was also JSON-encoded with __ab markers
          const val = this.decodeBuffers(JSON.parse(raw));
          const shortKey = fullKey.slice(this.legacyPrefix.length);
          this.store.set(shortKey, val);
          migratedCount++;
        } catch (e) {
          console.warn(`[SignalStore] Failed to migrate legacy key: ${fullKey}`);
        }
      }
    }

    // If we migrated anything, save the new vault and delete old keys
    if (migratedCount > 0) {
      this.persist();
      for (const fullKey of legacyKeys) {
        localStorage.removeItem(fullKey);
      }
      console.log(`[SignalStore] Migration complete. ${migratedCount} items moved to vault.`);
    }
  }

  /**
   * Persist the entire in-memory Map to the single vault entry.
   */
  private persist(): void {
    const snapshot: Record<string, any> = {};
    for (const [key, val] of this.store.entries()) {
      snapshot[key] = this.encodeBuffers(val);
    }
    localStorage.setItem(this.vaultKey, JSON.stringify(snapshot));
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
    this.persist();
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
    this.persist();
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
    this.persist();
  }

  // ── Backup / Restore helpers ──────────────────────────────────

  exportAll(): string {
    const snapshot: Record<string, any> = {};
    for (const [key, val] of this.store.entries()) {
      snapshot[key] = this.encodeBuffers(val);
    }
    return JSON.stringify(snapshot);
  }

  importAll(serialized: string): void {
    const snapshot: Record<string, any> = JSON.parse(serialized);
    this.store.clear();
    for (const [key, val] of Object.entries(snapshot)) {
      this.store.set(key, this.decodeBuffers(val));
    }
    this.persist();
  }

  /**
   * Clears everything (used on logout).
   */
  clearAll(): void {
    this.store.clear();
    localStorage.removeItem(this.vaultKey);
    // Also clean any legacy keys just in case
    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.legacyPrefix)) {
        legacyKeys.push(key);
      }
    }
    for (const k of legacyKeys) localStorage.removeItem(k);
  }
}
