import { gun, user, DAPP_NAME } from '../useGun.js';

/**
 * Session management utilities for handling user sessions
 * @namespace sessionManager
 */
const sessionManager = {
  /**
   * Validates the current user session
   *
   * Checks if:
   * 1. User is authenticated
   * 2. Session data exists and is not expired (1 hour timeout)
   * 3. Updates the session with current timestamp and device info
   *
   * @async
   * @returns {Promise<boolean>} True if session is valid, false otherwise
   */
  async validateSession() {
    if (!gun || !user) {
      console.warn('Gun or user not initialized');
      return false;
    }

    if (!user.is) {
      return false;
    }

    try {
      const sessionData = await gun.user().get(DAPP_NAME).get('session').once();
      if (!sessionData || Date.now() - sessionData.lastActive > 3600000) {
        await this.invalidateSession();
        return false;
      }

      gun.user().get(DAPP_NAME).get('session').put({
        lastActive: Date.now(),
        device: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
      });
      return true;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  },

  /**
   * Invalidates and terminates the current user session
   *
   * Clears session data and logs out the user
   *
   * @async
   * @returns {Promise<void>}
   */
  async invalidateSession() {
    if (!gun || !user || !user.is) return;
    
    try {
      await gun.user().get('session').put(null);
      user.leave();
    } catch (error) {
      console.error('Error invalidating session:', error);
    }
  },
};

export default sessionManager;
