import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { SignalStore } from './SignalStore.ts';

// Mock localStorage
class MockLocalStorage {
  private store: Record<string, string> = {};

  get length() {
    return Object.keys(this.store).length;
  }

  getItem(key: string) {
    return this.store[key] || null;
  }

  setItem(key: string, value: string) {
    this.store[key] = value.toString();
  }

  removeItem(key: string) {
    delete this.store[key];
  }

  clear() {
    this.store = {};
  }

  key(index: number) {
    return Object.keys(this.store)[index] || null;
  }
}

global.localStorage = new MockLocalStorage() as any;

// We need a dummy indexedDB for Node.js tests
declare global {
  var __mockIDBData: Record<string, any>;
}

class MockIDBRequest { 
  onsuccess: ((ev: any) => void) | null = null; 
  onerror: ((ev: any) => void) | null = null; 
  result: any = null; 
}

class MockIDBObjectStore { 
  get(k: string) { 
    const req = new MockIDBRequest(); 
    req.result = global.__mockIDBData?.[k] || null; 
    setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0); 
    return req; 
  } 
  put(v: any, k: string) { 
    const req = new MockIDBRequest(); 
    global.__mockIDBData = global.__mockIDBData || {}; 
    global.__mockIDBData[k] = v; 
    setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0); 
    return req; 
  } 
  delete(k: string) { 
    const req = new MockIDBRequest(); 
    if(global.__mockIDBData) delete global.__mockIDBData[k]; 
    setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0); 
    return req; 
  } 
}
class MockIDBTransaction { objectStore() { return new MockIDBObjectStore(); } }
class MockIDBDatabase { objectStoreNames = { contains: () => true }; createObjectStore() {} transaction() { return new MockIDBTransaction(); } }
class MockIndexedDB { open() { const req = new MockIDBRequest(); req.result = new MockIDBDatabase(); setTimeout(() => req.onsuccess && req.onsuccess({ target: req }), 0); return req; } }
global.indexedDB = new MockIndexedDB() as any;

global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
global.atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');

