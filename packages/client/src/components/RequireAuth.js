import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '../protocol/src';
import { useContext } from 'react';
import Context from '../contexts/context';

const RequireAuth = ({ children }) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const location = useLocation();
  const { setPub, setAlias } = useContext(Context);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authResult = await isAuthenticated();
        if (authResult.success) {
          setPub(authResult.user.pub);
          setAlias(authResult.user.alias);
          setIsAuth(true);
        } else {
          setIsAuth(false);
        }
      } catch (error) {
        console.error('Errore nella verifica dell\'autenticazione:', error);
        setIsAuth(false);
      } finally {
        setAuthChecked(true);
      }
    };

    // Aggiungi un piccolo delay per assicurarsi che Gun sia inizializzato
    setTimeout(checkAuth, 500);

    // Polling per verificare lo stato di autenticazione
    const authCheck = setInterval(async () => {
      const authResult = await isAuthenticated();
      if (!authResult.success && isAuth) {
        setIsAuth(false);
      }
    }, 5000);

    return () => {
      clearInterval(authCheck);
    };
  }, [setPub, setAlias]);

  // Mostra un loader mentre verifichiamo l'autenticazione
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="sr-only">Verifica sessione in corso...</span>
          </div>
          <p className="mt-2">Verifica sessione in corso...</p>
        </div>
      </div>
    );
  }

  // Se non autenticato, reindirizza al login
  if (!isAuth) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Se autenticato, mostra il contenuto protetto
  return children;
};

export default RequireAuth; 