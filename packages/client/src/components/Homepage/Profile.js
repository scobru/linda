import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { gun, DAPP_NAME } from "linda-protocol";
import { useAppState } from "../../context/AppContext";

const Profile = ({ isOpen, onClose }) => {
  const { appState, updateAppState } = useAppState();
  const [nickname, setNickname] = useState(appState.username || "");
  const [isEditing, setIsEditing] = useState(false);
  const [profileInfo, setProfileInfo] = useState({
    localStorage: null,
    gunData: null,
  });
  const [walletAddress, setWalletAddress] = useState("");

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      loadProfileInfo();
      loadWalletInfo();
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const loadWalletInfo = async () => {
    try {
      // Carica l'indirizzo MetaMask se presente
      const walletAuth = localStorage.getItem("walletAuth");
      if (walletAuth) {
        try {
          const { address } = JSON.parse(walletAuth);
          setWalletAddress(address);
        } catch (error) {
          console.error("Errore parsing walletAuth:", error);
        }
      }
    } catch (error) {
      console.error("Error loading wallet info:", error);
      toast.error("Errore nel caricamento delle informazioni del wallet");
    }
  };

  const loadProfileInfo = async () => {
    try {
      const currentPub = appState.user?.is?.pub;
      if (!currentPub) return;

      // Carica dati dal localStorage
      const walletKey = `gunWallet_${currentPub}`;
      const localStorageData = localStorage.getItem(walletKey);
      const parsedLocalData = localStorageData
        ? JSON.parse(localStorageData)
        : null;

      // Carica dati pubblici da Gun
      const gunData = await Promise.all([
        // Dati dal nodo users
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("userList")
            .get("users")
            .map()
            .once((userData) => {
              if (userData && userData.pub === currentPub) {
                resolve(userData);
              }
            });
          setTimeout(() => resolve(null), 1000);
        }),
        // Dati dall'indirizzo
        new Promise((resolve) => {
          if (!parsedLocalData?.internalWalletAddress) {
            resolve(null);
            return;
          }
          gun
            .get(DAPP_NAME)
            .get("addresses")
            .get(parsedLocalData.internalWalletAddress.toLowerCase())
            .once((data) => resolve(data));
          setTimeout(() => resolve(null), 1000);
        }),
      ]);

      setProfileInfo({
        localStorage: {
          ...parsedLocalData,
          // Nascondi informazioni sensibili
          internalWalletPk: parsedLocalData?.internalWalletPk ? "***" : null,
          credentials: parsedLocalData?.credentials
            ? {
                username: parsedLocalData.credentials.username,
                password: "***",
              }
            : null,
        },
        gunData: {
          users: gunData[0],
          addresses: gunData[1],
        },
      });
    } catch (error) {
      console.error(
        "Errore nel caricamento delle informazioni del profilo:",
        error
      );
      toast.error("Errore nel caricamento delle informazioni del profilo");
    }
  };

  const handleSave = async () => {
    try {
      if (!nickname.trim()) {
        toast.error("Il nickname non può essere vuoto");
        return;
      }

      // Aggiorna il nickname nel database
      await new Promise((resolve, reject) => {
        gun
          .get(DAPP_NAME)
          .get("userList")
          .get("users")
          .map()
          .once((userData) => {
            if (userData && userData.pub === appState.user.is.pub) {
              gun
                .get(DAPP_NAME)
                .get("userList")
                .get("users")
                .get(userData.alias)
                .put(
                  {
                    ...userData,
                    nickname: nickname.trim(),
                  },
                  (ack) => {
                    if (ack.err) reject(new Error(ack.err));
                    else resolve();
                  }
                );
            }
          });
        setTimeout(resolve, 1000);
      });

      // Aggiorna lo stato locale
      updateAppState({
        ...appState,
        username: nickname.trim(),
      });

      // Salva nel localStorage
      localStorage.setItem("username", nickname.trim());

      toast.success("Profilo aggiornato con successo");
      setIsEditing(false);
    } catch (error) {
      console.error("Errore durante l'aggiornamento del profilo:", error);
      toast.error("Errore durante l'aggiornamento del profilo");
    }
  };

  const copyPublicKey = () => {
    const currentPub = appState.user?.is?.pub;
    if (currentPub) {
      navigator.clipboard
        .writeText(currentPub)
        .then(() => toast.success("Chiave pubblica copiata negli appunti!"))
        .catch((err) => {
          console.error("Errore durante la copia:", err);
          toast.error("Errore durante la copia della chiave pubblica");
        });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black bg-opacity-30" onClick={onClose} />

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-[#2D325A] rounded-lg shadow-xl w-full max-w-md p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Profilo</h2>

          <div className="space-y-4">
            {/* Avatar */}
            <div className="flex justify-center">
              <img
                className="h-24 w-24 rounded-full"
                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${
                  appState.username || appState.user?.is?.pub
                }&backgroundColor=b6e3f4`}
                alt="Avatar"
              />
            </div>

            {/* Informazioni utente */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Chiave pubblica
                </label>
                <div className="mt-1 flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={appState.user?.is?.pub || ""}
                    className="w-full px-3 py-2 bg-[#373B5C] border border-[#4A4F76] rounded-md text-gray-300 text-sm"
                  />
                  <button
                    onClick={copyPublicKey}
                    className="p-2 text-gray-300 hover:text-white hover:bg-[#4A4F76] rounded-full transition-colors"
                    title="Copia chiave pubblica"
                  >
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
                        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Nickname
                </label>
                <div className="mt-1 flex items-center space-x-2">
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    disabled={!isEditing}
                    className="w-full px-3 py-2 bg-[#373B5C] border border-[#4A4F76] rounded-md text-gray-300 text-sm disabled:opacity-50"
                    placeholder="Inserisci un nickname"
                  />
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                    >
                      Modifica
                    </button>
                  ) : (
                    <button
                      onClick={handleSave}
                      className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
                    >
                      Salva
                    </button>
                  )}
                </div>
              </div>

              {/* Informazioni Wallet */}
              {walletAddress && (
                <div>
                  <label className="block text-sm font-medium text-gray-300">
                    Indirizzo Wallet
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      readOnly
                      value={walletAddress}
                      className="w-full px-3 py-2 bg-[#373B5C] border border-[#4A4F76] rounded-md text-gray-300 text-sm"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    (Utilizzato per autenticazione)
                  </p>
                </div>
              )}

              {/* Dati Gun */}
              {profileInfo.gunData?.users && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Dati Pubblici (Gun)
                  </label>
                  <div className="bg-[#373B5C] rounded-md p-3 border border-[#4A4F76]">
                    <pre className="text-xs text-gray-300 overflow-x-auto">
                      {JSON.stringify(profileInfo.gunData.users, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Dati Privati */}
              {profileInfo.localStorage && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Dati Privati (localStorage)
                  </label>
                  <div className="bg-[#373B5C] rounded-md p-3 border border-[#4A4F76]">
                    <pre className="text-xs text-gray-300 overflow-x-auto">
                      {JSON.stringify(profileInfo.localStorage, null, 2)}
                    </pre>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    (Le informazioni sensibili sono nascoste per sicurezza)
                  </p>
                </div>
              )}

              {/* Dati Indirizzi */}
              {profileInfo.gunData?.addresses && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Dati Indirizzi (Gun)
                  </label>
                  <div className="bg-[#373B5C] rounded-md p-3 border border-[#4A4F76]">
                    <pre className="text-xs text-gray-300 overflow-x-auto">
                      {JSON.stringify(profileInfo.gunData.addresses, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Pulsante chiudi */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[#4A4F76] text-white rounded-md hover:bg-[#5A5F86] transition-colors text-sm"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
