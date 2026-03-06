import type {
  StorageType,
  KeyPairType,
} from '@privacyresearch/libsignal-protocol-typescript';
import { Direction } from '@privacyresearch/libsignal-protocol-typescript';

/**
 * A persistent SignalProtocol store that uses localStorage.
 * 
 * The main challenge: libsignal uses ArrayBuffer extensively, but
 * JSON.stringify({}) silently turns ArrayBuffer into `{}`.
 * We solve this by encoding ALL values as base64 strings before
 * writing to localStorage, and decoding them back on read.
 * This avoids any nested-object serialization headaches.
 */
export class SignalStore implements StorageType {
  private store: Map<string, any> = new Map();
  private prefix: string;

  constructor(prefix = 'signal_') {
    this.prefix = prefix;
    this.loadAllFromStorage();
  }

  /**
   * On construction, eagerly load every signal_* key from localStorage
   * into the in-memory Map so that libsignal can find sessions/keys
   * without any async gaps.
   */
  private loadAllFromStorage(): void {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const val = this.deserialize(raw);
            this.store.set(key.slice(this.prefix.length), val);
          } catch (e) {
            // corrupted entry, skip
          }
        }
      }
    }
  }

  // ── Serialization helpers ──────────────────────────────────────
  // We walk the value tree and convert ArrayBuffer / Uint8Array to
  // { __ab: "<base64>" } markers, then JSON.stringify the result.

  private serialize(value: any): string {
    return JSON.stringify(this.encodeBuffers(value));
  }

  private deserialize(raw: string): any {
    return this.decodeBuffers(JSON.parse(raw));
  }

  private encodeBuffers(value: any): any {
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
    if (value !== null && typeof value === 'object') {
      const out: any = {};
      for (const k of Object.keys(value)) {
        out[k] = this.encodeBuffers(value[k]);
      }
      return out;
    }
    return value;
  }

  private decodeBuffers(value: any): any {
    if (value !== null && typeof value === 'object' && '__ab' in value) {
      return this.b642ab(value.__ab);
    }
    if (Array.isArray(value)) {
      return value.map(v => this.decodeBuffers(v));
    }
    if (value !== null && typeof value === 'object') {
      const out: any = {};
      for (const k of Object.keys(value)) {
        out[k] = this.decodeBuffers(value[k]);
      }
      return out;
    }
    return value;
  }

  private ab2b64(buf: ArrayBufferLike): string {
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

  // ── Core get / put / remove ────────────────────────────────────

  async get(key: string, defaultValue: any): Promise<any> {
    if (this.store.has(key)) {
      return this.store.get(key);
    }
    return defaultValue;
  }

  async put(key: string, value: any): Promise<void> {
    this.store.set(key, value);
    localStorage.setItem(this.prefix + key, this.serialize(value));
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
    localStorage.removeItem(this.prefix + key);
  }

  // ── StorageType interface ──────────────────────────────────────

  async isTrustedIdentity(
    _identifier: string,
    _identityKey: ArrayBuffer,
    _direction: Direction,
  ): Promise<boolean> {
    return true; // simplified for PoC
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
      // Clear sessions, identity keys, and prekeys related to this specific identifier/address
      if (
        k.startsWith(`session${identifier}`) ||
        k.startsWith(`identityKey${identifier}`) ||
        (k.includes('preKey') && k.includes(identifier))
      ) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      await this.remove(k);
    }
  }

  // ── Backup / Restore helpers ──────────────────────────────────

  /**
   * Export every key in the store as a single JSON-safe object.
   * ArrayBuffers are already encoded as base64 in the serialized form.
   */
  exportAll(): string {
    const snapshot: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        const raw = localStorage.getItem(key);
        if (raw) {
          // Store with the short key (without prefix)
          snapshot[key.slice(this.prefix.length)] = raw;
        }
      }
    }
    return JSON.stringify(snapshot);
  }

  /**
   * Import keys from a snapshot previously created by exportAll().
   * Overwrites existing local keys and reloads the in-memory Map.
   */
  importAll(serialized: string): void {
    const snapshot: Record<string, string> = JSON.parse(serialized);
    for (const [key, raw] of Object.entries(snapshot)) {
      localStorage.setItem(this.prefix + key, raw);
    }
    // Reload everything into the in-memory Map
    this.store.clear();
    this.loadAllFromStorage();
  }
}
