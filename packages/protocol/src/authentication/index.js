import { default as loginUser, loginWithMetaMask } from './login.js';
import { default as registerUser, registerWithMetaMask } from './register.js';
import { default as logoutUser } from './logout.js';
import { sessionManager } from './sessionManager.js';
import {
  checkAuth,
  isAuthenticated,
  observeAuthState,
} from './isAuthenticated.js';

// Esporta le funzioni individuali
export {
  loginUser,
  loginWithMetaMask,
  registerUser,
  registerWithMetaMask,
  logoutUser,
  logoutUser as logout,
  sessionManager,
  checkAuth,
  isAuthenticated,
  observeAuthState,
};

// Esporta l'oggetto authentication per retrocompatibilità
export const authentication = {
  loginUser,
  loginWithMetaMask,
  registerUser,
  registerWithMetaMask,
  logoutUser,
  logout: logoutUser,
  sessionManager,
  checkAuth,
  isAuthenticated,
  observeAuthState,
};

// Export default
export default {
  loginUser,
  loginWithMetaMask,
  registerUser,
  registerWithMetaMask,
  logoutUser,
  logout: logoutUser,
  sessionManager,
  checkAuth,
  isAuthenticated,
  observeAuthState,
};
