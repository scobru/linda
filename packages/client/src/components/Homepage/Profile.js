import React from "react";
import { authentication } from "../../protocol";
import { useNavigate } from "react-router-dom";
import Context from "../../contexts/context";
import { toast } from "react-hot-toast";
import { gun, user, DAPP_NAME } from "../../protocol";

export default function Profile() {
  const {
    alias,
    pub,
    setPub,
    setAlias,
    setSelected,
    setFriends,
    setCurrentChat,
  } = React.useContext(Context);
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  // Effetto per ottenere le informazioni dell'utente
  React.useEffect(() => {
    const getUserInfo = async () => {
      try {
        if (!user.is) {
          console.error("Utente non autenticato");
          return;
        }

        // Prima cerca nella lista utenti
        const userPromise = new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("userList")
            .get("users")
            .map()
            .once((userData) => {
              if (userData && userData.pub === user.is.pub) {
                resolve(userData.username);
              }
            });

          // Timeout dopo 2 secondi
          setTimeout(() => resolve(null), 2000);
        });

        const username = await userPromise;

        if (username) {
          setAlias(username);
          setPub(user.is.pub);
        } else {
          // Se non trova nella lista utenti, cerca nel profilo
          gun
            .user()
            .get("profile")
            .get("alias")
            .once((profileAlias) => {
              if (
                profileAlias &&
                typeof profileAlias === "string" &&
                !profileAlias.includes(".")
              ) {
                setAlias(profileAlias);
                setPub(user.is.pub);
              } else {
                // Fallback all'alias di base
                const displayAlias = user.is.alias.includes(".")
                  ? user.is.alias.split(".")[0].substring(0, 8)
                  : user.is.alias;
                setAlias(displayAlias);
                setPub(user.is.pub);
              }
            });
        }

        // Salva/aggiorna l'alias nella lista utenti
        gun.get(DAPP_NAME).get("userList").get("users").set({
          pub: user.is.pub,
          username: alias,
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("Errore nel recupero info utente:", error);
        toast.error("Errore nel recupero delle informazioni utente");
      }
    };

    getUserInfo();
  }, [setPub, setAlias]);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    const toastId = toast.loading("Logout in corso...");

    try {
      // Pulisci prima tutti gli stati
      setSelected(null);
      setFriends([]);
      setCurrentChat(null);
      setPub(null);
      setAlias(null);

      // Emetti l'evento pre-logout
      window.dispatchEvent(new Event("pre-logout"));

      // Attendi un momento per permettere la pulizia
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Esegui il logout
      await authentication.logout();

      toast.success("Logout effettuato con successo", { id: toastId });

      // Forza il reload della pagina dopo il logout
      window.location.href = "/";
    } catch (error) {
      console.error("Errore durante il logout:", error);
      toast.error("Errore durante il logout", { id: toastId });
      setIsLoggingOut(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      if (!pub) throw new Error("Chiave pubblica non disponibile");

      await navigator.clipboard.writeText(pub);
      toast.success("Chiave pubblica copiata!", {
        duration: 2000,
        icon: "✨",
      });
    } catch (error) {
      console.error("Errore copia chiave:", error);
      toast.error("Errore nella copia della chiave");
    }
  };

  if (!alias || !pub) {
    return <div className="animate-pulse">Caricamento...</div>;
  }

  return (
    <div className="flex items-center gap-3">
      <img
        className="w-10 h-10 rounded-full"
        src={`https://api.dicebear.com/7.x/bottts/svg?seed=${alias || "default"}&backgroundColor=b6e3f4`}
        alt=""
      />
      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-medium truncate">{alias || "Utente"}</h2>
        <div className="flex items-center gap-2">
          <p
            className="text-xs text-gray-500 truncate cursor-pointer hover:text-blue-500"
            onClick={copyToClipboard}
            title="Clicca per copiare"
          >
            {pub}
          </p>
        </div>
      </div>
      <button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className={`p-2 hover:bg-gray-100 rounded-full transition-colors ${
          isLoggingOut ? "opacity-50 cursor-not-allowed" : ""
        }`}
        title="Logout"
      >
        {isLoggingOut ? (
          <div className="animate-spin w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full" />
        ) : (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
