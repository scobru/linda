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
import { friendsService } from "linda-protocol";
import { useAppState } from "../context/AppContext";
import Context from "../contexts/context";
import { useChat } from "../hooks/useChat";
import { useFriendRequestNotifications } from "../hooks/useFriendRequestNotifications";

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
  const { appState, updateAppState } = useAppState();
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
  const [isMobileView, setIsMobileView] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [activeView, setActiveView] = useState("chats");
  const [chatRoomId, setChatRoomId] = useState(null);

  // Integrazione useChat
  const { messages, loading: chatLoading, sendMessage } = useChat(chatRoomId);

  // Integrazione notifiche richieste di amicizia
  const {
    pendingRequests,
    loading: requestsLoading,
    markAsRead,
  } = useFriendRequestNotifications();

  // Refs
  const friendsRef = useRef(new Set());
  const initializationRef = useRef(false);

  // Verifica autenticazione e inizializzazione
  useEffect(() => {
    let mounted = true;

    const initializeHomepage = async () => {
      if (!mounted || initializationRef.current) return;
      if (!appState.isAuthenticated || !appState.user?.is) {
        console.log("Homepage - Utente non autenticato");
        return;
      }

      try {
        setLoading(true);
        initializationRef.current = true;
        console.log("Homepage - Inizializzazione...");

        // Carica i dati iniziali
        if (mounted) {
          await loadInitialData();
          setConnectionState("online");
        }
      } catch (error) {
        console.error("Homepage - Errore inizializzazione:", error);
        if (mounted) {
          toast.error("Errore durante il caricamento dei dati");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeHomepage();

    // Sottoscrizione ai cambiamenti delle amicizie
    const unsubFriendships = gun
      .get(DAPP_NAME)
      .get("friendships")
      .map()
      .on((friendship, id) => {
        if (!mounted || !friendship) return;

        // Verifica se l'amicizia coinvolge l'utente corrente
        if (
          friendship.user1 === appState.user?.is?.pub ||
          friendship.user2 === appState.user?.is?.pub
        ) {
          // Aggiorna la lista amici solo se necessario
          setOldFriends((prevFriends) => {
            const friendPub =
              friendship.user1 === appState.user?.is?.pub
                ? friendship.user2
                : friendship.user1;

            // Verifica se l'amico è già presente
            const existingFriend = prevFriends.find((f) => f.pub === friendPub);
            if (!existingFriend) {
              // Carica le informazioni dell'amico
              gun
                .get(DAPP_NAME)
                .get("userList")
                .get("users")
                .map()
                .once((userData) => {
                  if (userData && userData.pub === friendPub) {
                    const newFriend = {
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
                      chatId: [friendPub, appState.user.is.pub]
                        .sort()
                        .join("_"),
                    };
                    return [...prevFriends, newFriend];
                  }
                  return prevFriends;
                });
            }
            return prevFriends;
          });
        }
      });

    return () => {
      mounted = false;
      initializationRef.current = false;
      if (typeof unsubFriendships === "function") {
        unsubFriendships();
      }
    };
  }, [appState.isAuthenticated, appState.user]);

  // Caricamento dati iniziali
  const loadInitialData = async () => {
    try {
      console.log("Caricamento dati iniziali...");

      // Carica lista amici
      const friendsList = await loadFriends();
      if (friendsList && friendsList.length > 0) {
        console.log("Amici caricati:", friendsList);
        // Aggiungi chatId a ogni amico
        const friendsWithChatId = friendsList.map((friend) => ({
          ...friend,
          chatId: [friend.pub, appState.user.is.pub].sort().join("_"),
        }));
        setOldFriends(friendsWithChatId);
        friendsRef.current = new Set(friendsWithChatId.map((f) => f.pub));
      }
    } catch (error) {
      console.error("Errore nel caricamento dati:", error);
      throw error;
    }
  };

  // Caricamento amici
  const loadFriends = async () => {
    try {
      console.log("Caricamento amici tramite getFriendsList...");
      const friendsList = await friendsService.getFriendsList(
        appState.user.is.pub
      );
      console.log("Lista amici ricevuta:", friendsList);
      return friendsList;
    } catch (error) {
      console.error("Errore caricamento amici:", error);
      return [];
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

  // Gestione selezione canale/chat
  const handleSelect = useCallback(
    (selected) => {
      console.log("Selezione:", selected);

      // Aggiorna il vecchio contesto
      setOldSelected(selected.item);

      // Aggiorna il nuovo contesto
      updateAppState({
        selected: selected.item,
        currentChat: {
          ...selected.item,
          type: selected.type,
          isGroup: true,
        },
        activeChat: {
          id: selected.item.roomId || selected.item.pub,
          type: selected.type,
          name: selected.item.name,
          pub: selected.item.pub,
          isGroup: true,
          members: selected.item.members,
          creator: selected.item.creator,
          settings: selected.item.settings,
        },
      });

      // Gestione vista mobile
      if (isMobileView) {
        setShowMobileChat(true);
      }
    },
    [setOldSelected, updateAppState, isMobileView]
  );

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
                onSelect={(friend) =>
                  handleSelect({ item: friend, type: "chat" })
                }
                pendingRequests={pendingRequests}
                loading={loading}
                selectedUser={oldSelected}
                friends={oldFriends}
              />
            )}
            {activeView === "channels" && <Channels onSelect={handleSelect} />}
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
