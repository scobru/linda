import type { IZenInstance } from "../zen/types";

// Shared config
const ENCRYPTION_CONFIG = {
  saltLength: 16,
  ivLength: 12,
  iterations: 150000,
  hash: 'SHA-256',
  algorithm: 'AES-GCM',
  keyLength: 256,
};

const textEncoder = new TextEncoder();

export const WormholeStatus = {
  CHECKING_RELAY: 'checking-relay',
  ENCRYPTING: 'encrypting',
  UPLOADING: 'uploading',
  PINNING: 'pinning',
  SENT: 'sent',
  UNPINNING: 'unpinning',
  UNPINNED: 'unpinned',
  COMPLETED: 'completed',
  CONNECTING: 'connecting',
  FOUND: 'found',
  DOWNLOADING: 'downloading',
  DECRYPTING: 'decrypting',
  DOWNLOADED: 'downloaded',
  ERROR: 'error',
  NOTICE: 'notice',
} as const;

export type WormholeStatus = typeof WormholeStatus[keyof typeof WormholeStatus];

export interface WormholeProgress {
    progress: number;
    loaded: number;
    total: number;
}

export interface WormholeMetadata {
  version: number;
  algorithm: string;
  iv: string;
  salt: string;
  iterations: number;
  keyLength: number;
  hash: string;
  encryptedFilename: string;
  originalName: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const sanitized = base64.replace(/[\r\n\s]/g, '');
  const binary = atob(sanitized);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeToUint8Array(value: any, label: string): Uint8Array {
  if (!value && value !== 0) {
    throw new Error(`Encryption metadata incomplete: ${label} missing.`);
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  if (Array.isArray(value)) {
    return new Uint8Array(value);
  }

  if (typeof value === 'string') {
    // Check if it's base64 or a weird GunDB soul (though souls shouldn't reach here)
    try {
      return base64ToUint8Array(value);
    } catch (e) {
      console.error(`Failed to decode base64 for ${label}:`, value);
      throw new Error(`Invalid base64 format for ${label}.`);
    }
  }

  if (typeof value === 'object') {
    const numericKeys = Object.keys(value)
      .filter((key) => !Number.isNaN(Number(key)))
      .sort((a, b) => Number(a) - Number(b));
    if (numericKeys.length > 0) {
      return new Uint8Array(numericKeys.map((key) => value[key]));
    }
  }

  throw new Error(`Unsupported encryption metadata format for ${label}.`);
}

async function deriveKeyFromCode(code: string, saltBytes: Uint8Array, iterations : number = ENCRYPTION_CONFIG.iterations) {
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    textEncoder.encode(code),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(saltBytes),
      iterations,
      hash: ENCRYPTION_CONFIG.hash,
    },
    keyMaterial,
    {
      name: ENCRYPTION_CONFIG.algorithm,
      length: ENCRYPTION_CONFIG.keyLength,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

function generateCode(): string {
  const adjectives = [
    'quick', 'lazy', 'happy', 'bright', 'calm', 'wild', 'gentle', 'brave', 'clever', 'kind',
    'swift', 'silent', 'bold', 'fierce', 'mighty', 'frosty', 'golden', 'silver', 'crimson', 'azure',
    'vivid', 'pixel', 'cyber', 'neon', 'solar', 'lunar', 'atomic', 'cosmic', 'omega', 'alpha'
  ];
  const nouns = [
    'cat', 'dog', 'bird', 'fish', 'tree', 'star', 'moon', 'rock', 'wave', 'fire',
    'tiger', 'eagle', 'wolf', 'shark', 'falcon', 'dragon', 'phoenix', 'titan', 'knight', 'scout',
    'rogue', 'ninja', 'robot', 'comet', 'planet', 'nebula', 'galaxy', 'vortex', 'portal', 'matrix'
  ];

  const array = new Uint32Array(3);
  globalThis.crypto.getRandomValues(array);

  const numbers = array[0] % 10000;
  const adj = adjectives[array[1] % adjectives.length];
  const noun = nouns[array[2] % nouns.length];

  // Format: 1234-adjective-noun (e.g., 5829-cosmic-vortex)
  // Entropy: 10,000 * 30 * 30 = 9,000,000 combinations (900x better than before)
  return `${numbers.toString().padStart(4, '0')}-${adj}-${noun}`;
}

export class WormholeService {
  private gun: IZenInstance;
  public onStatusChange: (data: { code: string; status: WormholeStatus; message: string; metadata?: any; fileData?: any }) => void = () => {};
  public onProgress: (data: WormholeProgress & { code: string }) => void = () => {};

  constructor(gun: IZenInstance) {
    this.gun = gun;
  }

  async send({ file, filename, size, type, relayUrl, authToken }: {
    file: File | Blob;
    filename: string;
    size: number;
    type: string;
    relayUrl: string;
    authToken: string;
    lastModified?: number;
  }): Promise<string> {
    const code = generateCode();

    this.onStatusChange({
      code,
      status: WormholeStatus.CHECKING_RELAY,
      message: 'Checking IPFS relay connection...',
    });

    try {
      const healthCheck = await fetch(`${relayUrl}/health`);
      if (!healthCheck.ok) {
        throw new Error('IPFS Relay unreachable');
      }
    } catch (error: any) {
      this.onStatusChange({
        code,
        status: WormholeStatus.ERROR,
        message: `Relay connection error: ${error.message}`,
      });
      throw error;
    }

    try {
      this.onStatusChange({
        code,
        status: WormholeStatus.ENCRYPTING,
        message: 'Encrypting file...',
      });

      const salt = globalThis.crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.saltLength));
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(ENCRYPTION_CONFIG.ivLength));

      const key = await deriveKeyFromCode(code, salt);
      const fileBuffer = await file.arrayBuffer();
      const encryptedBuffer = await globalThis.crypto.subtle.encrypt(
        {
          name: ENCRYPTION_CONFIG.algorithm,
          iv,
        },
        key,
        fileBuffer
      );

      const encryptedBlob = new Blob([encryptedBuffer], { type: 'application/octet-stream' });
      const encryptedFilename = `${filename}.enc`;

      this.onStatusChange({
        code,
        status: WormholeStatus.UPLOADING,
        message: `Uploading ${filename} to IPFS...`,
      });

      const formData = new FormData();
      formData.append('file', encryptedBlob, encryptedFilename);

      const response = await fetch(`${relayUrl}/api/v1/ipfs/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
         throw new Error(`Upload failed with status ${response.status}`);
      }

      const result = await response.json();
      if (!result.success || !result.file?.hash) {
        throw new Error(result.error || 'Invalid response from IPFS Relay');
      }

      const ipfsHash = result.file.hash;

      const encryptionMetadata: WormholeMetadata = {
        version: 1,
        algorithm: ENCRYPTION_CONFIG.algorithm,
        iv: arrayBufferToBase64(iv),
        salt: arrayBufferToBase64(salt),
        iterations: ENCRYPTION_CONFIG.iterations,
        keyLength: ENCRYPTION_CONFIG.keyLength,
        hash: ENCRYPTION_CONFIG.hash,
        encryptedFilename,
        originalName: filename,
      };

      const transferData = {
        filename,
        size,
        type,
        ipfsHash,
        createdAt: Date.now(),
        encrypted: true,
        // We stringify the encryption metadata to ensure it's saved as an atomic value
        // in GunDB, preventing node-splitting race conditions during sync.
        encryption: JSON.stringify(encryptionMetadata),
      };

      // Store in Gun
      this.gun.get(code).put(transferData as any);
      
      // Register for cleanup tracking
      this.gun.get('shogun/wormhole').get('transfers').get(code).put({
        createdAt: transferData.createdAt,
      } as any);

      this.onStatusChange({
        code,
        status: WormholeStatus.SENT,
        message: 'File available. Share the code to start download.',
      });

      // Monitor for completion
      const completionHandler = (data: any) => {
        if (data && data.status === 'completed') {
          this.gun.get(`${code}-received`).off();
          this.onStatusChange({
            code,
            status: WormholeStatus.COMPLETED,
            message: 'Transfer completed by recipient!',
          });
          
          // Cleanup attempt
          fetch(`${relayUrl}/api/v1/ipfs/pin/rm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ cid: ipfsHash }),
          }).then(() => {
            // Remove from cleanup tracking once unpinned
            this.gun.get('shogun/wormhole').get('transfers').get(code).put(null as any);
          }).catch(console.warn);
        }
      };
      this.gun.get(`${code}-received`).on(completionHandler);

      return code;
    } catch (error: any) {
      this.onStatusChange({
        code,
        status: WormholeStatus.ERROR,
        message: error.message,
      });
      throw error;
    }
  }

  async receive(code: string, relayUrl: string): Promise<void> {
    this.onStatusChange({
      code,
      status: WormholeStatus.CONNECTING,
      message: `Searching for transfer: ${code}`,
    });

    return new Promise((resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          this.gun.get(code).off();
          reject(new Error('Timeout searching for transfer metadata'));
        }
      }, 30000);

      this.gun.get(code).on(async (rawMetadata: any) => {
        if (!rawMetadata || !rawMetadata.ipfsHash || resolved) return;

        let metadata = { ...rawMetadata };
        
        // Handle encryption metadata if present and stringified (which we now do in send)
        if (metadata.encrypted && typeof metadata.encryption === 'string') {
          try {
            metadata.encryption = JSON.parse(metadata.encryption);
          } catch (e) {
            console.warn("[Wormhole] Failed to parse encryption metadata string, waiting for potential GunDB sync update...");
            // If it's not valid JSON, it might be a GunDB soul link or partial data. 
            // We return and wait for next .on() update.
            return;
          }
        }

        // Final safety check: if encrypted, we MUST have the parsed encryption object with a salt
        if (metadata.encrypted && (!metadata.encryption || typeof metadata.encryption !== 'object' || !metadata.encryption.salt)) {
            // This happens if GunDB hasn't synchronized the nested node yet (the race condition we're fixing)
            // or if the stringified JSON hasn't fully arrived.
            return;
        }
        
        resolved = true;
        clearTimeout(timeout);
        this.gun.get(code).off();

        this.onStatusChange({
          code,
          status: WormholeStatus.FOUND,
          message: `Transfer found: ${metadata.filename}`,
          metadata,
        });

        this.onStatusChange({
          code,
          status: WormholeStatus.DOWNLOADING,
          message: `Downloading ${metadata.filename} from IPFS...`,
        });

        try {
          const response = await fetch(`${relayUrl}/api/v1/ipfs/cat/${metadata.ipfsHash}`);
          if (!response.ok) throw new Error('Download failed');

          const total = parseInt(response.headers.get('content-length') || '0', 10);
          let loaded = 0;

          const reader = response.body?.getReader();
          if (!reader) throw new Error('ReadableStream not supported');

          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.byteLength;
            if (total > 0) {
              this.onProgress({ progress: Math.round((loaded / total) * 100), loaded, total, code });
            }
          }

          const blob = new Blob(chunks as any);
          let finalBlob = blob;

          if (metadata.encrypted && metadata.encryption) {
            this.onStatusChange({
              code,
              status: WormholeStatus.DECRYPTING,
              message: 'Decrypting file...',
            });

            const enc = metadata.encryption;
            const saltBytes = normalizeToUint8Array(enc.salt, 'salt');
            const ivBytes = normalizeToUint8Array(enc.iv, 'IV');
            const key = await deriveKeyFromCode(code, saltBytes, enc.iterations);
            
            const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
                { name: enc.algorithm || 'AES-GCM', iv: new Uint8Array(ivBytes) },
                key,
                await blob.arrayBuffer()
            );

            finalBlob = new Blob([decryptedBuffer], { type: metadata.type });
          }

          this.onStatusChange({
            code,
            status: WormholeStatus.DOWNLOADED,
            message: 'File downloaded successfully.',
            fileData: {
              blob: finalBlob,
              filename: metadata.filename,
              type: metadata.type,
            },
          });

          // Notify sender
          this.gun.get(`${code}-received`).put({
            status: 'completed',
            timestamp: Date.now(),
          } as any);

          resolve();
        } catch (error: any) {
          this.onStatusChange({
            code,
            status: WormholeStatus.ERROR,
            message: error.message,
          });
          reject(error);
        }
      });
    });
  }

  /**
   * Cleans up transfers that have been pending for too long without completion.
   */
  async cleanupStaleTransfers(relayUrl: string, authToken: string, maxAgeMs: number = 7200000) { // Default 2 hours
    console.log(`[Wormhole] Running stale transfer cleanup (threshold: ${maxAgeMs/3600000}h)...`);
    const now = Date.now();
    
    this.gun.get('shogun/wormhole').get('transfers').map().once(async (data: any, code: string) => {
      if (!data || !data.createdAt || !code || code === '_') return;
      
      const age = now - data.createdAt;
      if (age > maxAgeMs) {
        console.log(`[Wormhole] Cleanup: Found stale transfer ${code} (age: ${Math.round(age/60000)}m)`);
        
        // Fetch original transfer data to get IPFS hash
        this.gun.get(code).once(async (transfer: any) => {
          if (transfer && transfer.ipfsHash) {
            console.log(`[Wormhole] Cleanup: Unpinning ${transfer.ipfsHash} for ${code}...`);
            try {
              await fetch(`${relayUrl}/api/v1/ipfs/pin/rm`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({ cid: transfer.ipfsHash }),
              });
            } catch (e) {
              console.warn(`[Wormhole] Cleanup unpin failed for ${code}:`, e);
            }
          }
          
          // Remove from GunDB completely
          this.gun.get(code).put(null as any);
          this.gun.get(`${code}-received`).put(null as any);
          this.gun.get('shogun/wormhole').get('transfers').get(code).put(null as any);
        });
      }
    });
  }
}
