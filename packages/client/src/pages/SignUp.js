import React from "react";
import { authentication, DAPP_NAME, gun } from "linda-protocol";
import toast, { Toaster } from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "../config/wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// Funzione per verificare la connessione Gun con retry
const checkGunConnectionWithRetry = async (maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const isConnected = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => resolve(false), 10000);

        gun.get("healthcheck").once((data) => {
          clearTimeout(timeout);
          resolve(true);
        });
      });

      if (isConnected) return true;

      // Se non è connesso ma non è l'ultimo tentativo
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

  // Verifica connessione Gun
  React.useEffect(() => {
    const checkConnection = async () => {
      const isConnected = await checkGunConnectionWithRetry();
      setIsGunConnected(isConnected);
      if (!isConnected) {
        toast.error("Unable to connect to Gun node. Please try again later.");
      }
    };

    checkConnection();
  }, []);

  /* React.useEffect(() => {
    const checkAuth = async () => {
      const isAuth = await authentication.sessionManager.validateSession();
      if (isAuth) {
        navigate("/", { replace: true });
      }
    };
    checkAuth();
  }, [navigate]); */

  const handleRegister = async () => {
    if (isLoading) return;
    if (!username.trim() || !password.trim()) {
      toast.error("Please enter username and password");
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Registration in progress...");

    try {
      const result = await new Promise((resolve, reject) => {
        authentication.registerUser({ username, password }, (response) => {
          if (response.success) {
            resolve(response);
          } else {
            reject(
              new Error(response.errMessage || "Error during registration")
            );
          }
        });
      });

      toast.success("Registration completed", { id: toastId });
      setTimeout(() => {
        navigate("/signin", { replace: true });
      }, 1500);
    } catch (error) {
      console.error("Registration error:", error);
      toast.error(error.message || "Error during registration", {
        id: toastId,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMetaMaskRegister = async () => {
    if (!address) {
      toast.error("Please connect your MetaMask wallet first");
      return;
    }

    // Ask for confirmation before proceeding
    const wantsToSign = window.confirm(
      "To complete the registration, you need to sign a message with MetaMask. Do you want to proceed?"
    );

    if (!wantsToSign) {
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading("Registering with MetaMask...");

    try {
      console.log("Starting registration with address:", address);

      // Check if address is already registered
      const existingUser = await gun
        .get(`${DAPP_NAME}/users`)
        .get(address)
        .once();
      if (existingUser) {
        throw new Error("This address is already registered");
      }

      const result = await authentication.registerWithMetaMask(address);

      if (result.success) {
        toast.success("Registration completed successfully", { id: toastId });
        setTimeout(() => {
          navigate("/signin", { replace: true });
        }, 5000);
      } else {
        throw new Error(result.error || "Unknown error during registration");
      }
    } catch (error) {
      console.error("Detailed MetaMask registration error:", {
        message: error.message,
        stack: error.stack,
        error,
      });

      let errorMessage = "Error during registration";

      if (error.message.includes("Timeout")) {
        errorMessage =
          "Registration timeout. The server might be overloaded, please try again in a few minutes.";
      } else if (error.message.includes("Malformed UTF-8")) {
        errorMessage =
          "Data encoding error. Try disconnecting and reconnecting MetaMask.";
      } else if (error.message.includes("already registered")) {
        errorMessage =
          "This address is already registered. Try signing in instead.";
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
                  Registration in progress...
                </div>
              ) : (
                "Sign me up!"
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
                              Connect Wallet
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
                              Register with {account.displayName}
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
              Already have an account? Sign In
            </button>
          </Link>

          <Link to="/landing">
            <button className="w-80 h-14 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded-full">
              Go Back
            </button>
          </Link>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
