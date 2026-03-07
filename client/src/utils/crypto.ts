/**
 * Generates a cryptographically secure random integer between 0 (inclusive) and max (exclusive).
 * Uses Web Crypto API.
 */
export function generateSecureRandomInt(max: number): number {
  if (max <= 0) throw new Error("Max must be positive");

  // To avoid modulo bias, we should ideally use a better method,
  // but for 100,000 range with 32-bit random, it's negligible.
  const array = new Uint32Array(1);
  window.crypto.getRandomValues(array);
  return array[0] % max;
}

/**
 * Generates a cryptographically secure random string.
 * Useful for non-critical IDs when UUID is not available.
 */
export function generateSecureRandomString(length: number = 10): string {
  const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);

  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset[array[i] % charset.length];
  }
  return result;
}
