import { useState, useEffect } from 'react';
import { gun } from '../protocol/useGun';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState({ is: null });

  useEffect(() => {
    const checkAuthStatus = () => {
      const currentUser = gun.user().is;
      if (currentUser) {
        setUser({ is: currentUser });
        setIsAuthenticated(true);
      } else {
        setUser({ is: null });
        setIsAuthenticated(false);
      }
    };

    checkAuthStatus();
    const interval = setInterval(checkAuthStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    user,
    isAuthenticated,
    setIsAuthenticated
  };
};
