import React, { useState, useEffect } from "react";
import { user } from "../../protocol";
import { useNavigate } from "react-router-dom";
import { authentication } from "../../protocol";
import { toast } from "react-hot-toast";
import { gun, DAPP_NAME } from "../../protocol";
import { userUtils } from "../../protocol/src/utils/userUtils";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { walletService } from '../../protocol/src/wallet.js';

export function Header() {
  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "60px",
        backgroundColor: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        zIndex: 1000,
      }}
    >
     
       
        <h1 className="text-xl font-bold text-black">linda</h1>
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
    authType: ""
  });
  const [address, setAddress] = React.useState("");
  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [newNickname, setNewNickname] = React.useState("");
  const [avatarSeed, setAvatarSeed] = React.useState("");
  const [walletAddress, setWalletAddress] = useState('');
  const [internalAddress, setInternalAddress] = useState('');

  React.useEffect(() => {
    const loadUserData = async () => {
      try {
        const currentPub = user.is?.pub;
        if (!currentPub) return;

        // Prima ottieni l'alias originale dall'utente Gun
        const originalUsername = user.is.alias?.split('.')[0] || '';

        // Poi carica le informazioni complete dell'utente
        const info = await userUtils.getUserInfo(currentPub);
        
        // Combina le informazioni dando priorità allo username originale
        setUserInfo({
          ...info,
          username: originalUsername || info.username, // Usa prima l'username originale
          pub: currentPub
        });
        setNewNickname(info.nickname || "");

        // Aggiorna anche il nodo Gun con lo username se non esiste
        if (!info.username && originalUsername) {
          gun.get(DAPP_NAME)
            .get('userList')
            .get('users')
            .get(currentPub)
            .get('username')
            .put(originalUsername);
        }

        // Sottoscrizione ai cambiamenti
        const unsub = userUtils.subscribeToUserUpdates(currentPub, (updatedInfo) => {
          setUserInfo(prev => ({
            ...prev,
            ...updatedInfo
          }));
        });

        // Carica l'indirizzo wallet se presente
        const walletAuth = localStorage.getItem('walletAuth');
        if (walletAuth) {
          const { address } = JSON.parse(walletAuth);
          setAddress(address);
        }

        return () => {
          if (typeof unsub === 'function') unsub();
        };
      } catch (error) {
        console.error("Errore nel caricamento dei dati utente:", error);
      }
    };

    loadUserData();
  }, []);

  useEffect(() => {
    const loadWalletInfo = async () => {
      try {
        // Carica il wallet interno (quello usato per i tip)
        const internalWallet = await walletService.getCurrentWallet();
        setInternalAddress(internalWallet.address);

        // Carica l'indirizzo MetaMask se presente
        const walletAuth = localStorage.getItem('walletAuth');
        if (walletAuth) {
          const { address } = JSON.parse(walletAuth);
          // Usa l'indirizzo MetaMask originale
          setWalletAddress(address);
        }
      } catch (error) {
        console.error('Error loading wallet info:', error);
      }
    };

    loadWalletInfo();
  }, []);

  const handleSaveProfile = async () => {
    try {
      if (!newNickname.trim()) {
        toast.error("Il nickname non può essere vuoto");
        return;
      }

      const success = await userUtils.updateUserProfile(user.is.pub, {
        nickname: newNickname.trim()
      });

      if (success) {
        // Aggiorna lo stato locale
        setUserInfo(prev => ({
          ...prev,
          nickname: newNickname.trim(),
          displayName: newNickname.trim()
        }));

        // Forza l'aggiornamento del nodo Gun
        gun.get(DAPP_NAME)
          .get('userList')
          .get('users')
          .get(user.is.pub)
          .get('nickname')
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
      window.dispatchEvent(new Event("pre-logout"));
      await authentication.logout();

      localStorage.removeItem("user");
      localStorage.removeItem("selectedUser");
      localStorage.removeItem("walletAuth");

      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Errore durante il logout:", error);
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
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <>
      <Header />
      <div className="flex items-center space-x-4 mt-2">
        {isEditingProfile ? (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96">
              <h3 className="text-lg font-medium mb-4">Modifica Profilo</h3>

              <div className="space-y-4">
                {/* Username non modificabile ma visibile */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Username
                  </label>
                  <input
                    type="text"
                    value={userInfo.username || ''}
                    disabled
                    className="mt-1 block w-full px-3 py-2 rounded-md border border-gray-300 bg-gray-100 text-gray-700"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Lo username non può essere modificato
                  </p>
                </div>

                {/* Nickname modificabile */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 rounded-md border border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Inserisci un nickname"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Il nickname può essere modificato in qualsiasi momento
                  </p>
                </div>

                <div className="flex justify-end space-x-2 mt-4">
                  <button
                    onClick={() => setIsEditingProfile(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
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
              className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center hover:bg-blue-600 transition-colors"
              title="Modifica profilo"
            >
              <img
                className="w-full h-full rounded-full"
                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${userInfo.displayName}&backgroundColor=b6e3f4`}
                alt=""
              />
            </button>

            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-700">
                {userInfo.displayName}
              </span>
              {userInfo.username && (
                <span className="text-xs text-gray-500">
                  @{userInfo.username}
                </span>
              )}
              <span className="text-xs text-gray-500">
                {truncatePubKey(userInfo.pub)}
              </span>
              {address && (
                <span className="text-xs text-gray-500">
                  {truncateAddress(address)}
                </span>
              )}
            </div>

            <button
              onClick={copyPublicKey}
              className="ml-2 p-1.5 hover:bg-gray-100 rounded-full transition-colors"
              title="Copia chiave pubblica"
            >
              <svg
                className="w-4 h-4 text-gray-500"
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
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          title="Logout"
        >
          <svg
            className="w-5 h-5 text-gray-500"
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
        <div className="mt-4">
          <p className="text-sm text-gray-600">Indirizzo MetaMask:</p>
          <p className="text-sm font-mono">{walletAddress}</p>
          <p className="text-xs text-gray-500 mt-1">
            (Utilizzato solo per autenticazione)
          </p>
        </div>
      )}
      
      <div className="mt-4">
        <p className="text-sm text-gray-600">Indirizzo Wallet Interno:</p>
        <p className="text-sm font-mono">{internalAddress}</p>
        <p className="text-xs text-gray-500 mt-1">
          (Utilizzato per i tip e i pagamenti stealth)
        </p>
      </div>
    </>
  );
}
