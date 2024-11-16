import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authentication } from 'linda-protocol';
import { gun, user } from 'linda-protocol';

const RequireAuth = ({ children }) => {
  const location = useLocation();
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    let mounted = true;
    let attempts = 0;
    const maxAttempts = 20;

    const validateSession = async () => {
      try {
        // Verifica se l'utente è presente nel localStorage
        const storedPub = localStorage.getItem('userPub');
        
        if (user.is && user.is.pub && user.is.pub === storedPub) {
          if (mounted) {
            setIsValid(true);
            setIsValidating(false);
          }
          return;
        }

        // Se non c'è corrispondenza, verifica la sessione
        const isValid = await authentication.sessionManager.validateSession();
        
        if (mounted) {
          if (isValid && user.is && user.is.pub) {
            setIsValid(true);
            setIsValidating(false);
            // Aggiorna il localStorage
            localStorage.setItem('userPub', user.is.pub);
            localStorage.setItem('userAlias', user.is.alias || '');
          } else if (attempts >= maxAttempts) {
            setIsValid(false);
            setIsValidating(false);
          } else {
            attempts++;
            setTimeout(validateSession, 300);
          }
        }
      } catch (error) {
        console.error('Session validation error:', error);
        if (mounted && attempts >= maxAttempts) {
          setIsValid(false);
          setIsValidating(false);
        }
      }
    };

    validateSession();

    return () => {
      mounted = false;
    };
  }, []);

  if (isValidating) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <p className="ml-2">Verifica sessione in corso...</p>
      </div>
    );
  }

  if (!isValid) {
    // Pulisci il localStorage quando la sessione non è valida
    localStorage.removeItem('userPub');
    localStorage.removeItem('userAlias');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default RequireAuth; 