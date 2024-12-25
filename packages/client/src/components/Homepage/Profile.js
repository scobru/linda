import React, { useState, useEffect } from "react";
import { user } from "linda-protocol";
import { useNavigate } from "react-router-dom";
import { authentication, sessionManager } from "linda-protocol";
import { toast } from "react-hot-toast";
import { gun, DAPP_NAME } from "linda-protocol";
import {
  subscribeToUserUpdates,
  updateUserProfile,
  getUserInfo,
  updateUserAvatar,
} from "linda-protocol";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { walletService } from "linda-protocol";

export function Header() {
  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "60px",
        backgroundColor: "#373B5C",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        zIndex: 1000,
        borderBottom: "1px solid #4A4F76",
      }}
    >
      <h1 className="text-xl font-bold text-white">linda</h1>
      <ConnectButton />
    </header>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = React.useState({
    displayName: "Caricamento...",
    username: "",
    nickname: "",
    pub: "",
    authType: "",
    avatar: "",
  });
  const [address, setAddress] = React.useState("");
  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [newNickname, setNewNickname] = React.useState("");
  const [avatarSeed, setAvatarSeed] = React.useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [profileInfo, setProfileInfo] = useState({
    localStorage: null,
    gunData: null,
  });

  React.useEffect(() => {
    const loadUserData = async () => {
      try {
        const currentPub = user.is?.pub;
        if (!currentPub) return;

        // Log per debug
        console.log("Current user pub:", currentPub);

        // Carica l'avatar dell'utente
        const avatarData = await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("users")
            .get(currentPub)
            .get("avatar")
            .once((data) => {
              console.log("Avatar caricato:", data); // Log per debug
              resolve(data);
            });
        });

        // Log dei dati dalla userList
        await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("users")
            .get(currentPub)
            .once((data) => {
              console.log("UserList data:", {
                raw: data,
                hasViewingKey: !!data?.viewingPublicKey,
                hasSpendingKey: !!data?.spendingPublicKey,
                hasEncryptedPairs: !!(
                  data?.viewingKeyPair && data?.spendingKeyPair
                ),
                avatar: data?.avatar, // Log per debug
              });
              resolve();
            });
        });

        // Prima ottieni l'alias originale dall'utente Gun
        const originalUsername = user.is.alias?.split(".")[0] || "";

        // Poi carica le informazioni complete dell'utente
        const info = await getUserInfo(currentPub);

        // Combina le informazioni dando priorità allo username originale
        setUserInfo({
          ...info,
          username: originalUsername || info.username,
          pub: currentPub,
          avatar: avatarData || "", // Imposta l'avatar dai dati caricati
        });

        console.log("Stato userInfo aggiornato:", {
          username: originalUsername || info.username,
          pub: currentPub,
          avatar: avatarData || "",
        }); // Log per debug

        setNewNickname(info.nickname || "");

        // Aggiorna anche il nodo Gun con lo username se non esiste
        if (!info.username && originalUsername) {
          gun
            .get(DAPP_NAME)
            .get("users")
            .get(currentPub)
            .get("username")
            .put(originalUsername);
        }

        // Sottoscrizione ai cambiamenti
        const unsub = subscribeToUserUpdates(currentPub, (updatedInfo) => {
          setUserInfo((prev) => ({
            ...prev,
            ...updatedInfo,
          }));
        });

        // Carica l'indirizzo wallet se presente
        const walletAuth = localStorage.getItem("walletAuth");
        if (walletAuth) {
          const { address } = JSON.parse(walletAuth);
          setAddress(address);
        }

        return () => {
          if (typeof unsub === "function") unsub();
        };
      } catch (error) {
        console.error("Errore nel caricamento dei dati utente:", error);
      }
    };

    loadUserData();
  }, []);

  useEffect(() => {
    console.log("loadWalletInfo");
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

    if (user.is?.pub) {
      loadWalletInfo();
    }
  }, [user.is?.pub]);

  const handleSaveProfile = async () => {
    try {
      if (!newNickname.trim()) {
        toast.error("Il nickname non può essere vuoto");
        return;
      }

      const success = await updateUserProfile(user.is.pub, {
        nickname: newNickname.trim(),
      });

      if (success) {
        // Aggiorna lo stato locale
        setUserInfo((prev) => ({
          ...prev,
          nickname: newNickname.trim(),
          displayName: newNickname.trim(),
        }));

        // Forza l'aggiornamento del nodo Gun
        gun
          .get(DAPP_NAME)
          .get("userList")
          .get("users")
          .get(user.is.pub)
          .get("nickname")
          .put(newNickname.trim());

        setIsEditingProfile(false);
        toast.success("Profilo aggiornato con successo!");
      } else {
        throw new Error("Errore durante l'aggiornamento");
      }
    } catch (error) {
      console.error("Errore aggiornamento profilo:", error);
      toast.error("Errore durante l'aggiornamento del profilo");
    }
  };

  const generateNewAvatar = () => {
    const newSeed = Math.random().toString(36).substring(7);
    setAvatarSeed(newSeed);
  };

  const handleLogout = async () => {
    try {
      // Emetti evento pre-logout per pulire le sottoscrizioni
      window.dispatchEvent(new Event("pre-logout"));

      // Pulisci il localStorage
      localStorage.removeItem("isAuthenticated");
      localStorage.removeItem("userPub");
      localStorage.removeItem("username");
      localStorage.removeItem("userAlias");
      localStorage.removeItem("userAddress");
      localStorage.removeItem("redirectAfterLogin");
      localStorage.removeItem("selectedUser");
      localStorage.removeItem("walletAuth");

      // Pulisci la sessione
      await sessionManager.clearSession();

      // Disconnetti l'utente da Gun
      if (user.is) {
        user.leave();
        await new Promise((resolve) => setTimeout(resolve, 500)); // Attendi che il logout sia completato
      }

      // Pulisci le sottoscrizioni Gun
      gun.off();

      // Mostra un messaggio di successo
      toast.success("Logout effettuato con successo");

      // Attendi un momento prima di reindirizzare
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Reindirizza alla pagina di login
      window.location.replace("/login");
    } catch (error) {
      console.error("Errore durante il logout:", error);
      toast.error("Errore durante il logout");

      // Tenta comunque di reindirizzare in caso di errore
      try {
        window.location.replace("/login");
      } catch (e) {
        console.error("Errore nel reindirizzamento:", e);
      }
    }
  };

  const copyPublicKey = () => {
    const currentPub = user.is?.pub;
    if (currentPub) {
      navigator.clipboard
        .writeText(currentPub)
        .then(() => toast.success("Chiave pubblica copiata negli appunti!"))
        .catch((err) => {
          console.error("Errore durante la copia:", err);
          toast.error("Errore durante la copia della chiave pubblica");
        });
    } else {
      toast.error("Chiave pubblica non disponibile");
    }
  };

  const truncatePubKey = (key) => {
    if (!key) return "";
    return `${key.slice(0, 6)}...${key.slice(-4)}`;
  };

  const truncateAddress = (addr) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const loadProfileInfo = async () => {
    try {
      const currentPub = user.is?.pub;
      if (!currentPub) return;

      // Carica dati dal localStorage
      const walletKey = `gunWallet_${currentPub}`;
      const localStorageData = localStorage.getItem(walletKey);
      const parsedLocalData = localStorageData
        ? JSON.parse(localStorageData)
        : null;

      // Carica dati pubblici da Gun (dai percorsi corretti come nel register.js)
      const gunData = await Promise.all([
        // Dati dal nodo users
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("users")
            .get(currentPub)
            .once((data) => resolve(data));
        }),
        // Dati dal profilo utente
        new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("users")
            .get(currentPub)
            .once((data) => resolve(data));
        }),
        // Dati dall'indirizzo
        new Promise((resolve) => {
          if (!parsedLocalData?.internalWalletAddress) {
            resolve(null);
            return;
          }
          // Prima prova con l'indirizzo interno
          gun
            .get(DAPP_NAME)
            .get("addresses")
            .get(parsedLocalData.internalWalletAddress.toLowerCase())
            .once((data) => {
              if (data) {
                resolve(data);
              } else {
                // Se non trova nulla, prova con l'indirizzo esterno
                gun
                  .get(DAPP_NAME)
                  .get("addresses")
                  .get(
                    parsedLocalData.externalWalletAddress?.toLowerCase() ||
                      parsedLocalData.internalWalletAddress.toLowerCase()
                  )
                  .once((addressData) => resolve(addressData));
              }
            });
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
          pair: parsedLocalData?.pair ? "***" : null,
          v_Pair: parsedLocalData?.v_Pair ? "***" : null,
          s_Pair: parsedLocalData?.s_Pair ? "***" : null,
        },
        gunData: {
          users: gunData[0],
          profiles: gunData[1], // Questo sarà lo stesso di users perché vengono salvati nello stesso posto
          addresses: gunData[2],
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

  useEffect(() => {
    if (user.is?.pub) {
      loadProfileInfo();
    }
  }, [user.is?.pub]);

  const handleAvatarUpload = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;

      console.log("File selezionato:", file); // Log per debug

      // Verifica dimensione massima (2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast.error("L'immagine non può superare i 2MB");
        return;
      }

      // Verifica tipo file
      if (!file.type.startsWith("image/")) {
        toast.error("Per favore seleziona un'immagine");
        return;
      }

      // Converte l'immagine in base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result;
        console.log("Immagine convertita in base64"); // Log per debug

        // Aggiorna l'avatar usando la funzione del protocollo
        const success = await updateUserAvatar(user.is.pub, base64Data);
        console.log("Risultato updateUserAvatar:", success); // Log per debug

        if (success) {
          // Verifica che l'avatar sia stato effettivamente salvato
          const savedAvatar = await new Promise((resolve) => {
            gun
              .get(DAPP_NAME)
              .get("users")
              .get(user.is.pub)
              .get("avatar")
              .once((data) => {
                console.log("Avatar salvato:", data); // Log per debug
                resolve(data);
              });
          });

          if (savedAvatar) {
            setUserInfo((prev) => {
              const newState = {
                ...prev,
                avatar: base64Data,
              };
              console.log("Nuovo stato userInfo:", newState); // Log per debug
              return newState;
            });
            toast.success("Avatar aggiornato con successo!");
          } else {
            toast.error("Errore nella verifica del salvataggio dell'avatar");
          }
        } else {
          toast.error("Errore nell'aggiornamento dell'avatar");
        }
      };

      reader.onerror = () => {
        console.error("Errore nella lettura del file"); // Log per debug
        toast.error("Errore nella lettura del file");
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Errore nel caricamento dell'avatar:", error);
      toast.error("Errore nel caricamento dell'avatar");
    }
  };

  const styles = {
    profileInfoSection: {
      marginTop: "2rem",
      padding: "1rem",
      backgroundColor: "#f5f5f5",
      borderRadius: "8px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    },
    sectionTitle: {
      color: "#333",
      marginBottom: "1rem",
      fontSize: "1.5rem",
    },
    dataContainer: {
      marginBottom: "1.5rem",
      padding: "1rem",
      backgroundColor: "white",
      borderRadius: "6px",
      border: "1px solid #ddd",
    },
    dataTitle: {
      color: "#666",
      marginBottom: "0.5rem",
      fontSize: "1.2rem",
    },
    pre: {
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      backgroundColor: "#f8f9fa",
      padding: "1rem",
      borderRadius: "4px",
      fontSize: "0.9rem",
      maxHeight: "300px",
      overflowY: "auto",
    },
  };

  return (
    <>
      <Header />
      <div className="flex items-center space-x-4 mt-2">
        {isEditingProfile ? (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#373B5C] rounded-lg p-6 w-[800px] max-h-[90vh] overflow-y-auto border border-[#4A4F76]">
              <h3 className="text-lg font-medium mb-4 text-white">
                Modifica Profilo
              </h3>

              <div className="space-y-4">
                {/* Avatar upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-300">
                    Avatar
                  </label>
                  <div className="mt-2 flex items-center space-x-4">
                    {userInfo.avatar ? (
                      <img
                        src={userInfo.avatar}
                        alt="Avatar corrente"
                        className="w-16 h-16 rounded-full object-cover"
                      />
                    ) : (
                      <img
                        src={`https://api.dicebear.com/7.x/bottts/svg?seed=${userInfo.displayName}&backgroundColor=b6e3f4`}
                        alt="Avatar predefinito"
                        className="w-16 h-16 rounded-full"
                      />
                    )}
                    <label className="cursor-pointer bg-[#4A4F76] hover:bg-[#2D325A] text-white px-4 py-2 rounded-md transition-colors">
                      <span>Carica nuovo avatar</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                      />
                    </label>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    Immagine massimo 2MB. Formati supportati: JPG, PNG, GIF
                  </p>
                </div>

                {/* Username non modificabile ma visibile */}
                <div>
                  <label className="block text-sm font-medium text-gray-300">
                    Username
                  </label>
                  <input
                    type="text"
                    value={userInfo.username || ""}
                    disabled
                    className="mt-1 block w-full px-3 py-2 rounded-md border border-[#4A4F76] bg-[#2D325A] text-white"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Lo username non può essere modificato
                  </p>
                </div>

                {/* Nickname modificabile */}
                <div>
                  <label className="block text-sm font-medium text-gray-300">
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 rounded-md border border-[#4A4F76] bg-[#2D325A] text-white focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Inserisci un nickname"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Il nickname può essere modificato in qualsiasi momento
                  </p>
                </div>

                {/* Sezione Informazioni Profilo */}
                <div className="mt-6">
                  <h4 className="text-md font-medium text-white mb-4">
                    Informazioni Profilo
                  </h4>

                  {/* Dati dal localStorage */}
                  <div className="mb-4 p-4 bg-[#2D325A] rounded-lg border border-[#4A4F76]">
                    <h5 className="text-sm font-medium text-gray-300 mb-2">
                      Dati Locali (localStorage)
                    </h5>
                    {profileInfo.localStorage ? (
                      <pre className="text-xs bg-[#373B5C] p-3 rounded border border-[#4A4F76] text-white overflow-x-auto">
                        {JSON.stringify(profileInfo.localStorage, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-gray-400">
                        Nessun dato locale disponibile
                      </p>
                    )}
                  </div>

                  {/* Dati da Gun - Users */}
                  <div className="mb-4 p-4 bg-[#2D325A] rounded-lg border border-[#4A4F76]">
                    <h5 className="text-sm font-medium text-gray-300 mb-2">
                      Dati Pubblici (Gun - Users)
                    </h5>
                    {profileInfo.gunData?.users ? (
                      <pre className="text-xs bg-[#373B5C] p-3 rounded border border-[#4A4F76] text-white overflow-x-auto">
                        {JSON.stringify(profileInfo.gunData.users, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-gray-400">
                        Nessun dato utente disponibile
                      </p>
                    )}
                  </div>

                  {/* Dati da Gun - Profiles */}
                  <div className="mb-4 p-4 bg-[#2D325A] rounded-lg border border-[#4A4F76]">
                    <h5 className="text-sm font-medium text-gray-300 mb-2">
                      Dati Pubblici (Gun - Profiles)
                    </h5>
                    {profileInfo.gunData?.profiles ? (
                      <pre className="text-xs bg-[#373B5C] p-3 rounded border border-[#4A4F76] text-white overflow-x-auto">
                        {JSON.stringify(profileInfo.gunData.profiles, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-gray-400">
                        Nessun dato profilo disponibile
                      </p>
                    )}
                  </div>

                  {/* Dati da Gun - Addresses */}
                  <div className="mb-4 p-4 bg-[#2D325A] rounded-lg border border-[#4A4F76]">
                    <h5 className="text-sm font-medium text-gray-300 mb-2">
                      Dati Pubblici (Gun - Addresses)
                    </h5>
                    {profileInfo.gunData?.addresses ? (
                      <pre className="text-xs bg-[#373B5C] p-3 rounded border border-[#4A4F76] text-white overflow-x-auto">
                        {JSON.stringify(profileInfo.gunData.addresses, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-gray-400">
                        Nessun dato indirizzo disponibile
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end space-x-2 mt-4">
                  <button
                    onClick={() => setIsEditingProfile(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-[#4A4F76] rounded-md transition-colors"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md"
                  >
                    Salva
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsEditingProfile(true)}
              className="w-8 h-8 rounded-full bg-[#4A4F76] flex items-center justify-center hover:bg-[#2D325A] transition-colors relative group"
              title="Modifica profilo"
            >
              {userInfo.avatar ? (
                <img
                  className="w-full h-full rounded-full object-cover"
                  src={userInfo.avatar}
                  alt="Avatar"
                />
              ) : (
                <img
                  className="w-full h-full rounded-full"
                  src={`https://api.dicebear.com/7.x/bottts/svg?seed=${userInfo.displayName}&backgroundColor=b6e3f4`}
                  alt="Avatar predefinito"
                />
              )}
              <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </div>
            </button>

            <div className="flex flex-col">
              <span className="text-sm font-medium text-white">
                {userInfo.displayName}
              </span>
              {userInfo.username && (
                <span className="text-xs text-gray-300">
                  @{userInfo.username}
                </span>
              )}
              <span className="text-xs text-gray-300">
                {truncatePubKey(userInfo.pub)}
              </span>
              {address && (
                <span className="text-xs text-gray-300">
                  {truncateAddress(address)}
                </span>
              )}
            </div>

            <button
              onClick={copyPublicKey}
              className="ml-2 p-1.5 hover:bg-[#4A4F76] rounded-full transition-colors"
              title="Copia chiave pubblica"
            >
              <svg
                className="w-4 h-4 text-gray-300"
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
        )}

        <button
          onClick={handleLogout}
          className="p-2 hover:bg-[#4A4F76] rounded-full transition-colors"
          title="Logout"
        >
          <svg
            className="w-5 h-5 text-gray-300"
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
        </button>
      </div>
      {walletAddress && (
        <div className="mt-4 text-white">
          <p className="text-sm text-gray-300">Indirizzo MetaMask:</p>
          <p className="text-sm font-mono text-white">{walletAddress}</p>
          <p className="text-xs text-gray-400 mt-1">
            (Utilizzato solo per autenticazione)
          </p>
        </div>
      )}
    </>
  );
}
