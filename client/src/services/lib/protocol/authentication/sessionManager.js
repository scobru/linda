import { gun, user } from '../../../state';

const sessionManager = {
  async validateSession() {
    if (!user.is) return false;
    
    try {
      const sessionData = await gun.user().get('session').once();
      if (!sessionData || Date.now() - sessionData.lastActive > 3600000) {
        await this.invalidateSession();
        return false;
      }
      
      await gun.user().get('session').put({
        lastActive: Date.now(),
        device: navigator.userAgent
      });
      return true;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  },

  async invalidateSession() {
    if (!user.is) return;
    await gun.user().get('session').put(null);
    user.leave();
  }
};

export default sessionManager; 