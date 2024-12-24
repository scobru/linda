import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { sessionManager, user } from "linda-protocol";
import { useContext } from "react";
import Context from "../contexts/context";

const RequireAuth = ({ children }) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const location = useLocation();
  const { setPub, setAlias } = useContext(Context);

  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      try {
        // Se siamo nella pagina di login, non fare il check
        if (location.pathname === "/login") {
          if (mounted) {
            setAuthChecked(true);
            setIsAuth(false);
          }
          return;
        }

        // Verifica se c'è una sessione valida
        const isSessionValid = await sessionManager.validateSession();
        const isAuthenticated =
          localStorage.getItem("isAuthenticated") === "true";
        console.log("Stato autenticazione:", {
          isSessionValid,
          isAuthenticated,
        });

        if (isSessionValid && isAuthenticated && user?.is?.pub) {
          const userPub = localStorage.getItem("userPub");
          const username = localStorage.getItem("username");

          if (userPub === user.is.pub) {
            setPub(userPub);
            setAlias(username || userPub);
            if (mounted) {
              setIsAuth(true);
            }
          } else {
            console.log("Mismatch tra userPub salvato e user.is.pub");
            if (mounted) {
              setIsAuth(false);
              sessionManager.clearSession();
              localStorage.removeItem("isAuthenticated");
            }
          }
        } else {
          console.log("Sessione non valida o utente non presente");
          if (mounted) {
            setIsAuth(false);
            sessionManager.clearSession();
            localStorage.removeItem("isAuthenticated");
          }
        }
      } catch (error) {
        console.error("Errore nella verifica dell'autenticazione:", error);
        if (mounted) {
          setIsAuth(false);
          sessionManager.clearSession();
          localStorage.removeItem("isAuthenticated");
        }
      } finally {
        if (mounted) {
          setAuthChecked(true);
        }
      }
    };

    checkAuth();

    return () => {
      mounted = false;
    };
  }, [location.pathname, setPub, setAlias]);

  if (!authChecked) {
    return (
      <div className="fixed inset-0 bg-gray-50 flex flex-col justify-center items-center z-50">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <p className="mt-4 text-gray-600">Verifica autenticazione...</p>
      </div>
    );
  }

  if (!isAuth) {
    // Salva la pagina corrente per il reindirizzamento post-login
    if (location.pathname !== "/login") {
      localStorage.setItem("redirectAfterLogin", location.pathname);
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default RequireAuth;
