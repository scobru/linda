const rateLimiter = {
  limits: new Map(),
  
  check: async (userId, action, limit = 10, timeWindow = 60000) => {
    const key = `${userId}_${action}`;
    const now = Date.now();
    const userLimits = this.limits.get(key) || [];
    
    // Rimuovi le azioni vecchie
    const validActions = userLimits.filter(timestamp => 
      now - timestamp < timeWindow
    );
    
    if (validActions.length >= limit) {
      throw new Error('Rate limit exceeded');
    }
    
    validActions.push(now);
    this.limits.set(key, validActions);
    return true;
  }
};

// Implementazione nel sendMessage
const sendMessage = async (chatId, recipientPub, content, callback = () => {}) => {
  try {
    await rateLimiter.check(user.is.pub, 'send_message', 10, 60000);
    // Resto del codice...
  } catch (error) {
    return callback({
      success: false,
      errMessage: error.message
    });
  }
}; 