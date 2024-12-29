/**
 * @module sessionManager
 * @description Gestisce le sessioni degli utenti
 */

export const sessionManager = {
  saveSession: (data) => {
    try {
      localStorage.setItem('session', JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Errore nel salvataggio della sessione:', error);
      return false;
    }
  },

  getSession: () => {
    try {
      const session = localStorage.getItem('session');
      return session ? JSON.parse(session) : null;
    } catch (error) {
      console.error('Errore nel recupero della sessione:', error);
      return null;
    }
  },

  clearSession: () => {
    try {
      localStorage.removeItem('session');
      return true;
    } catch (error) {
      console.error('Errore nella pulizia della sessione:', error);
      return false;
    }
  },

  validateSession: () => {
    try {
      const session = sessionManager.getSession();
      return !!session;
    } catch (error) {
      console.error('Errore nella validazione della sessione:', error);
      return false;
    }
  },
};

export default sessionManager;
