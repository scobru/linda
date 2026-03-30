/**
 * Utility to convert GunDB SEA keys (Base64) to Holepunch-compatible Uint8Array keys.
 */

/**
 * Converts a Base64 string to a Uint8Array.
 * Optimized for browser environments.
 */
export function base64ToUint8(base64: string): Uint8Array {
  // Normalize URL-safe base64
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  // Handle padding
  const pad = normalized.length % 4;
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
  
  const binaryString = atob(padded);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts a Uint8Array to a Base64 string.
 */
export function uint8ToBase64(uint8: Uint8Array): string {
  let binaryString = "";
  for (let i = 0; i < uint8.length; i++) {
    binaryString += String.fromCharCode(uint8[i]);
  }
  return btoa(binaryString);
}

/**
 * Extracts Holepunch-compatible keyPair from SeaPair.
 * Noise protocol used in secret-stream typically uses X25519 keys (epub/epriv).
 */
export function seaToHolepunchKeyPair(seaPair: { epub: string; epriv: string }) {
  return {
    publicKey: Buffer.from(base64ToUint8(seaPair.epub)),
    secretKey: Buffer.from(base64ToUint8(seaPair.epriv))
  };
}

/**
 * Extracts a 32-byte topic from a GunDB public key or string.
 * Used for Hyperswarm topic joining.
 */
export async function getTopicFromKey(key: string): Promise<Buffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hashBuffer);
}
