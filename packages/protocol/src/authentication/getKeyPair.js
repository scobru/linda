import { SEA } from '../useGun.js';

const getKeyPair = async () => {
  try {
    const pair = await SEA.pair();
    return { success: true, pair };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default getKeyPair; 