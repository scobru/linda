import { user, SEA } from '../useGun.js';

export const getKeyPair = async () => {
  if (!user.is) return null;
  return user._.sea;
};

export default { getKeyPair };
