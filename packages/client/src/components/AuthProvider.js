import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authentication } from '../protocol';

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const isValid = await authentication.sessionManager.validateSession();
      if (!isValid) {
        navigate('/login');
      }
    };

    // Verifica la sessione ogni 5 minuti
    const interval = setInterval(checkSession, 5 * 60 * 1000);
    
    // Verifica iniziale
    checkSession();

    return () => clearInterval(interval);
  }, [navigate]);

  return children;
}; 