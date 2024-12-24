import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { sessionManager, user } from "linda-protocol";

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      try {
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
          localStorage.removeItem("isAuthenticated");
          localStorage.removeItem("userPub");
          localStorage.removeItem("username");
          localStorage.removeItem("userAlias");
          localStorage.removeItem("userAddress");
          localStorage.removeItem("redirectAfterLogin");
          localStorage.removeItem("selectedUser");
          localStorage.removeItem("walletAuth");

          await sessionManager.clearSession();

          if (user.is) {
            user.leave();
          }

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
        if (
          window.location.pathname !== "/login" &&
          window.location.pathname !== "/register" &&
          window.location.pathname !== "/landing"
        ) {
          console.log(
            "AuthProvider - Redirect a /login dopo errore da:",
            window.location.pathname
          );
          localStorage.setItem("redirectAfterLogin", window.location.pathname);
          navigate("/login", { replace: true });
        }
      }
    };

    // Verifica la sessione ogni minuto
    const interval = setInterval(checkSession, 60 * 1000);

    // Verifica iniziale
    checkSession();

    return () => {
      clearInterval(interval);
      // Pulisci lo stato quando il componente viene smontato
      if (user.is) {
        user.leave();
      }
    };
  }, [navigate]);

  return children;
};
