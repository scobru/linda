import { gun, user } from '../useGun.js';

const logout = () => {
  return new Promise((resolve) => {
    user.leave();
    gun.off();
    resolve({ success: true });
  });
};

export default logout; 