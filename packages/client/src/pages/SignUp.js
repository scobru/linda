import React from "react";
import {
  authentication,
  DAPP_NAME,
  gun,
  user,
  sessionManager,
} from "linda-protocol";
import toast, { Toaster } from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "../config/wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

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

  React.useEffect(() => {
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
          const registerCallback = (response) => {
            if (response.success) {
              resolve(response);
            } else {
              reject(
                new Error(
                  response.errMessage || "Errore durante la registrazione"
                )
              );
            }
          };

          try {
            authentication.registerUser(
              { username: username.trim(), password: password.trim() },
              registerCallback
            );
          } catch (error) {
            reject(error);
          }
        }),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error("Timeout durante la registrazione"));
          }, 60000); // Aumentato a 60 secondi
        }),
      ]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });

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
        setIsLoading(false);
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

      // Richiedi la firma
      const wantsToSign = window.confirm(
        "Per completare la registrazione, è necessario firmare un messaggio con MetaMask. Vuoi procedere?"
      );

      if (!wantsToSign) {
        toast.error("Registrazione annullata", { id: toastId });
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

  return (
    <div className="w-screen h-screen flex flex-col justify-center items-center bg-gray-50">
      <div className="text-center -mt-24">
        <h2 className="text-4xl mb-8">Sign Up</h2>

        {/* Registration method selection buttons */}
        <div className="flex justify-center gap-2 mb-6">
          <button
            onClick={() => setRegistrationMethod("traditional")}
            className={`w-40 py-2 rounded-full transition-colors ${
              registrationMethod === "traditional"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Username
          </button>
          <button
            onClick={() => setRegistrationMethod("metamask")}
            className={`w-40 py-2 rounded-full transition-colors ${
              registrationMethod === "metamask"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            MetaMask
          </button>
        </div>

        {registrationMethod === "traditional" ? (
          // Traditional form
          <div className="flex flex-col place-items-center">
            <input
              className="w-80 h-14 rounded-full text-center border border-gray-300 mb-3"
              type="text"
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={handleKeyPress}
              value={username}
              placeholder="enter username"
              disabled={isLoading}
            />
            <input
              className="w-80 h-14 rounded-full text-center border border-gray-300 mb-3"
              type="password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              value={password}
              placeholder="enter password"
              disabled={isLoading}
            />
            <button
              onClick={handleRegister}
              disabled={isLoading}
              className="w-80 h-14 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded-full mb-3"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Registrazione in corso...
                </div>
              ) : (
                "Registrati"
              )}
            </button>
          </div>
        ) : (
          // MetaMask section
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
                              onClick={handleMetaMaskRegister}
                              type="button"
                              className="w-full h-14 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded-full"
                            >
                              Registrati con {account.displayName}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  );
                }}
              </ConnectButton.Custom>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 mt-6">
          <Link to="/signin">
            <button className="w-80 h-14 bg-white hover:bg-gray-100 text-blue-500 font-bold rounded-full border-2 border-blue-500">
              Hai già un account? Accedi
            </button>
          </Link>

          <Link to="/landing">
            <button className="w-80 h-14 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded-full">
              Torna indietro
            </button>
          </Link>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
