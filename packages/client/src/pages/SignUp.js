import React from "react";
import {
  authentication,
  DAPP_NAME,
  gun,
  user,
  sessionManager,
  webAuthnService,
} from "#protocol";
import toast, { Toaster } from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "../config/wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// Funzione per aggiornare il toast durante la registrazione
const updateToast = (status, message, progress = "") => {
  toast.loading(
    <div>
      <div className="font-medium">{message}</div>
      {progress && (
        <div className="mt-1 w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full"
            style={{ width: progress }}
          ></div>
        </div>
      )}
    </div>,
    { id: "registration-toast" }
  );
};

// Funzione per verificare la connessione Gun con retry
const checkGunConnectionWithRetry = async (maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const isConnected = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5000);
        gun.get("healthcheck").once((data) => {
          clearTimeout(timeout);
          resolve(true);
        });
      });

      if (isConnected) return true;

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
    } catch (error) {
      console.error("Errore verifica Gun:", error);
      if (i === maxRetries - 1) return false;
    }
  }
  return false;
};

export default function Register() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const [registrationMethod, setRegistrationMethod] =
    React.useState("traditional");
  const [isGunConnected, setIsGunConnected] = React.useState(true);
  const [isWebAuthnSupported, setIsWebAuthnSupported] = React.useState(false);
  const [authMethod, setAuthMethod] = React.useState("metamask");

  React.useEffect(() => {
    // Verifica se WebAuthn è supportato
    setIsWebAuthnSupported(webAuthnService.isSupported());
    
    const checkConnection = async () => {
      const isConnected = await checkGunConnectionWithRetry();
      setIsGunConnected(isConnected);
      if (!isConnected) {
        toast.error("Impossibile connettersi al nodo Gun. Riprova più tardi.");
      }
    };
    checkConnection();
  }, []);

  const handleRegister = async () => {
    if (isLoading) return;
    if (!username.trim() || !password.trim()) {
      toast.error("Per favore inserisci username e password");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Registrazione in corso...");

    try {
      // Pulisci lo stato precedente
      localStorage.clear();
      if (user.is) {
        user.leave();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Registra l'utente con timeout più lungo
      let timeoutId;
      const result = await Promise.race([
        new Promise((resolve, reject) => {
          let hasShownToast = false;

          // Funzione per gestire il caso di username già esistente
          const handleUsernameExists = () => {
            if (hasShownToast)
              return resolve({
                success: false,
                status: "username-esistente",
              });

            hasShownToast = true;
            setIsLoading(false);
            toast.dismiss(toastId);
            toast.error(
              <div className="flex flex-col gap-2 p-2">
                <div className="font-medium">Username già registrato</div>
                <div className="text-sm text-gray-600 mb-2">
                  Questo username è già in uso. Puoi:
                </div>
                <div className="flex flex-col gap-2">
                  <Link
                    to="/signin"
                    state={{ username: username.trim() }}
                    className="text-blue-500 hover:text-blue-700 font-semibold"
                  >
                    Accedi con questo username →
                  </Link>
                  <button
                    onClick={() => {
                      setUsername("");
                      toast.dismiss();
                      setIsLoading(false);
                    }}
                    className="text-gray-500 hover:text-gray-700 text-sm"
                  >
                    Prova con un altro username
                  </button>
                </div>
              </div>,
              {
                duration: 10000,
                style: {
                  background: "#fff",
                  color: "#000",
                  padding: "16px",
                  borderRadius: "8px",
                  maxWidth: "320px",
                },
              }
            );
            return resolve({
              success: false,
              status: "username-esistente",
            });
          };

          const registerCallback = async (response) => {
            try {
              // Se lo username è già in uso, gestisci subito
              if (
                response.status === "username-esistente" ||
                response.errMessage?.includes("già in uso") ||
                response.error?.message?.includes("già in uso")
              ) {
                return handleUsernameExists();
              }

              // Procedi con la registrazione
              if (response.success) {
                toast.success(
                  <div>
                    <div className="font-medium">
                      Registrazione completata con successo!
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Verrai reindirizzato al login...
                    </div>
                  </div>,
                  { id: toastId, duration: 2000 }
                );

                // Attendi che il toast sia mostrato
                await new Promise((resolve) => setTimeout(resolve, 2000));

                // Reindirizza al login con l'username pre-compilato
                navigate("/signin", {
                  replace: true,
                  state: { username: username.trim() },
                });
                resolve(response);
                return;
              } else {
                // Gestisci gli altri stati della registrazione
                if (response.status) {
                  switch (response.status) {
                    case "validazione":
                      updateToast(
                        response.status,
                        "Validazione dati in corso..."
                      );
                      break;
                    case "verifica-esistenza":
                      updateToast(
                        response.status,
                        "Verifica disponibilità username..."
                      );
                      break;
                    case "creazione-utente":
                      updateToast(
                        response.status,
                        "Creazione account in corso..."
                      );
                      break;
                    case "autenticazione":
                      updateToast(
                        response.status,
                        "Autenticazione in corso..."
                      );
                      break;
                    case "generazione-account":
                      updateToast(response.status, "Generazione account...");
                      break;
                    case "preparazione-dati":
                      updateToast(
                        response.status,
                        "Preparazione dati utente..."
                      );
                      break;
                    case "salvataggio":
                      const progress = response.progress
                        ? `${response.progress}%`
                        : "90%";
                      updateToast(
                        response.status,
                        "Salvataggio dati utente...",
                        progress
                      );
                      break;
                    default:
                      break;
                  }
                }

                reject(
                  new Error(
                    response.errMessage || "Errore durante la registrazione"
                  )
                );
              }
            } catch (error) {
              // Se l'errore è relativo allo username già esistente, gestiscilo
              if (error.message?.includes("già in uso")) {
                return handleUsernameExists();
              }
              reject(error);
            }
          };

          authentication.registerUser(
            { username: username.trim(), password: password.trim() },
            registerCallback
          );
        }),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error("Timeout durante la registrazione"));
          }, 120000);
        }),
      ]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
        setIsLoading(false);
      });

      // Se l'username è già in uso, non procedere oltre
      if (!result.success && result.status === "username-esistente") {
        return;
      }

      if (!result || !result.success) {
        throw new Error(
          result?.errMessage || "Errore durante la registrazione"
        );
      }

      // Verifica che l'utente sia effettivamente registrato
      let attempts = 0;
      while (attempts < 30 && !user.is?.pub) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        attempts++;
      }

      if (!user.is?.pub) {
        throw new Error("Verifica registrazione fallita");
      }

      toast.success("Registrazione completata con successo!", {
        id: toastId,
        duration: 2000,
      });

      // Attendi che il toast sia mostrato
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Reindirizza alla pagina di login
      navigate("/signin", { replace: true });
    } catch (error) {
      console.error("Errore registrazione:", error);

      // Pulisci lo stato in caso di errore
      localStorage.clear();
      if (user.is) {
        user.leave();
      }

      let errorMessage = "Errore durante la registrazione";

      if (error.message.includes("già in uso")) {
        setIsLoading(false);
        toast.dismiss(toastId);
        toast(
          (t) => (
            <div className="flex flex-col gap-2 p-2">
              <span className="font-medium">Username già registrato</span>
              <Link
                to="/signin"
                state={{ username: username.trim() }}
                className="text-blue-500 hover:text-blue-700 font-semibold"
                onClick={() => toast.dismiss(t.id)}
              >
                Vai al login →
              </Link>
            </div>
          ),
          {
            duration: 5000,
            style: {
              background: "#fff",
              color: "#000",
              padding: "16px",
              borderRadius: "8px",
            },
          }
        );
        return;
      } else if (error.message.includes("Timeout")) {
        errorMessage = "Timeout durante la registrazione. Riprova.";
      } else if (error.message.includes("network")) {
        errorMessage =
          "Errore di connessione. Verifica la tua connessione internet";
      } else if (error.message.includes("verification")) {
        errorMessage = "Impossibile verificare la registrazione. Riprova";
      } else if (error.message.includes("already being created")) {
        errorMessage =
          "Registrazione già in corso. Attendi qualche secondo e riprova.";
      } else if (error.message.includes("server")) {
        errorMessage = "Impossibile connettersi al server. Riprova più tardi";
      }

      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !isLoading) {
      handleRegister();
    }
  };

  const handleMetaMaskRegister = async () => {
    if (!address) {
      toast.error("Per favore connetti prima il tuo wallet MetaMask");
      return;
    }

    if (!isGunConnected) {
      toast.error("Impossibile connettersi al server. Riprova più tardi.");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Registrazione con MetaMask in corso...");

    try {
      // Verifica se l'indirizzo è già registrato
      const existingUser = await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("addresses")
          .get(address.toLowerCase())
          .once((data) => {
            resolve(data);
          });
        setTimeout(() => resolve(null), 5000);
      });

      if (existingUser) {
        toast.error("Questo indirizzo è già registrato. Prova ad accedere.", {
          id: toastId,
        });
        setIsLoading(false);
        return;
      }

      const result = await authentication.registerWithMetaMask(
        address.toLowerCase()
      );

      if (result.success) {
        toast.success("Registrazione completata con successo!", {
          id: toastId,
        });

        // Mostra un messaggio di successo più dettagliato
        toast.success(
          "Il tuo account è stato creato. Verrai reindirizzato alla pagina di login...",
          { duration: 4000 }
        );

        // Attendi che il toast sia mostrato
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Reindirizza alla pagina di login
        navigate("/signin", { replace: true });
      } else {
        throw new Error(result.errMessage || "Errore durante la registrazione");
      }
    } catch (error) {
      console.error("Errore dettagliato registrazione MetaMask:", {
        message: error.message,
        stack: error.stack,
        error,
      });

      let errorMessage = "Errore durante la registrazione";

      if (error.message.includes("User rejected")) {
        errorMessage =
          "Hai rifiutato la firma del messaggio. La registrazione è stata annullata.";
      } else if (error.message.includes("already registered")) {
        errorMessage = "Questo indirizzo è già registrato. Prova ad accedere.";
      } else if (error.message.includes("network")) {
        errorMessage =
          "Errore di connessione. Verifica la tua connessione internet.";
      } else if (error.message.includes("verification")) {
        errorMessage = "Impossibile verificare la registrazione. Riprova.";
      } else if (error.message.includes("server")) {
        errorMessage = "Impossibile connettersi al server. Riprova più tardi.";
      }

      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  const handleWebAuthnRegister = async () => {
    if (isLoading) return;
    if (!username.trim()) {
      toast.error("Per favore inserisci uno username");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Registrazione con WebAuthn in corso...");

    try {
      // Genera le credenziali WebAuthn con l'username scelto
      const credentials = await webAuthnService.generateCredentials(username.trim());
      
      if (!credentials.success) {
        throw new Error(credentials.error || "Errore durante la generazione delle credenziali");
      }

      // Usa le credenziali generate per registrare l'utente
      const result = await authentication.registerUser({
        username: credentials.username,
        password: credentials.password
      }, (response) => {
        // Gestisci gli stati della registrazione come prima
        if (response.status) {
          switch (response.status) {
            case "validazione":
              updateToast(response.status, "Validazione dati in corso...");
              break;
            case "verifica-esistenza":
              updateToast(response.status, "Verifica disponibilità username...");
              break;
            case "creazione-utente":
              updateToast(response.status, "Creazione account in corso...");
              break;
            case "autenticazione":
              updateToast(response.status, "Autenticazione in corso...");
              break;
            case "generazione-account":
              updateToast(response.status, "Generazione account...");
              break;
            case "preparazione-dati":
              updateToast(response.status, "Preparazione dati utente...");
              break;
            case "salvataggio":
              const progress = response.progress ? `${response.progress}%` : "90%";
              updateToast(response.status, "Salvataggio dati utente...", progress);
              break;
            default:
              break;
          }
        }
      });

      if (result.success) {
        toast.success(
          <div>
            <div className="font-medium">
              Registrazione completata con successo!
            </div>
            <div className="text-sm text-gray-500 mt-1">
              Verrai reindirizzato al login...
            </div>
          </div>,
          { id: toastId, duration: 2000 }
        );

        await new Promise((resolve) => setTimeout(resolve, 2000));
        navigate("/signin", { replace: true });
      } else {
        throw new Error(result.errMessage || "Errore durante la registrazione");
      }
    } catch (error) {
      console.error("Errore registrazione WebAuthn:", error);
      toast.error(error.message, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-100 to-gray-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="text-4xl font-medium mb-8">Sign Up</h2>

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
              <p>Per registrarti con WebAuthn:</p>
              <p>1. Inserisci uno username di tua scelta</p>
              <p>2. Clicca su "Registrati con WebAuthn"</p>
              <p>3. Segui le istruzioni del tuo browser per la verifica biometrica</p>
            </div>
          )}

          {/* Form tradizionale */}
          {authMethod === "traditional" && (
            <div className="flex flex-col items-center space-y-4">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Scegli uno username"
                className="w-full max-w-xs h-14 rounded-full text-center border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                disabled={isLoading}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Scegli una password"
                className="w-full max-w-xs h-14 rounded-full text-center border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                disabled={isLoading}
              />
              <button
                onClick={handleRegister}
                disabled={isLoading || !username.trim() || !password.trim()}
                className="w-full max-w-xs h-14 rounded-full bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isLoading ? "Registrazione in corso..." : "Registrati"}
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
                placeholder="Scegli uno username"
                className="w-full max-w-xs h-14 rounded-full text-center border border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                disabled={isLoading}
              />
              <button
                onClick={handleWebAuthnRegister}
                disabled={isLoading || !username.trim()}
                className="w-full max-w-xs h-14 rounded-full bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isLoading ? "Registrazione in corso..." : "Registrati con WebAuthn"}
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
                              onClick={handleMetaMaskRegister}
                              disabled={isLoading}
                              className="w-full h-14 rounded-full bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                              {isLoading ? "Registrazione in corso..." : "Registrati con MetaMask"}
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
            <Link to="/signin" className="w-full max-w-xs">
              <button className="w-full h-14 bg-white hover:bg-gray-100 text-blue-500 font-medium rounded-full border-2 border-blue-500 transition-colors">
                Hai già un account? Accedi
              </button>
            </Link>

            <Link to="/landing" className="w-full max-w-xs">
              <button className="w-full h-14 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-full transition-colors">
                Torna indietro
              </button>
            </Link>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
