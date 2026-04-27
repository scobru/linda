import { test, describe } from 'node:test';
import assert from 'node:assert';
import { formatUserName } from './ui.ts';

describe('ui utils', () => {
  describe('formatUserName', () => {
    test('should return nickname if provided', () => {
      const id = 'user-id';
      const profile = { nickname: 'John Doe', uniqueUsername: 'johndoe123' };
      assert.strictEqual(formatUserName(id, profile), 'John Doe');
    });

    test('should return uniqueUsername if nickname is missing but uniqueUsername is provided', () => {
      const id = 'user-id';
      const profile = { uniqueUsername: 'johndoe123' };
      assert.strictEqual(formatUserName(id, profile), 'johndoe123');
    });

    test('should truncate long id (> 15 chars) if no profile info is provided', () => {
      const longId = '1234567890abcdefgh'; // 18 chars
      // Expected: first 8 chars + '...' + last 4 chars
      // '12345678' + '...' + 'efgh' = '12345678...efgh'
      assert.strictEqual(formatUserName(longId), '12345678...efgh');
    });

    test('should not truncate short id (<= 15 chars) if no profile info is provided', () => {
      const shortId = '123456789012345'; // 15 chars
      assert.strictEqual(formatUserName(shortId), '123456789012345');
    });

    test('should handle empty profile object by falling back to id', () => {
      const id = 'some-id';
      assert.strictEqual(formatUserName(id, {}), 'some-id');
    });

    test('should handle long id even if profile object exists but lacks name/username', () => {
      const longId = '1234567890abcdefgh';
      assert.strictEqual(formatUserName(longId, {}), '12345678...efgh');
    });
  });
});
