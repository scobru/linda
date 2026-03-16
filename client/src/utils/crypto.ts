/**
 * Generates a cryptographically secure random integer between 0 (inclusive) and max (exclusive).
 * Uses Web Crypto API.
 */
export function generateSecureRandomInt(max: number): number {
  if (max <= 0) throw new Error("Max must be positive");
  if (max > 4294967296) throw new Error("Max too large for 32-bit random");

  const array = new Uint32Array(1);
  const maxUint32 = 4294967296; // 2^32
  const limit = maxUint32 - (maxUint32 % max);

  let rand: number;
  do {
    window.crypto.getRandomValues(array);
    rand = array[0];
  } while (rand >= limit);

  return rand % max;
}

/**
 * Generates a cryptographically secure random string.
 * Useful for non-critical IDs when UUID is not available.
 */
export function generateSecureRandomString(length: number = 10): string {
  const charset = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset[generateSecureRandomInt(charset.length)];
  }
  return result;
}
