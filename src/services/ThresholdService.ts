import * as umbral from '@nucypher/umbral-pre';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

export type VerifiedKeyFrag = umbral.VerifiedKeyFrag;
export type VerifiedCapsuleFrag = umbral.VerifiedCapsuleFrag;
export type Capsule = umbral.Capsule;
export type PublicKey = umbral.PublicKey;
export type SecretKey = umbral.SecretKey;

export interface ThresholdGroupInfo {
  communityPK: string; // Base64 serialized PublicKey
  communitySKEncrypted?: string; // App-level encryption for admin recovery
}

export class ThresholdService {
  private static instance: ThresholdService | null = null;
  private signer: umbral.Signer | null = null;
  private personalSK: umbral.SecretKey | null = null;
  private personalPQSK: Uint8Array | null = null;
  private personalPQPK: Uint8Array | null = null;

  private constructor() {}

  /**
   * Initializes the ThresholdService, waiting for the WASM module.
   */
  public static async init(myGunSeaPrivKey?: string): Promise<ThresholdService> {
    if (this.instance) {
      if (myGunSeaPrivKey && !this.instance.personalSK) {
        await this.instance.initKeys(myGunSeaPrivKey);
      }
      return this.instance;
    }

    // WASM module should be loaded automatically by vite-plugin-wasm
    // We just wrap instantiation here
    const service = new ThresholdService();
    if (myGunSeaPrivKey) {
      await service.initKeys(myGunSeaPrivKey);
    }
    
    this.instance = service;
    return service;
  }

  /**
   * Initialize personal deterministic keys derived from GunDB SEA priv
   */
  private async initKeys(seaPriv: string) {
    if (!seaPriv) return;
    
    // We deterministically derive a Curve25519 scalar using WebCrypto SHA-256
    // Since Umbral is WASM, it expects bytes that we generate securely
    const encoder = new TextEncoder();
    const data = encoder.encode(seaPriv + "threshold_seed");
    const hash = await crypto.subtle.digest('SHA-256', data);
    
    // Umbral SecretKey takes 32 bytes - using big-endian format
    this.personalSK = umbral.SecretKey.fromBEBytes(new Uint8Array(hash));
    this.signer = new umbral.Signer(this.personalSK);

    // PQ Key Derivation (ML-KEM-768 requires a 64-byte seed for deterministic keygen)
    const pqData = encoder.encode(seaPriv + "threshold_pq_seed");
    const pqHash = await crypto.subtle.digest('SHA-512', pqData); // SHA-512 gives 64 bytes
    const pqKeys = ml_kem768.keygen(new Uint8Array(pqHash));
    this.personalPQSK = pqKeys.secretKey;
    this.personalPQPK = pqKeys.publicKey;
  }

  public getPublicKey(): PublicKey {
    if (!this.personalSK) throw new Error("ThresholdService not fully initialized with keys");
    return this.personalSK.publicKey();
  }
  
  public getPublicKeyBase64(): string {
    return this.serializePublicKey(this.getPublicKey());
  }

  public getPQPublicKeyBase64(): string | null {
    if (!this.personalPQPK) return null;
    return Buffer.from(this.personalPQPK).toString('base64');
  }

  /**
   * Hybrid Encapsulation: Generates a shared secret and its PQ capsule.
   */
  public encapsulatePQ(recipientPQPKBase64: string): { capsule: string, sharedSecret: Uint8Array } {
    const recipientPK = new Uint8Array(Buffer.from(recipientPQPKBase64, 'base64'));
    const { cipherText, sharedSecret } = ml_kem768.encapsulate(recipientPK);
    return {
      capsule: Buffer.from(cipherText).toString('base64'),
      sharedSecret
    };
  }

  /**
   * Hybrid Decapsulation: Recovers the shared secret from a PQ capsule.
   */
  public decapsulatePQ(capsuleBase64: string): Uint8Array {
    if (!this.personalPQSK) throw new Error("PQ Secret Key not initialized");
    const capsule = new Uint8Array(Buffer.from(capsuleBase64, 'base64'));
    return ml_kem768.decapsulate(capsule, this.personalPQSK);
  }

