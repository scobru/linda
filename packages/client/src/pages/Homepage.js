import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useContext,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { gun, DAPP_NAME } from "linda-protocol";
import { useAppState } from "../context/AppContext";
import Context from "../contexts/context";
import { useChat } from "../hooks/useChat";

// Components
import Friends from "../components/Homepage/Friends";
import Profile from "../components/Homepage/Profile";
import AddFriend from "../components/Homepage/AddFriend";
import Messages from "../components/Homepage/Messages";
import AppStatus from "../components/AppStatus";
import Channels from "../components/Homepage/Channels";
import TransactionHistory from "../components/Homepage/TransactionHistory";
import GlobalWalletModal from "../components/Homepage/GlobalWalletModal";
import TransactionModal from "../components/Homepage/TransactionModal";
import Header from "../components/Header";

export default function Homepage() {
  const navigate = useNavigate();
  const { appState } = useAppState();
  const {
    setFriends: setOldFriends,
    setSelected: setOldSelected,
    selected: oldSelected,
    friends: oldFriends,
    setConnectionState,
    currentView,
    setCurrentView,
  } = useContext(Context);

  // Stati locali
  const [loading, setLoading] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [isMobileView, setIsMobileView] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [activeView, setActiveView] = useState("chats");
  const [chatRoomId, setChatRoomId] = useState(null);

  // Integrazione useChat
  const { messages, loading: chatLoading, sendMessage } = useChat(chatRoomId);

  // Refs
  const friendsRef = useRef(new Set());
  const processedRequestsRef = useRef(new Set());
  const initializationRef = useRef(false);

  // Verifica autenticazione e inizializzazione
  useEffect(() => {
    const initializeHomepage = async () => {
      // Evita inizializzazioni multiple
      if (initializationRef.current) return;
      if (!appState.isAuthenticated || !appState.user?.is) {
        console.log("Homepage - Utente non autenticato");
        return;
      }

      try {
        setLoading(true);
        initializationRef.current = true;
        console.log("Homepage - Inizializzazione...");

        // Carica i dati iniziali
        await loadInitialData();
        setConnectionState("online");
      } catch (error) {
        console.error("Homepage - Errore inizializzazione:", error);
        toast.error("Errore durante il caricamento dei dati");
      } finally {
        setLoading(false);
      }
    };

    initializeHomepage();

    return () => {
      initializationRef.current = false;
    };
  }, [appState.isAuthenticated, appState.user]);

  // Caricamento dati iniziali
  const loadInitialData = async () => {
    try {
      console.log("Caricamento dati iniziali...");

      // Carica lista amici
      const friendsList = await loadFriends();
      if (friendsList.length > 0) {
        console.log("Amici caricati:", friendsList);
        setOldFriends(friendsList);
        friendsRef.current = new Set(friendsList.map((f) => f.pub));
      }

      // Carica richieste di amicizia pendenti
      await loadPendingRequests();
    } catch (error) {
      console.error("Errore nel caricamento dati:", error);
      throw error;
    }
  };

  // Caricamento amici
  const loadFriends = async () => {
    try {
      const friendsList = [];
      const friendshipsPromise = new Promise((resolve) => {
        const processedFriendships = new Set();

        gun
          .get(DAPP_NAME)
          .get("friendships")
          .map()
          .once(async (friendship, id) => {
            if (!friendship || processedFriendships.has(id)) return;
            processedFriendships.add(id);

            if (
              friendship.user1 === appState.user.is.pub ||
              friendship.user2 === appState.user.is.pub
            ) {
              const friendPub =
                friendship.user1 === appState.user.is.pub
                  ? friendship.user2
                  : friendship.user1;

              gun
                .get(DAPP_NAME)
                .get("userList")
                .get("users")
                .map()
                .once((userData) => {
                  if (userData && userData.pub === friendPub) {
                    friendsList.push({
                      pub: friendPub,
                      alias:
                        userData.nickname ||
                        userData.username ||
                        `${friendPub.slice(0, 6)}...${friendPub.slice(-4)}`,
                      displayName: userData.nickname,
                      username: userData.username,
                      avatarSeed: userData.avatarSeed,
                      friendshipId: id,
                      added: friendship.created,
                      type: "friend",
                    });
                  }
                });
            }
          });

        // Risolvi dopo un breve delay per assicurarsi che tutte le callback siano completate
        setTimeout(resolve, 1000);
      });

      await friendshipsPromise;
      return friendsList;
    } catch (error) {
      console.error("Errore caricamento amici:", error);
      return [];
    }
  };

  // Caricamento richieste pendenti
  const loadPendingRequests = async () => {
    try {
      const requests = [];
      const requestsPromise = new Promise((resolve) => {
        const processedRequests = new Set();

        gun
          .get(DAPP_NAME)
          .get("friendRequests")
          .map()
          .once((request) => {
            if (
              request &&
              request.to === appState.user.is.pub &&
              !processedRequestsRef.current.has(request.from) &&
              !processedRequests.has(request.from)
            ) {
              processedRequests.add(request.from);
              requests.push(request);
            }
          });

        // Risolvi dopo un breve delay per assicurarsi che tutte le callback siano completate
        setTimeout(resolve, 500);
      });

      await requestsPromise;
      if (requests.length > 0) {
        setPendingRequests(requests);
      }
    } catch (error) {
      console.error("Errore caricamento richieste:", error);
    }
  };

  // Gestione cambio vista
  const handleViewChange = (view) => {
    setActiveView(view);
    setCurrentView(view);
  };

  // Effetto per gestire il cambio di chat selezionata
  useEffect(() => {
    if (oldSelected && oldSelected.pub) {
      const roomId = [appState.user.is.pub, oldSelected.pub].sort().join("_");
      setChatRoomId(roomId);
    } else if (oldSelected && oldSelected.roomId) {
      setChatRoomId(oldSelected.roomId);
    } else {
      setChatRoomId(null);
    }
  }, [oldSelected, appState.user.is.pub]);

  return (
    <div className="flex flex-col h-screen max-h-screen">
      <Header />

      {/* Container principale */}
      <div className="flex flex-1 min-h-0 bg-[#373B5C]">
        {/* Sidebar */}
        <div
          className={`${
            isMobileView && showMobileChat ? "hidden" : "w-full"
          } md:w-[320px] lg:w-[380px] md:flex flex-col min-h-0 bg-[#373B5C] border-r border-[#4A4F76]`}
        >
          {/* Tab di navigazione */}
          <div className="flex flex-shrink-0 border-b border-[#4A4F76] bg-[#373B5C]">
            <button
              onClick={() => handleViewChange("chats")}
              className={`flex-1 py-3 text-sm font-medium ${
                activeView === "chats"
                  ? "text-white border-b-2 border-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => handleViewChange("channels")}
              className={`flex-1 py-3 text-sm font-medium ${
                activeView === "channels"
                  ? "text-white border-b-2 border-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              Boards and Channels
            </button>
          </div>

          {/* Lista chat/canali */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeView === "chats" && (
              <Friends
                onSelect={(friend) => {
                  setOldSelected(friend);
                  if (isMobileView) {
                    setShowMobileChat(true);
                  }
                }}
                pendingRequests={pendingRequests}
                loading={loading}
                selectedUser={oldSelected}
                friends={oldFriends}
              />
            )}
            {activeView === "channels" && (
              <Channels onSelect={setOldSelected} />
            )}
          </div>
        </div>

        {/* Area chat */}
        <div
          className={`${
            isMobileView && !showMobileChat ? "hidden" : "w-full"
          } md:flex flex-1 flex-col min-h-0 bg-[#424874]`}
        >
          {oldSelected ? (
            <Messages
              key={oldSelected.pub || oldSelected.roomId || oldSelected.id}
              chatData={oldSelected}
              messages={messages}
              loading={chatLoading}
              onSendMessage={sendMessage}
              isMobileView={isMobileView}
              onBack={() => setShowMobileChat(false)}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-300">
                {activeView === "chats"
                  ? "Seleziona un amico per chattare"
                  : "Seleziona una bacheca o un canale"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
