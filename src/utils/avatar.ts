/**
 * Generates a DiceBear avatar URL based on the seed and type.
 * @param seed The unique identifier (pubkey or UUID)
 * @param isGroup Whether to use the group style (shapes) or user style (adventurer)
 * @returns A DiceBear SVG URL
 */
export const getDiceBearAvatar = (seed: string, isGroup: boolean = false): string => {
  const collection = isGroup ? "shapes" : "adventurer";
  // Encode seed to ensure URL safety
  const encodedSeed = encodeURIComponent(seed);
  return `https://api.dicebear.com/9.x/${collection}/svg?seed=${encodedSeed}`;
};
