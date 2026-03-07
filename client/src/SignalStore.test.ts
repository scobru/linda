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
global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
global.atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');

describe('SignalStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('constructor initializes and loads from storage', async () => {
    localStorage.setItem('signal_key1', JSON.stringify({ __ab: Buffer.from('value1').toString('base64') }));
    const store = new SignalStore('signal_');
    const val = await store.get('key1', null);
    assert.ok(val instanceof ArrayBuffer);
    assert.strictEqual(Buffer.from(val).toString(), 'value1');
  });

  test('put and get basic values', async () => {
    const store = new SignalStore();
    await store.put('testKey', 'testValue');
    const val = await store.get('testKey', null);
    assert.strictEqual(val, 'testValue');
    assert.strictEqual(localStorage.getItem('signal_testKey'), JSON.stringify('testValue'));
  });

  test('put and get ArrayBuffer', async () => {
    const store = new SignalStore();
    const buf = new Uint8Array([1, 2, 3]).buffer;
    await store.put('bufKey', buf);
    const val = await store.get('bufKey', null);
    assert.ok(val instanceof ArrayBuffer);
    assert.deepStrictEqual(new Uint8Array(val), new Uint8Array([1, 2, 3]));
  });

  test('put and get Uint8Array', async () => {
    const store = new SignalStore();
    const arr = new Uint8Array([4, 5, 6]);
    await store.put('arrKey', arr);
    const val = await store.get('arrKey', null);
    assert.ok(val);
    assert.deepStrictEqual(new Uint8Array(val), new Uint8Array([4, 5, 6]));
  });

  test('remove', async () => {
    const store = new SignalStore();
    await store.put('keyToRemove', 'value');
    await store.remove('keyToRemove');
    const val = await store.get('keyToRemove', 'missing');
    assert.strictEqual(val, 'missing');
    assert.strictEqual(localStorage.getItem('signal_keyToRemove'), null);
  });

  test('Signal specific: Identity', async () => {
    const store = new SignalStore();
    const pubKey = new Uint8Array([7, 8, 9]).buffer;
    await store.saveIdentity('address1', pubKey);
    const loaded = await store.loadIdentityKey('address1');
    assert.deepStrictEqual(new Uint8Array(loaded!), new Uint8Array([7, 8, 9]));

    await store.removeIdentity('address1');
    const removed = await store.loadIdentityKey('address1');
    assert.strictEqual(removed, undefined);
  });

  test('Signal specific: RegistrationId', async () => {
    const store = new SignalStore();
    await store.storeRegistrationId(12345);
    const id = await store.getLocalRegistrationId();
    assert.strictEqual(id, 12345);
  });

  test('Signal specific: PreKeys', async () => {
    const store = new SignalStore();
    const keyPair = { pubKey: new Uint8Array([1]).buffer, privKey: new Uint8Array([2]).buffer };
    await store.storePreKey(1, keyPair);
    assert.strictEqual(store.getPreKeyCount(), 1);
    const loaded = await store.loadPreKey(1);
    assert.deepStrictEqual(new Uint8Array(loaded!.pubKey), new Uint8Array([1]));

    await store.removePreKey(1);
    assert.strictEqual(store.getPreKeyCount(), 0);
  });

  test('Signal specific: Sessions', async () => {
    const store = new SignalStore();
    await store.storeSession('user1', 'sessionRecord');
    const session = await store.loadSession('user1');
    assert.strictEqual(session, 'sessionRecord');

    await store.removeSession('user1');
    const removed = await store.loadSession('user1');
    assert.strictEqual(removed, undefined);
  });

  test('removeAllSessions', async () => {
    const store = new SignalStore();
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

  test('exportAll and importAll', () => {
    const store1 = new SignalStore();
    localStorage.setItem('signal_k1', JSON.stringify('v1'));
    localStorage.setItem('other_key', 'someValue');

    const exportData = store1.exportAll();
    const snapshot = JSON.parse(exportData);
    assert.strictEqual(snapshot.k1, JSON.stringify('v1'));
    assert.strictEqual(snapshot.other_key, undefined);

    localStorage.clear();
    const store2 = new SignalStore();
    store2.importAll(exportData);
    assert.strictEqual(localStorage.getItem('signal_k1'), JSON.stringify('v1'));
  });

  test('robust base64 encoding (bytes > 127)', async () => {
    const store = new SignalStore();
    const buf = new Uint8Array([128, 255, 0, 127]).buffer;
    await store.put('binaryKey', buf);
    const val = await store.get('binaryKey', null);
    assert.ok(val instanceof ArrayBuffer);
    assert.deepStrictEqual(new Uint8Array(val), new Uint8Array([128, 255, 0, 127]));
  });

  test('recursive guard (skips metadata)', async () => {
    const store = new SignalStore();
    const complexObj = {
      data: 'useful',
      _: { some: 'gun-metadata' }
    };
    await store.put('complexKey', complexObj);
    const val = await store.get('complexKey', null);

    // The '_' key should be gone.
    assert.strictEqual(val._, undefined);
    assert.deepStrictEqual(val, { data: 'useful' });
  });
});
