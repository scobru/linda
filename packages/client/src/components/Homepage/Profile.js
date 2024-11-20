import React from "react";
import { user } from "../../protocol";
import { useNavigate } from "react-router-dom";
import { authentication } from "../../protocol";
import { toast } from "react-hot-toast";
import { gun, DAPP_NAME } from "../../protocol";
import { userUtils } from "../../protocol/src/utils/userUtils";
import { ConnectButton } from "@rainbow-me/rainbowkit";

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
  const [username, setUsername] = React.useState("");
  const [publicKey, setPublicKey] = React.useState("");
  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [nickname, setNickname] = React.useState("");
  const [avatarSeed, setAvatarSeed] = React.useState("");

  React.useEffect(() => {
    const loadUserData = async () => {
      const userProfile = await gun.user().get(DAPP_NAME).get("profile").once();
      console.log(userProfile);
      if (userProfile && userProfile.nickname) {
        setUsername(userProfile.nickname);
      }
      const currentPub = user.is?.pub;
      if (currentPub) {
        setPublicKey(currentPub);
      }
    };

    loadUserData();
  }, []);

  const handleSaveProfile = async () => {
    try {
      await gun
        .get(DAPP_NAME)
        .get("userList")
        .get("nicknames")
        .get(user.is.pub)
        .put(nickname.trim());

      setUsername(nickname.trim());
      setIsEditingProfile(false);
      toast.success("Profilo aggiornato con successo!");
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

  return (
    <>
      <Header />
      <div className="flex items-center space-x-4 mt-2">
        {isEditingProfile ? (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96">
              <h3 className="text-lg font-medium mb-4">Modifica Profilo</h3>

              <div className="space-y-4">
                <div className="flex items-center justify-center space-x-2">
                  <img
                    className="w-16 h-16 rounded-full"
                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${avatarSeed || nickname}&backgroundColor=b6e3f4`}
                    alt="Avatar"
                  />
                  <button
                    onClick={generateNewAvatar}
                    className="p-2 hover:bg-gray-100 rounded-full"
                    title="Genera nuovo avatar"
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
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="Inserisci un nickname"
                  />
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
                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${avatarSeed || username}&backgroundColor=b6e3f4`}
                alt=""
              />
            </button>

            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-700">
                {username || "Utente"}
              </span>
              <span className="text-xs text-gray-500">
                {truncatePubKey(publicKey)}
              </span>
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
    </>
  );
}