describe('SignalStore', () => {
  beforeEach(() => {
    global.__mockIDBData = {};
    localStorage.clear();
  });

  test('constructor initializes and loads from vault', async () => {
    // Manually set up a vault entry
    const vaultData = {
      key1: { __ab: Buffer.from('value1').toString('base64') }
    };
    localStorage.setItem('signal_v3_vault', JSON.stringify(vaultData));

    const store = new SignalStore();
    await store.init();
    const val = await store.get('key1', null);
    assert.ok(val instanceof ArrayBuffer);
    assert.strictEqual(Buffer.from(val).toString(), 'value1');
  });

  test('migration from legacy keys', async () => {
    // Set up legacy keys
    localStorage.setItem('signal_legacyKey', JSON.stringify({ __ab: Buffer.from('legacyVal').toString('base64') }));

    const store = new SignalStore();
    await store.init();
    const val = await store.get('legacyKey', null);
    assert.ok(val instanceof ArrayBuffer);
    assert.strictEqual(Buffer.from(val).toString(), 'legacyVal');

    // Verify legacy key is deleted and vault is created
    assert.strictEqual(localStorage.getItem('signal_legacyKey'), null);
    assert.ok(global.__mockIDBData['signal_v3_vault']);
  });

  test('migration of plain strings (non-JSON)', async () => {
    // Set up a plain string legacy key (e.g. username or pubkey)
    localStorage.setItem('signal_user_alias', 'my_alias');

    const store = new SignalStore();
    await store.init();
    const val = await store.get('user_alias', null);
    assert.strictEqual(val, 'my_alias');
    assert.strictEqual(localStorage.getItem('signal_user_alias'), null);
  });

  test('put and get basic values', async () => {
    const store = new SignalStore();
    await store.init();
    await store.put('testKey', 'testValue');
    const val = await store.get('testKey', null);
    assert.strictEqual(val, 'testValue');

    // Verify vault content
    const vault = JSON.parse(global.__mockIDBData['signal_v3_vault'] || '{}');
    assert.strictEqual(vault.testKey, 'testValue');
  });

  test('put and get ArrayBuffer', async () => {
    const store = new SignalStore();
    await store.init();
    const buf = new Uint8Array([1, 2, 3]).buffer;
    await store.put('bufKey', buf);
    const val = await store.get('bufKey', null);
    assert.ok(val instanceof ArrayBuffer);
    assert.deepStrictEqual(new Uint8Array(val), new Uint8Array([1, 2, 3]));
  });

  test('remove', async () => {
    const store = new SignalStore();
    await store.init();
    await store.put('keyToRemove', 'value');
    await store.remove('keyToRemove');
    const val = await store.get('keyToRemove', 'missing');
    assert.strictEqual(val, 'missing');

    const vault = JSON.parse(global.__mockIDBData['signal_v3_vault'] || '{}');
    assert.strictEqual(vault.keyToRemove, undefined);
  });

  test('Signal specific: Identity', async () => {
    const store = new SignalStore();
    await store.init();
    const pubKey = new Uint8Array([7, 8, 9]).buffer;
    await store.saveIdentity('address1', pubKey);
    const loaded = await store.loadIdentityKey('address1');
    assert.deepStrictEqual(new Uint8Array(loaded!), new Uint8Array([7, 8, 9]));

    await store.removeIdentity('address1');
    const removed = await store.loadIdentityKey('address1');
    assert.strictEqual(removed, undefined);
  });

  test('Signal specific: Registration ID', async () => {
    const store = new SignalStore();
    await store.init();

    // Should be undefined initially
    assert.strictEqual(await store.getLocalRegistrationId(), undefined);

    await store.storeRegistrationId(12345);
    assert.strictEqual(await store.getLocalRegistrationId(), 12345);
  });

  test('removeAllSessions', async () => {
    const store = new SignalStore();
    await store.init();
    await store.storeSession('user1', 's1');
    await store.saveIdentity('user1', new Uint8Array([1]).buffer);
    await store.storePreKey('user1_1', { pubKey: new Uint8Array([2]).buffer, privKey: new Uint8Array([3]).buffer });
    await store.storeSession('user2', 's2');

    await store.removeAllSessions('user1');

    assert.strictEqual(await store.loadSession('user1'), undefined);
    assert.strictEqual(await store.loadIdentityKey('user1'), undefined);
    assert.strictEqual(await store.loadPreKey('user1_1'), undefined);
    assert.strictEqual(await store.loadSession('user2'), 's2');
  });

  test('bulkStorePreKeys', async () => {
    const store = new SignalStore();
    await store.init();
    const pk1 = { keyId: 101, keyPair: { pubKey: new Uint8Array([1]).buffer, privKey: new Uint8Array([2]).buffer } };
    const pk2 = { keyId: 102, keyPair: { pubKey: new Uint8Array([3]).buffer, privKey: new Uint8Array([4]).buffer } };

    await store.bulkStorePreKeys([pk1 as any, pk2 as any]);

    const loaded1 = await store.loadPreKey(101);
    const loaded2 = await store.loadPreKey(102);

    assert.deepStrictEqual(new Uint8Array(loaded1!.pubKey), new Uint8Array([1]));
    assert.deepStrictEqual(new Uint8Array(loaded2!.pubKey), new Uint8Array([3]));

    const vault = JSON.parse(global.__mockIDBData['signal_v3_vault'] || '{}');
    assert.ok(vault['25519KeypreKey101']);
    assert.ok(vault['25519KeypreKey102']);
  });

  test('exportAll and importAll', async () => {
    const store1 = new SignalStore();
    await store1.init();
    // Simulate setting data via store
    await store1.put('k1', 'v1');

    const exportData = store1.exportAll();
    localStorage.clear();

    const store2 = new SignalStore();
    await store2.init();
    await store2.importAll(exportData);

    const vault = JSON.parse(global.__mockIDBData['signal_v3_vault'] || '{}');
    assert.strictEqual(vault.k1, 'v1');
  });

  test('clearAll', async () => {
    const store = new SignalStore();
    await store.init();
    await store.put('key', 'val');
    localStorage.setItem('signal_other', 'legacy');

    await store.clearAll();
    assert.strictEqual(localStorage.length, 0);
    assert.strictEqual(global.__mockIDBData['signal_v3_vault'], undefined);
  });
});
