import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { generateSecureRandomInt, generateSecureRandomString } from './crypto.ts';

describe('Crypto Utils', () => {
  before(() => {
    // Mock window.crypto for the test environment
    if (typeof window === 'undefined') {
      (global as any).window = {
        crypto: {
          getRandomValues: (array: any) => crypto.getRandomValues(array)
        }
      };
    }
  });

  describe('generateSecureRandomInt', () => {
    test('should return an integer within the specified range [0, max)', () => {
      const max = 10;
      for (let i = 0; i < 100; i++) {
        const result = generateSecureRandomInt(max);
        assert.ok(Number.isInteger(result), 'Result should be an integer');
        assert.ok(result >= 0 && result < max, `Result ${result} should be between 0 and ${max - 1}`);
      }
    });

    test('should throw error if max is <= 0', () => {
      assert.throws(() => generateSecureRandomInt(0), /Max must be positive/);
      assert.throws(() => generateSecureRandomInt(-5), /Max must be positive/);
    });

    test('should handle large max values correctly', () => {
      const max = 1000000;
      const result = generateSecureRandomInt(max);
      assert.ok(result >= 0 && result < max);
    });
  });

  describe('generateSecureRandomString', () => {
    test('should return a string of the specified length', () => {
      const length = 20;
      const result = generateSecureRandomString(length);
      assert.strictEqual(result.length, length);
    });

    test('should only contain characters from the expected charset', () => {
      const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
      const result = generateSecureRandomString(50);
      for (const char of result) {
        assert.ok(charset.includes(char), `Character ${char} not in charset`);
      }
    });

    test('should default to length 10', () => {
      const result = generateSecureRandomString();
      assert.strictEqual(result.length, 10);
    });
  });
});