  /**
   * Creates a new TPRE group
   */
  public createGroup(): { groupSK: SecretKey, groupPK: PublicKey } {
    const groupSK = umbral.SecretKey.random();
    const groupPK = groupSK.publicKey();
    return { groupSK, groupPK };
  }

  /**
   * Admin generates kfrags for a member + relay
   */
  public generateKFragsForMember(
    groupSK: SecretKey,
    memberPK: PublicKey,
    threshold: number = 2,
    shares: number = 3
  ): VerifiedKeyFrag[] {
    if (!this.signer) throw new Error("Signer not initialized");
    
    // Generate fragments
    const kfrags = umbral.generateKFrags(
      groupSK,
      memberPK,
      this.signer,
      threshold,
      shares,
      true, // enable verification
      true  // enable proof
    );

    return kfrags;
  }

  /**
   * Encrypt a message for the group
   */
  public encryptForGroup(
    groupPK: PublicKey, 
    plaintext: Uint8Array
  ): { capsule: Capsule, ciphertext: Uint8Array } {
    const [capsule, ciphertext] = umbral.encrypt(groupPK, plaintext);
    return { capsule, ciphertext };
  }

  /**
   * Re-encrypts a capsule using a fragment (Proxy role)
   */
  public reencrypt(capsule: Capsule, kfrag: VerifiedKeyFrag): VerifiedCapsuleFrag {
    return umbral.reencrypt(capsule, kfrag);
  }

  /**
   * Target delegatee decrypts utilizing collected cfrags
   */
  public decryptWithCFrags(
    groupPK: PublicKey,
    capsule: Capsule,
    cfrags: VerifiedCapsuleFrag[],
    ciphertext: Uint8Array
  ): Uint8Array {
    if (!this.personalSK) throw new Error("Personal SK not initialized");
    
    return umbral.decryptReencrypted(
      this.personalSK,
      groupPK,
      capsule,
      cfrags,
      ciphertext
    );
  }

  /**
   * Direct decryption by the group admin who holds the full groupSK
   */
  public decryptDirect(
    groupSK: SecretKey, 
    capsule: Capsule, 
    ciphertext: Uint8Array
  ): Uint8Array {
    return umbral.decryptOriginal(groupSK, capsule, ciphertext);
  }

  // --- Serialization Helpers ---

  public serializePublicKey(pk: PublicKey): string {
    return Buffer.from(pk.toCompressedBytes()).toString('base64');
  }

  public deserializePublicKey(data: string): PublicKey {
    return umbral.PublicKey.fromCompressedBytes(new Uint8Array(Buffer.from(data, 'base64')));
  }

  public serializeSecretKey(sk: SecretKey): string {
    return Buffer.from(sk.toBEBytes()).toString('base64');
  }

  public deserializeSecretKey(data: string): SecretKey {
    return umbral.SecretKey.fromBEBytes(new Uint8Array(Buffer.from(data, 'base64')));
  }

  public serializeCapsule(capsule: Capsule): string {
    return Buffer.from(capsule.toBytes()).toString('base64');
  }

  public deserializeCapsule(data: string): Capsule {
    return umbral.Capsule.fromBytes(new Uint8Array(Buffer.from(data, 'base64')));
  }

  public serializeKFrag(kfrag: VerifiedKeyFrag): string {
    return Buffer.from(kfrag.toBytes()).toString('base64');
  }

  public deserializeKFrag(data: string): VerifiedKeyFrag {
    // VerifiedKeyFrag cannot be deserialized directly; we use KeyFrag and then skip verification
    const kfrag = umbral.KeyFrag.fromBytes(new Uint8Array(Buffer.from(data, 'base64')));
    return kfrag.skipVerification();
  }

  public serializeCFrag(cfrag: VerifiedCapsuleFrag): string {
    return Buffer.from(cfrag.toBytes()).toString('base64');
  }

  public deserializeCFrag(data: string): VerifiedCapsuleFrag {
    // VerifiedCapsuleFrag cannot be deserialized directly; we use CapsuleFrag and then skip verification
    const cfrag = umbral.CapsuleFrag.fromBytes(new Uint8Array(Buffer.from(data, 'base64')));
    return cfrag.skipVerification();
  }
}
