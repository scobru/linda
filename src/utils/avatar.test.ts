import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getDiceBearAvatar } from './avatar.ts';

describe('Avatar Utils', () => {
  describe('getDiceBearAvatar', () => {
    test('should return a valid adventurer URL for users (default)', () => {
      const seed = 'user123';
      const result = getDiceBearAvatar(seed);
      assert.strictEqual(result, 'https://api.dicebear.com/9.x/adventurer/svg?seed=user123');
    });

    test('should return a valid shapes URL for groups', () => {
      const seed = 'group456';
      const result = getDiceBearAvatar(seed, true);
      assert.strictEqual(result, 'https://api.dicebear.com/9.x/shapes/svg?seed=group456');
    });

    test('should correctly encode special characters in the seed', () => {
      const seed = 'user name & @ #';
      const result = getDiceBearAvatar(seed);
      const encodedSeed = encodeURIComponent(seed);
      assert.ok(result.includes(`seed=${encodedSeed}`), `Result ${result} should contain encoded seed ${encodedSeed}`);
      assert.strictEqual(result, `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodedSeed}`);
    });

    test('should handle empty seed', () => {
      const seed = '';
      const result = getDiceBearAvatar(seed);
      assert.strictEqual(result, 'https://api.dicebear.com/9.x/adventurer/svg?seed=');
    });
  });
});
