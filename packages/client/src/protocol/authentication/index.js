/**
 * Authentication module for managing user sessions and authentication state
 * @module authentication
 */

import { checkAuth, isAuthenticated, observeAuthState } from './isAuthenticated.js';
import loginUser from './login.js';
import {loginWithMetaMask} from './login.js';
import registerUser, { registerWithMetaMask } from './register.js';
import logout from './logout.js';
import getKeyPair from './getKeyPair.js';
import sessionManager from './sessionManager.js';

/**
 * Authentication module containing all authentication related functions
 * @type {Object}
 */
const authentication = {
  checkAuth,
  isAuthenticated,
  observeAuthState,
  loginUser,
  loginWithMetaMask,
  registerWithMetaMask,
  registerUser,
  logout,
  getKeyPair,
  sessionManager,
};

export {
  checkAuth,
  isAuthenticated,
  observeAuthState,
  loginUser,
  loginWithMetaMask,
  registerUser,
  registerWithMetaMask,
  logout,
  getKeyPair,
  sessionManager,
};

export default authentication;
