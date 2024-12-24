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
        const storedPub = localStorage.getItem("userPub");

        console.log("RequireAuth - Verifica stato autenticazione:", {
          isSessionValid,
          isAuthenticated,
          storedPub,
          userPub: user?.is?.pub,
          pathname: location.pathname,
        });

        if (
          isSessionValid &&
          isAuthenticated &&
          user?.is?.pub &&
          storedPub === user.is.pub
        ) {
          const username = localStorage.getItem("username");
          setPub(storedPub);
          setAlias(username || storedPub);
          if (mounted) {
            setIsAuth(true);
          }
        } else {
          console.log(
            "RequireAuth - Sessione non valida o utente non presente"
          );
          if (mounted) {
            setIsAuth(false);
          }
        }
      } catch (error) {
        console.error(
          "RequireAuth - Errore nella verifica dell'autenticazione:",
          error
        );
        if (mounted) {
          setIsAuth(false);
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
    if (
      location.pathname !== "/login" &&
      location.pathname !== "/register" &&
      location.pathname !== "/landing"
    ) {
      console.log("RequireAuth - Salvando redirect path:", location.pathname);
      localStorage.setItem("redirectAfterLogin", location.pathname);
    }
    console.log("RequireAuth - Redirect a /login");
    return <Navigate to="/login" replace />;
  }

  // Se siamo autenticati ma siamo su /login, redirect alla homepage o alla pagina salvata
  if (isAuth && location.pathname === "/login") {
    const redirectPath =
      localStorage.getItem("redirectAfterLogin") || "/homepage";
    console.log(
      "RequireAuth - Utente autenticato su /login, reindirizzamento a:",
      redirectPath
    );
    localStorage.removeItem("redirectAfterLogin");
    return <Navigate to={redirectPath} replace />;
  }

  return children;
};

export default RequireAuth;
