import { useCallback, useEffect } from "react";
import { useAppState } from "../context/AppContext";
import { user, auth } from "#protocol";
import { toast } from "react-hot-toast";

export const useAuth = () => {
  const { appState, updateAppState } = useAppState();

  // Effetto per monitorare lo stato di autenticazione
  useEffect(() => {
    const checkAuth = () => {
      const isAuthenticated = !!user?.is;
      updateAppState({ isAuthenticated, currentUser: user?.is || null });
    };

    // Verifica iniziale
    checkAuth();

    // Sottoscrizione ai cambiamenti di autenticazione
    user.on("auth", checkAuth);

    return () => {
      user.off("auth", checkAuth);
    };
  }, [updateAppState]);

  const login = useCallback(async (username, password) => {
    try {
      const result = await auth.login(username, password);
      if (!result.success) {
        throw new Error(result.message || "Errore durante il login");
      }
      toast.success("Login effettuato con successo!");
      return true;
    } catch (error) {
      console.error("Errore durante il login:", error);
      toast.error(error.message || "Errore durante il login");
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
      updateAppState({
        isAuthenticated: false,
        currentUser: null,
        friends: [],
        messages: {},
        activeChat: null,
        walletInfo: null,
      });
      toast.success("Logout effettuato con successo");
    } catch (error) {
      console.error("Errore durante il logout:", error);
      toast.error("Errore durante il logout");
    }
  }, [updateAppState]);

  const register = useCallback(async (username, password) => {
    try {
      const result = await auth.register(username, password);
      if (!result.success) {
        throw new Error(result.message || "Errore durante la registrazione");
      }
      toast.success("Registrazione effettuata con successo!");
      return true;
    } catch (error) {
      console.error("Errore durante la registrazione:", error);
      toast.error(error.message || "Errore durante la registrazione");
      return false;
    }
  }, []);

  return {
    isAuthenticated: appState.isAuthenticated,
    currentUser: appState.currentUser,
    login,
    logout,
    register,
  };
};
