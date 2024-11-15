import { gun, user } from '../../../state';
import { checkAuth, isAuthenticated } from './isAuthenticated';
import loginUser from './login';
import registerUser from './register';
import sessionManager from './sessionManager';

const auth = {
  checkAuth,
  isAuthenticated,
  loginUser,
  registerUser,
  logout: () => {
    return new Promise((resolve) => {
      try {
        sessionManager.invalidateSession()
          .then(() => {
            gun.off();
            localStorage.clear();
            sessionStorage.clear();
            isAuthenticated.next(false);
            setTimeout(() => resolve(true), 300);
          })
          .catch(error => {
            console.error('Error during logout:', error);
            resolve(false);
          });
      } catch (error) {
        console.error('Error during logout:', error);
        resolve(false);
      }
    });
  },
  getKeyPair: async () => {
    if (!user || !user._.sea) {
      return user.pair();
    }
    return user._.sea;
  },
  sessionManager
};

export default auth;
