import { describe, it, expect, beforeAll } from 'vitest';
import { ThresholdService } from './ThresholdService';

describe('ThresholdService', () => {
  let ts: ThresholdService;
  
  beforeAll(async () => {
    // Generate a dummy SEA priv
    const dummyPriv = "some_random_dummy_string";
    ts = await ThresholdService.init(dummyPriv);
  });

  it('generates group keys and encrypts a message', async () => {
    const { groupSK, groupPK } = ts.createGroup();
    expect(groupSK).toBeDefined();
    expect(groupPK).toBeDefined();

    const plaintext = new TextEncoder().encode("Hello TPRE!");
    const { capsule, ciphertext } = ts.encryptForGroup(groupPK, plaintext);

    expect(capsule).toBeDefined();
    expect(ciphertext.length).toBeGreaterThan(0);

    // Direct decryption
    const decrypted = ts.decryptDirect(groupSK, capsule, ciphertext);
    expect(new TextDecoder().decode(decrypted)).toBe("Hello TPRE!");
  });

  it('performs threshold re-encryption successfully', async () => {
    const { groupSK, groupPK } = ts.createGroup();
    
    // Simulate Bob (the receiver)
    const bobTS = await ThresholdService.init("bob_priv_key");
    const bobPK = bobTS.getPublicKey();

    // Alice generates KFrags for Bob (2-of-3)
    const kfrags = ts.generateKFragsForMember(groupSK, bobPK, 2, 3);
    expect(kfrags.length).toBe(3);

    // Alice encrypts a message
    const plaintext = new TextEncoder().encode("Secret for Bob");
    const { capsule, ciphertext } = ts.encryptForGroup(groupPK, plaintext);

    // Proxy 1 (Relay) re-encrypts
    const cfrag1 = ts.reencrypt(capsule, kfrags[0]);
    // Proxy 2 (Member) re-encrypts
    const cfrag2 = ts.reencrypt(capsule, kfrags[1]);

    // Bob decrypts utilizing 2 CFRAGs
    const decrypted = bobTS.decryptWithCFrags(groupPK, capsule, [cfrag1, cfrag2], ciphertext);
    expect(new TextDecoder().decode(decrypted)).toBe("Secret for Bob");
  });

  it('fails decryption with insufficient cfrags', async () => {
    const { groupSK, groupPK } = ts.createGroup();
    const bobTS = await ThresholdService.init("bob_priv_key");
    const bobPK = bobTS.getPublicKey();

    const kfrags = ts.generateKFragsForMember(groupSK, bobPK, 2, 3);
    const plaintext = new TextEncoder().encode("Secret for Bob");
    const { capsule, ciphertext } = ts.encryptForGroup(groupPK, plaintext);

    // Only 1 cfrag
    const cfrag1 = ts.reencrypt(capsule, kfrags[0]);

    expect(() => {
        bobTS.decryptWithCFrags(groupPK, capsule, [cfrag1], ciphertext);
    }).toThrow(); // Should fail
  });
});
