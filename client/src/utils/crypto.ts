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

/**
 * Generates a cryptographically secure UUID v4.
 * Uses Web Crypto API's randomUUID if available, falls back to secure random values.
 */
export function generateUUID(): string {
  if (typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function") {
    return (crypto as any).randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = generateSecureRandomInt(16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
