import ZEN from 'zen';
import { type IZenPair } from './types';

/**
 * Helper to get the best available Zen cryptographic methods.
 */
const getZenLibrary = (zenInstance?: any) => {
  const candidates: any[] = [];
  
  if (zenInstance) {
    candidates.push(zenInstance);
    if (zenInstance.constructor) candidates.push(zenInstance.constructor);
    if (zenInstance.SEA) candidates.push(zenInstance.SEA);
    if (zenInstance.constructor && zenInstance.constructor.SEA) {
      candidates.push(zenInstance.constructor.SEA);
    }
    if (zenInstance.crypto) candidates.push(zenInstance.crypto);
    if (zenInstance.constructor && zenInstance.constructor.crypto) {
        candidates.push(zenInstance.constructor.crypto);
    }
  }
  
  candidates.push(ZEN);
  if (ZEN && (ZEN as any).SEA) candidates.push((ZEN as any).SEA);
  
  if (typeof window !== 'undefined') {
    const w = window as any;
    const variants = ['Zen', 'ZEN', 'Gun', 'GUN', 'zen', 'gun'];
    for (const v of variants) {
      if (w[v]) {
        candidates.push(w[v]);
        if (w[v].SEA) candidates.push(w[v].SEA);
        if (w[v].crypto) candidates.push(w[v].crypto);
      }
    }
  }

  for (const cand of candidates) {
    if (cand && (typeof cand.pair === 'function' || typeof cand.encrypt === 'function')) {
      return cand;
    }
  }
  
  return ZEN;
};

export async function encrypt(
  data: any,
  key: string | IZenPair,
  zenInstance?: any,
): Promise<any> {
  const zen = getZenLibrary(zenInstance);
  return await zen.encrypt(data, key);
}

export async function decrypt(
  encryptedData: any,
  key: string | IZenPair,
  zenInstance?: any,
): Promise<any> {
  const zen = getZenLibrary(zenInstance);
  return await zen.decrypt(encryptedData, key);
}

export async function sign(data: any, pair: IZenPair, zenInstance?: any) {
  const zen = getZenLibrary(zenInstance);
  return await zen.sign(data, pair);
}

export async function verify(data: any, pub: string, zenInstance?: any) {
  const zen = getZenLibrary(zenInstance);
  return await zen.verify(data, pub);
}

export async function secret(epub: string, pair: IZenPair, zenInstance?: any) {
  const zen = getZenLibrary(zenInstance);
  return await zen.secret(epub, pair);
}

export async function certify(
  who: string | string[],
  policy: any,
  pair: IZenPair,
  zenInstance?: any,
) {
  const zen = getZenLibrary(zenInstance);
  
  if (!zen || typeof zen.certify !== 'function') {
    console.error('[Crypto] zen.certify is unavailable');
    return null;
  }

  try {
    // Some native Zen versions reject '*' as a string for 'who'.
    // We try it first, and if it fails with a specific error or returns null, we try fallback.
    const result = await zen.certify(who, policy, pair);
    if (!result && who === '*') {
      console.warn('[Crypto] Wildcard (*) certification returned null. Retrying with null certificant...');
      return await zen.certify(null as any, policy, pair);
    }
    return result;
  } catch (e: any) {
    const errStr = e?.message || String(e);
    if (who === '*' && (errStr.includes('*') || errStr.includes('certificant'))) {
       console.warn('[Crypto] Native zen rejected wildcard (*). Retrying with null...');
       try {
         return await zen.certify(null as any, policy, pair);
       } catch (innerErr) {
         console.error('[Crypto] Fallback certification failed:', innerErr);
         return null;
       }
    }
    console.error('[Crypto] Certification error:', e);
    return null;
  }
}

export async function generatePairFromSeed(
  seedPhrase: string,
  zenInstance?: any,
): Promise<IZenPair> {
  const zen = getZenLibrary(zenInstance);
  const result = await zen.pair(null, { seed: seedPhrase });
  if (!result) {
    const derivedPassword = await zen.hash(
      seedPhrase,
      'shogun-seed-salt',
      null,
      { name: 'SHA-256' },
    );
    return await zen.pair(null, { password: derivedPassword });
  }
  return result;
}

export async function pair(zenInstance?: any): Promise<IZenPair> {
  const zen = getZenLibrary(zenInstance);
  return await zen.pair();
}
