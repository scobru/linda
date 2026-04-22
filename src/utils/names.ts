
const adjectives = [
  'Astro', 'Cyber', 'Neon', 'Void', 'Zen', 'Meta', 'Solar', 'Lunar', 'Ghost', 'Nova',
  'Quantum', 'Sonic', 'Plasma', 'Electric', 'Turbo', 'Shadow', 'Silent', 'Vivid', 'Pixel', 'Digital'
];

const nouns = [
  'Raider', 'Runner', 'Pilot', 'Nomad', 'Seeker', 'Hunter', 'Drifter', 'Siren', 'Knight', 'Titan',
  'Phoenix', 'Spectre', 'Eagle', 'Wolf', 'Rogue', 'Agent', 'Pulse', 'Spark', 'Vector', 'Echo'
];

/**
 * Generates a random handle like @CyberRunner42
 * @param seed Optional string seed to make it deterministic (e.g. pubkey)
 */
export const generateRandomHandle = (seed?: string): string => {
  let adjIndex: number;
  let nounIndex: number;
  let digits: number;

  if (seed) {
    // Deterministic generation based on seed string
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    const absHash = Math.abs(hash);
    adjIndex = absHash % adjectives.length;
    nounIndex = (absHash >> 8) % nouns.length;
    digits = (absHash % 9000) + 1000;
  } else {
    // Truly random
    adjIndex = Math.floor(Math.random() * adjectives.length);
    nounIndex = Math.floor(Math.random() * nouns.length);
    digits = Math.floor(1000 + Math.random() * 9000);
  }

  return `@${adjectives[adjIndex]}${nouns[nounIndex]}${digits}`;
};
