import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated } from "../protocol";
import { useContext } from "react";
import Context from "../contexts/context";

const RequireAuth = ({ children }) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const location = useLocation();
  const { setPub, setAlias } = useContext(Context);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Verifica autenticazione wallet
        const walletAuth = localStorage.getItem("walletAuth");
        if (walletAuth) {
          const { address, timestamp } = JSON.parse(walletAuth);
          // Verifica se l'autenticazione è ancora valida (24h)
          if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
            setIsAuth(true);
            setAuthChecked(true);
            return;
          } else {
            localStorage.removeItem("walletAuth");
          }
        }

        // Verifica autenticazione normale
        const authResult = await isAuthenticated();
        if (authResult.success) {
          setPub(authResult.user.pub);
          setAlias(authResult.user.alias);
          setIsAuth(true);
        } else {
          setIsAuth(false);
        }
      } catch (error) {
        console.error("Errore nella verifica dell'autenticazione:", error);
        setIsAuth(false);
      } finally {
        setAuthChecked(true);
      }
    };

    checkAuth();

    // Polling ridotto a 30 secondi
    const authCheck = setInterval(checkAuth, 30000);

    return () => {
      clearInterval(authCheck);
    };
  }, [setPub, setAlias]);

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

  if (!isAuth) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default RequireAuth;
