import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { sessionManager, user } from "#protocol";
import { useAppState } from "../context/AppContext";

const RequireAuth = ({ children }) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const location = useLocation();
  const { appState, updateAppState } = useAppState();

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
          if (mounted) {
            updateAppState({
              user: user,
              isAuthenticated: true,
              username: username || storedPub,
            });
            setIsAuth(true);
          }
        } else {
          console.log(
            "RequireAuth - Sessione non valida o utente non presente"
          );
          if (mounted) {
            updateAppState({
              user: null,
              isAuthenticated: false,
              username: null,
            });
            setIsAuth(false);
          }
        }
      } catch (error) {
        console.error(
          "RequireAuth - Errore nella verifica dell'autenticazione:",
          error
        );
        if (mounted) {
          updateAppState({
            user: null,
            isAuthenticated: false,
            username: null,
          });
          setIsAuth(false);
        }
      } finally {
        if (mounted) {
          setAuthChecked(true);
        }
      }
    };

    // Esegui il check solo se lo stato di autenticazione non è già definito
    if (!appState.isAuthenticated || !appState.user) {
      checkAuth();
    } else {
      setIsAuth(true);
      setAuthChecked(true);
    }

    return () => {
      mounted = false;
    };
  }, [
    location.pathname,
    updateAppState,
    appState.isAuthenticated,
    appState.user,
  ]);

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

  return children;
};

export default RequireAuth;
