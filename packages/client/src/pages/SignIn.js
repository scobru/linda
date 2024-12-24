import React, { useEffect } from "react";
import { authentication, sessionManager } from "linda-protocol";
import toast, { Toaster } from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { gun, user, DAPP_NAME } from "linda-protocol";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "../config/wagmi";

export default function SignIn() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRedirecting, setIsRedirecting] = React.useState(false);
  const navigate = useNavigate();
  const maxRetries = 3;
  const retryDelay = 1000; // 1 secondo tra i tentativi
  const { address, isConnected } = useAccount();
  const [loginMethod, setLoginMethod] = React.useState("traditional"); // 'traditional' o 'metamask'

  useEffect(() => {
    const checkExistingAuth = async () => {
      try {
        const isSessionValid = await sessionManager.validateSession();
        const isAuthenticated =
          localStorage.getItem("isAuthenticated") === "true";
        const storedPub = localStorage.getItem("userPub");

        console.log("Verifica stato autenticazione:", {
          isSessionValid,
          isAuthenticated,
          storedPub,
          userPub: user?.is?.pub,
        });

        if (
          isSessionValid &&
          isAuthenticated &&
          storedPub &&
          user?.is?.pub === storedPub
        ) {
          console.log("Utente già autenticato, reindirizzamento...");
          const redirectPath =
            localStorage.getItem("redirectAfterLogin") || "/homepage";
          localStorage.removeItem("redirectAfterLogin");
          window.location.replace(redirectPath);
        } else {
          // Se non siamo autenticati, pulisci tutto
          console.log("Pulizia stato autenticazione");
          localStorage.removeItem("isAuthenticated");
          localStorage.removeItem("redirectAfterLogin");
          sessionManager.clearSession();
          if (user.is) {
            user.leave();
          }
        }
      } catch (error) {
        console.error("Errore verifica autenticazione:", error);
        localStorage.removeItem("isAuthenticated");
        sessionManager.clearSession();
      }
    };

    checkExistingAuth();
  }, []);

  const handleLogin = async () => {
    if (isLoading || isRedirecting) return;
    if (!username.trim() || !password.trim()) {
      toast.error("Please enter username and password");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Signing in...");

    try {
      // Pulisci lo stato precedente
      if (user.is) {
        user.leave();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      const result = await new Promise((resolve, reject) => {
        authentication.loginUser({ username, password }, (response) => {
          console.log("Login response:", response);
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.errMessage || "Login failed"));
          }
        });
      });

      // Verifica che l'utente sia effettivamente autenticato
      let attempts = 0;
      const maxAttempts = 20;

      while (attempts < maxAttempts && !user?.is?.pub) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }

      if (!user?.is?.pub) {
        throw new Error("Failed to verify authentication");
      }

      toast.success("Sign in successful", { id: toastId });

      // Ottieni lo username originale dall'alias
      const originalUsername = username || user.is.alias?.split(".")[0];

      // Salva nei localStorage
      localStorage.setItem("userPub", user.is.pub);
      localStorage.setItem("username", originalUsername);
      localStorage.setItem("userAlias", originalUsername);

      // Salva nel nodo Gun con tutti i campi necessari
      await gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .get(user.is.pub)
        .put({
          pub: user.is.pub,
          username: originalUsername,
          nickname: "",
          timestamp: Date.now(),
          lastSeen: Date.now(),
          authType: "gun",
        });

      setIsRedirecting(true);
      window.location.href = "/homepage";
    } catch (error) {
      console.error("Login error:", error);
      toast.error(error.message || "Error during login", { id: toastId });

      // Pulisci lo stato in caso di errore
      if (user.is) {
        user.leave();
      }

      setIsLoading(false);
      setIsRedirecting(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !isLoading && !isRedirecting) {
      handleLogin();
    }
  };

  // Effetto per pulire lo stato quando il componente viene smontato
  useEffect(() => {
    return () => {
      if (user.is) {
        user.leave();
      }
    };
  }, []);

  // Effetto per gestire l'autenticazione con MetaMask
  // useEffect(() => {
  //   if (isConnected && address) {
  //     handleMetaMaskLogin();
  //   }
  // }, [isConnected, address]);

  const handleRedirect = () => {
    // Controlla se c'è una pagina salvata per il reindirizzamento
    const redirectPath = localStorage.getItem("redirectAfterLogin");
    if (redirectPath) {
      localStorage.removeItem("redirectAfterLogin");
      window.location.replace(redirectPath);
    } else {
      window.location.replace("/homepage");
    }
  };

  const handleMetaMaskLogin = async () => {
    if (!address) {
      toast.error("Per favore connetti prima il tuo wallet MetaMask");
      return;
    }

    if (isLoading || isRedirecting) return;

    setIsLoading(true);
    const toastId = toast.loading("Accesso con MetaMask in corso...");

    try {
      // Pulisci lo stato precedente
      localStorage.clear(); // Pulisci completamente il localStorage
      sessionManager.clearSession();
      if (user.is) {
        user.leave();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const result = await authentication.loginWithMetaMask(address);
      console.log("Risultato login:", result);

      if (!result.success) {
        throw new Error("Login fallito");
      }

      // Verifica che l'utente sia effettivamente autenticato
      let attempts = 0;
      let isAuthenticated = false;

      while (attempts < 30 && !isAuthenticated) {
        if (user.is && user.is.pub) {
          isAuthenticated = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
        attempts++;
      }

      if (!isAuthenticated) {
        throw new Error("Impossibile verificare l'autenticazione");
      }

      // Prepara i dati della sessione
      const sessionData = {
        userPub: result.pub,
        walletData: {
          address: address.toLowerCase(),
          displayName: `${address.slice(0, 6)}...${address.slice(-4)}`,
          pair: result.userData.pair || user._.sea,
          v_Pair: result.userData.v_Pair,
          s_Pair: result.userData.s_Pair,
        },
      };

      // Salva la sessione
      const sessionSaved = await sessionManager.saveSession(sessionData);
      if (!sessionSaved) {
        throw new Error("Errore nel salvataggio della sessione");
      }

      // Salva dati aggiuntivi
      localStorage.setItem("userPub", result.pub);
      localStorage.setItem("userAddress", address.toLowerCase());
      localStorage.setItem(
        "username",
        result.userData.username || address.toLowerCase()
      );
      localStorage.setItem(
        "userAlias",
        result.userData.username || address.toLowerCase()
      );
      localStorage.setItem(
        "walletAuth",
        JSON.stringify({ address: address.toLowerCase() })
      );

      // Aggiorna il nodo Gun con i dati dell'utente
      await gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .get(user.is.pub)
        .put(
          {
            pub: user.is.pub,
            username: result.userData.username || address.toLowerCase(),
            nickname: "",
            timestamp: Date.now(),
            lastSeen: Date.now(),
            authType: "metamask",
          },
          (ack) => {
            if (ack.err) reject(new Error(ack.err));
            else resolve();
          }
        );

      // Verifica finale dell'autenticazione
      const finalCheck = sessionManager.verifyAuthentication();
      if (!finalCheck) {
        throw new Error("Verifica finale dell'autenticazione fallita");
      }

      // Imposta il flag di autenticazione DOPO che tutto è stato verificato
      localStorage.setItem("isAuthenticated", "true");

      // Mostra il messaggio di successo
      toast.success("Accesso effettuato con successo!", {
        id: toastId,
        duration: 1000,
      });

      // Imposta il flag di reindirizzamento
      setIsRedirecting(true);

      // Forza un delay più lungo per assicurarsi che tutto sia sincronizzato
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verifica finale prima del reindirizzamento
      const finalAuthCheck = await sessionManager.validateSession();
      if (!finalAuthCheck) {
        throw new Error("Verifica finale della sessione fallita");
      }

      // Reindirizza alla homepage o alla pagina salvata
      const redirectPath =
        localStorage.getItem("redirectAfterLogin") || "/homepage";
      localStorage.removeItem("redirectAfterLogin");

      // Forza un reload completo della pagina
      window.location.href = redirectPath;
      window.location.reload(true);
    } catch (error) {
      console.error("Errore login MetaMask:", error);
      // Pulisci tutto in caso di errore
      localStorage.clear();
      sessionManager.clearSession();
      if (user.is) {
        user.leave();
      }

      let errorMessage = "Errore durante l'accesso";

      if (error.message.includes("User rejected")) {
        errorMessage =
          "Hai rifiutato la firma del messaggio. L'accesso è stato annullato.";
      } else if (error.message.includes("not found")) {
        errorMessage = "Account non trovato. Registrati prima di accedere.";
      } else if (error.message.includes("network")) {
        errorMessage =
          "Errore di connessione. Verifica la tua connessione internet.";
      } else if (error.message.includes("verification")) {
        errorMessage = "Impossibile verificare l'autenticazione. Riprova.";
      } else if (error.message.includes("server")) {
        errorMessage = "Impossibile connettersi al server. Riprova più tardi.";
      }

      toast.error(errorMessage, { id: toastId });
      setIsRedirecting(false);
      setIsLoading(false);
    }
  };

  // Aggiungi un effetto per verificare l'autenticazione all'avvio
  useEffect(() => {
    const checkAuth = async () => {
      const isAuth = localStorage.getItem("isAuthenticated") === "true";
      const storedPub = localStorage.getItem("userPub");

      if (isAuth && storedPub && user.is && user.is.pub === storedPub) {
        window.location.replace("/homepage");
      }
    };
    checkAuth();
  }, []);

  // Se stiamo già reindirizzando, mostra un loader
  if (isRedirecting) {
    return (
      <div className="fixed inset-0 bg-gray-50 flex flex-col justify-center items-center z-50">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <p className="mt-4 text-gray-600">Reindirizzamento in corso...</p>
      </div>
    );
  }

  return (
    <>
      <div className="w-screen h-screen flex flex-col justify-center items-center bg-gray-50">
        <div className="text-center -mt-24">
          <p className="text-4xl mb-8">Sign In</p>

          {/* Bottoni per scegliere il metodo di login */}
          <div className="flex justify-center gap-2 mb-6">
            <button
              onClick={() => setLoginMethod("traditional")}
              className={`w-40 py-2 rounded-full transition-colors ${
                loginMethod === "traditional"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Username
            </button>
            <button
              onClick={() => setLoginMethod("metamask")}
              className={`w-40 py-2 rounded-full transition-colors ${
                loginMethod === "metamask"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              MetaMask
            </button>
          </div>

          {loginMethod === "traditional" ? (
            // Form tradizionale
            <div className="flex flex-col place-items-center">
              <input
                className="w-80 h-14 rounded-full text-center border border-gray-300 mb-3"
                type="text"
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={handleKeyPress}
                value={username}
                placeholder="enter username"
                disabled={isLoading || isRedirecting}
              />
              <input
                className="w-80 h-14 rounded-full text-center border border-gray-300 mb-3"
                type="password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                value={password}
                placeholder="enter password"
                disabled={isLoading || isRedirecting}
              />
              <button
                onClick={handleLogin}
                disabled={isLoading || isRedirecting}
                className="w-80 h-14 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded-full mb-3"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Signing in...
                  </div>
                ) : (
                  "Sign In"
                )}
              </button>
            </div>
          ) : (
            // Sezione MetaMask
            <div className="flex flex-col items-center">
              <div className="w-80 mb-3">
                <ConnectButton.Custom>
                  {({
                    account,
                    chain,
                    openAccountModal,
                    openChainModal,
                    openConnectModal,
                    mounted,
                  }) => {
                    return (
                      <div
                        {...(!mounted && {
                          "aria-hidden": true,
                          style: {
                            opacity: 0,
                            pointerEvents: "none",
                            userSelect: "none",
                          },
                        })}
                        className="w-full"
                      >
                        {(() => {
                          if (!mounted || !account || !chain) {
                            return (
                              <button
                                onClick={openConnectModal}
                                type="button"
                                className="w-full h-14 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded-full"
                              >
                                Connetti Wallet
                              </button>
                            );
                          }
                          return (
                            <div className="w-full text-center">
                              <button
                                onClick={openAccountModal}
                                type="button"
                                className="w-full h-14 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded-full"
                              >
                                {account.displayName}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
                <button
                  onClick={handleMetaMaskLogin}
                  type="button"
                  className="w-full h-14 mt-2 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded-full"
                >
                  Accedi con MetaMask
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 mt-6">
            <Link to="/landing">
              <button className="w-80 h-14 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded-full">
                Torna indietro
              </button>
            </Link>

            <Link to="/register">
              <button className="w-80 h-14 bg-white hover:bg-gray-100 text-blue-500 font-bold rounded-full border-2 border-blue-500">
                Crea account
              </button>
            </Link>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            Non hai un account? Registrati ora!
          </div>
        </div>
      </div>
      <Toaster />
    </>
  );
}
