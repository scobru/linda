import { user } from '../useGun.js';
import { sessionManager } from '../security/index.js';

export const checkAuth = async () => {
  try {
    if (!user.is) return false;
    return sessionManager.validateSession();
  } catch (error) {
    console.error('Errore verifica autenticazione:', error);
    return false;
  }
};

export const isAuthenticated = () => {
  return !!user.is && sessionManager.validateSession();
};

export default { checkAuth, isAuthenticated };
