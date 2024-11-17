/**
 * Rate limiter utility to control frequency of actions
 * @namespace rateLimiter
 */
const rateLimiter = {
  /** Map to store rate limit data */
  limits: new Map(),

  /**
   * Checks if an action is allowed based on rate limits
   * @async
   * @param {string} userId - The ID of the user performing the action
   * @param {string} action - The type of action being performed
   * @param {number} [limit=10] - Maximum number of actions allowed in time window
   * @param {number} [timeWindow=60000] - Time window in milliseconds
   * @returns {Promise<boolean>} True if action is allowed
   * @throws {Error} If rate limit is exceeded
   */
  check: async (userId, action, limit = 10, timeWindow = 60000) => {
    const key = `${userId}_${action}`;
    const now = Date.now();
    const userLimits = this.limits.get(key) || [];

    // Remove old actions
    const validActions = userLimits.filter(
      (timestamp) => now - timestamp < timeWindow
    );

    if (validActions.length >= limit) {
      throw new Error('Rate limit exceeded');
    }

    validActions.push(now);
    this.limits.set(key, validActions);
    return true;
  },
};

export default rateLimiter;
