import React, { useEffect } from "react";
import { authentication } from "linda-protocol";
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

  const handleMetaMaskLogin = async () => {
    if (!address) {
      toast.error("Connect your MetaMask wallet first");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Signing in with MetaMask...");

    try {
      const result = await authentication.loginWithMetaMask(address);

      if (result.success) {
        toast.success("Successfully signed in with MetaMask", { id: toastId });

        // Modifica qui: usa un formato più user-friendly per gli utenti MetaMask
        const displayName = `${address.slice(0, 6)}...${address.slice(-4)}`;

        localStorage.setItem("userPub", result.pub);
        localStorage.setItem("username", displayName);
        localStorage.setItem("userAlias", displayName);
        localStorage.setItem("walletAddress", address);

        // Salva nel nodo Gun
        gun.get(DAPP_NAME).get("userList").get("users").set({
          pub: result.pub,
          username: displayName,
          nickname: displayName,
          address: address,
          timestamp: Date.now(),
          lastSeen: Date.now(),
          authType: "wallet",
        });

        setIsRedirecting(true);
        navigate("/homepage", { replace: true });
      }
    } catch (error) {
      console.error("Errore login MetaMask:", error);
      if (error.message.includes("non registrato")) {
        navigate("/register", {
          state: { isMetaMask: true, address },
        });
      } else {
        toast.error(error.message || "Errore durante l'accesso con MetaMask", {
          id: toastId,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Se stiamo già reindirizzando, mostra un loader
  if (isRedirecting) {
    return (
      <div className="w-screen h-screen flex flex-col justify-center items-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <p className="mt-4 text-gray-600">Redirecting...</p>
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
