import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sessionManager, user } from "#protocol";
import { useAppState } from "../context/AppContext";

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const { appState, updateAppState } = useAppState();

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Se siamo già in una pagina di autenticazione, non fare il check
        if (
          ["/login", "/register", "/landing"].includes(window.location.pathname)
        ) {
          return;
        }

        const isSessionValid = await sessionManager.validateSession();
        const isAuthenticated =
          localStorage.getItem("isAuthenticated") === "true";
        const storedPub = localStorage.getItem("userPub");

        console.log("AuthProvider - Verifica sessione:", {
          isSessionValid,
          isAuthenticated,
          storedPub,
          userPub: user?.is?.pub,
        });

        if (
          !isSessionValid ||
          !isAuthenticated ||
          !storedPub ||
          !user?.is?.pub ||
          storedPub !== user?.is?.pub
        ) {
          console.log("AuthProvider - Sessione non valida, pulizia...");

          // Pulisci localStorage
          localStorage.removeItem("isAuthenticated");
          localStorage.removeItem("userPub");
          localStorage.removeItem("username");
          localStorage.removeItem("userAlias");
          localStorage.removeItem("userAddress");
          localStorage.removeItem("selectedUser");
          localStorage.removeItem("walletAuth");

          // Pulisci la sessione
          await sessionManager.clearSession();
          if (user.is) {
            user.leave();
          }

          // Aggiorna AppState
          updateAppState({
            user: null,
            isAuthenticated: false,
            username: null,
          });

          // Reindirizza al login se necessario
          if (
            window.location.pathname !== "/login" &&
            window.location.pathname !== "/register" &&
            window.location.pathname !== "/landing"
          ) {
            console.log(
              "AuthProvider - Redirect a /login da:",
              window.location.pathname
            );
            localStorage.setItem(
              "redirectAfterLogin",
              window.location.pathname
            );
            navigate("/login", { replace: true });
          }
        }
      } catch (error) {
        console.error("AuthProvider - Errore verifica sessione:", error);
        updateAppState({
          user: null,
          isAuthenticated: false,
          username: null,
        });
      }
    };

    // Verifica la sessione solo se non siamo già autenticati
    if (!appState.isAuthenticated || !appState.user) {
      // Verifica iniziale
      checkSession();

      // Verifica periodica
      const interval = setInterval(checkSession, 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [navigate, updateAppState, appState.isAuthenticated, appState.user]);

  return children;
};
