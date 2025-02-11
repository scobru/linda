import React, { useEffect, useState } from "react";
import {
  authentication,
  sessionManager,
  gun,
  user,
  DAPP_NAME,
  webAuthn,
} from "#protocol";
import toast, { Toaster } from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "../config/wagmi";

export default function SignIn() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const navigate = useNavigate();
  const maxRetries = 3;
  const retryDelay = 1000; // 1 secondo tra i tentativi
  const { address, isConnected } = useAccount();
  const [authMethod, setAuthMethod] = useState("metamask"); // aggiungo stato per il metodo di autenticazione
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(false);

  useEffect(() => {
    // Verifica se WebAuthn è supportato
    setIsWebAuthnSupported(webAuthn.isSupported());
    
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
      toast.error("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Logging in...");

    try {
      // Pulisci lo stato precedente
      localStorage.clear();
      sessionManager.clearSession();
      if (user.is) {
        user.leave();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const result = await authentication.loginUser({
        username: username.trim(),
        password: password.trim()
      });

      if (!result.success) {
        throw new Error(result.errMessage || "Login failed");
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
        throw new Error("Could not verify authentication");
      }

      // Salva lo stato di autenticazione
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("userPub", result.pub);
      localStorage.setItem("username", username.trim());

      // Verifica che la sessione sia stata salvata correttamente
      const isSessionValid = await sessionManager.validateSession();
      if (!isSessionValid) {
        throw new Error("Session validation failed");
      }

      toast.success("Successfully logged in!", { id: toastId });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const redirectPath = localStorage.getItem("redirectAfterLogin") || "/homepage";
      localStorage.removeItem("redirectAfterLogin");
      window.location.replace(redirectPath);
    } catch (error) {
      console.error("Login error:", error);
      
      let errorMessage = "Login failed";

      if (error.message.includes("Wrong user or password")) {
        errorMessage = "Invalid username or password";
      } else if (error.message.includes("network")) {
        errorMessage = "Network error. Please check your connection.";
      } else if (error.message.includes("verification")) {
        errorMessage = "Could not verify authentication. Please try again.";
      } else if (error.message.includes("session")) {
        errorMessage = "Session validation failed. Please try again.";
      }

      toast.error(errorMessage, { id: toastId });
      
      // Pulisci lo stato in caso di errore
      localStorage.removeItem("isAuthenticated");
      localStorage.removeItem("userPub");
      localStorage.removeItem("username");
      await sessionManager.clearSession();
      if (user.is) {
        user.leave();
      }
    } finally {
      setIsLoading(false);
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
          async (ack) => {
            try {
              if (ack.err) {
                console.error(
                  "Errore durante il salvataggio dei dati utente:",
                  ack.err
                );
              }
              // Continua con il flusso normale
            } catch (error) {
              console.error("Errore durante il callback:", error);
            }
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

  const handleWebAuthnLogin = async () => {
    if (isLoading || isRedirecting) return;
    if (!username.trim()) {
      toast.error("Per favore inserisci il tuo username");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Accesso con WebAuthn in corso...");

    try {
      // Effettua il login con WebAuthn
      const credentials = await webAuthn.login(username.trim());
      
      if (!credentials.success) {
        if (credentials.error?.includes("Nessuna credenziale WebAuthn trovata")) {
          // Verifica se l'utente esiste
          const userExists = await webAuthn.checkExistingUser(username.trim());
          
          if (userExists) {
            // L'utente esiste ma questo dispositivo non è registrato
            toast.error(
              (t) => (
                <div>
                  <p>Questo dispositivo non è ancora registrato per l'accesso WebAuthn.</p>
                  <button
                    onClick={() => {
                      toast.dismiss(t.id);
                      navigate('/register', { 
                        state: { 
                          username: username.trim(),
                          isNewDevice: true 
                        } 
                      });
                    }}
                    className="mt-2 bg-blue-500 text-white px-4 py-2 rounded-full text-sm"
                  >
                    Registra questo dispositivo
                  </button>
                </div>
              ),
              { id: toastId, duration: 5000 }
            );
          } else {
            // L'utente non esiste proprio
            toast.error(
              (t) => (
                <div>
                  <p>Nessun account trovato con questo username.</p>
                  <button
                    onClick={() => {
                      toast.dismiss(t.id);
                      navigate('/register', { 
                        state: { 
                          username: username.trim(),
                          isNewDevice: false 
                        } 
                      });
                    }}
                    className="mt-2 bg-blue-500 text-white px-4 py-2 rounded-full text-sm"
                  >
                    Registrati come nuovo utente
                  </button>
                </div>
              ),
              { id: toastId, duration: 5000 }
            );
          }
          return;
        }
        throw new Error(credentials.error || "Errore durante l'accesso con WebAuthn");
      }

      // Effettua il login completo usando le credenziali generate dal salt
      const result = await authentication.loginUser({
        username: credentials.username,
        password: credentials.password, // Password generata dal salt
        authType: 'webauthn'
      });

      if (result.success) {
        // Salva lo stato di autenticazione
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("userPub", result.pub); // Usa il pub dal risultato del login
        localStorage.setItem("username", credentials.username);
        localStorage.setItem("webauthn_credential_id", credentials.credentialId);

        // Se abbiamo le chiavi di cifratura dal risultato del login, salviamole
        if (result.encryptionKeys) {
          localStorage.setItem(
            `webauthn_keys_${result.pub}`,
            JSON.stringify(result.encryptionKeys)
          );
        }

        // Verifica che la sessione sia stata salvata correttamente
        const isSessionValid = await sessionManager.validateSession();
        if (!isSessionValid) {
          throw new Error("Errore durante il salvataggio della sessione");
        }

        toast.success("Accesso effettuato con successo!", { id: toastId });
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const redirectPath = localStorage.getItem("redirectAfterLogin") || "/homepage";
        localStorage.removeItem("redirectAfterLogin");
        window.location.replace(redirectPath);
      } else {
        throw new Error(result.errMessage || "Errore durante il login");
      }
    } catch (error) {
      console.error("Errore login WebAuthn:", error);
      toast.error(error.message, { id: toastId });
      
      // Pulisci lo stato in caso di errore
      localStorage.removeItem("isAuthenticated");
      localStorage.removeItem("userPub");
      localStorage.removeItem("username");
      localStorage.removeItem("webauthn_credential_id");
      await sessionManager.clearSession();
      if (user.is) {
        user.leave();
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Modifica l'effetto di verifica iniziale
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Se siamo già in fase di reindirizzamento, non fare nulla
        if (isRedirecting) return;

        const isSessionValid = await sessionManager.validateSession();
        const isAuthenticated =
          localStorage.getItem("isAuthenticated") === "true";
        const storedPub = localStorage.getItem("userPub");

        console.log("Verifica stato autenticazione iniziale:", {
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
          const redirectPath =
            localStorage.getItem("redirectAfterLogin") || "/homepage";
          console.log(
            "Utente già autenticato, reindirizzamento a:",
            redirectPath
          );
          localStorage.removeItem("redirectAfterLogin");
          window.location.replace(redirectPath);
        } else {
          // Se non siamo autenticati, pulisci tutto
          console.log("Pulizia stato autenticazione");
          localStorage.removeItem("isAuthenticated");
          localStorage.removeItem("userPub");
          localStorage.removeItem("username");
          await sessionManager.clearSession();
          if (user.is) {
            user.leave();
          }
        }
      } catch (error) {
        console.error("Errore verifica autenticazione iniziale:", error);
      }
    };

    // Esegui il check solo se non siamo in fase di reindirizzamento
    if (!isRedirecting) {
      checkAuth();
    }
  }, [isRedirecting]);

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-100 to-gray-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="text-4xl font-medium mb-8">Sign In</h2>

          {/* Selezione metodo di autenticazione */}
          <div className="flex justify-center space-x-4 mb-6">
            <button
              onClick={() => setAuthMethod("traditional")}
              className={`px-6 py-2 rounded-full transition-colors ${
                authMethod === "traditional" 
                  ? "bg-blue-500 text-white" 
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Password
            </button>
            <button
              onClick={() => setAuthMethod("metamask")}
              className={`px-6 py-2 rounded-full transition-colors ${
                authMethod === "metamask" 
                  ? "bg-blue-500 text-white" 
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              MetaMask
            </button>
            {isWebAuthnSupported && (
              <button
                onClick={() => setAuthMethod("webauthn")}
                className={`px-6 py-2 rounded-full transition-colors ${
                  authMethod === "webauthn" 
                    ? "bg-blue-500 text-white" 
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                WebAuthn
              </button>
            )}
          </div>

          {/* Messaggio informativo per WebAuthn */}
          {authMethod === "webauthn" && (
            <div className="text-sm text-gray-600 text-center mx-auto max-w-sm mb-6 bg-blue-50 p-4 rounded-lg">
              <p>Per accedere con WebAuthn:</p>
              <p>1. Inserisci il tuo username</p>
              <p>2. Clicca su "Accedi con WebAuthn"</p>
              <p>3. Usa il tuo metodo biometrico per autenticarti</p>
            </div>
          )}

          {/* Form tradizionale */}
          {authMethod === "traditional" && (
            <div className="flex flex-col items-center space-y-4">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleLogin()}
                placeholder="Inserisci username"
                className="w-full max-w-xs h-14 rounded-full text-center border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                disabled={isLoading}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleLogin()}
                placeholder="Inserisci password"
                className="w-full max-w-xs h-14 rounded-full text-center border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                disabled={isLoading}
              />
              <button
                onClick={handleLogin}
                disabled={isLoading || !username.trim() || !password.trim()}
                className="w-full max-w-xs h-14 rounded-full bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Accesso in corso...
                  </div>
                ) : (
                  "Accedi"
                )}
              </button>
            </div>
          )}

          {/* Input e bottone per WebAuthn */}
          {authMethod === "webauthn" && (
            <div className="flex flex-col items-center space-y-4">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Inserisci il tuo username"
                className="w-full max-w-xs h-14 rounded-full text-center border border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                disabled={isLoading}
              />
              <button
                onClick={handleWebAuthnLogin}
                disabled={isLoading || !username.trim()}
                className="w-full max-w-xs h-14 rounded-full bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isLoading ? "Accesso in corso..." : "Accedi con WebAuthn"}
              </button>
            </div>
          )}

          {/* Bottone per MetaMask */}
          {authMethod === "metamask" && (
            <div className="flex flex-col items-center space-y-4">
              <div className="w-full max-w-xs">
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
                      >
                        {(() => {
                          if (!mounted || !account || !chain) {
                            return (
                              <button
                                onClick={openConnectModal}
                                className="w-full h-14 rounded-full bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors duration-200"
                              >
                                Connetti Wallet
                              </button>
                            );
                          }
                          return (
                            <button
                              onClick={handleMetaMaskLogin}
                              disabled={isLoading}
                              className="w-full h-14 rounded-full bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                              {isLoading ? "Accesso in corso..." : "Accedi con MetaMask"}
                            </button>
                          );
                        })()}
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
              </div>
            </div>
          )}

          {/* Bottoni di navigazione */}
          <div className="flex flex-col items-center space-y-4 mt-8">
            <Link to="/landing" className="w-full max-w-xs">
              <button className="w-full h-14 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-full transition-colors">
                Torna indietro
              </button>
            </Link>

            <Link to="/register" className="w-full max-w-xs">
              <button className="w-full h-14 bg-white hover:bg-gray-100 text-blue-500 font-medium rounded-full border-2 border-blue-500 transition-colors">
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
    </div>
  );
}
