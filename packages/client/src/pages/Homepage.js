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
import { Observable } from "rxjs";

// Components
import Friends from "../components/Homepage/Friends/Friends";
import Messages from "../components/Homepage/Messages/Messages";
import Channels from "../components/Homepage/Channels";
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
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [activeView, setActiveView] = useState("chats");
  const [chatRoomId, setChatRoomId] = useState(null);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);

  // Integrazione useChat e notifiche
  const { messages, loading: chatLoading, sendMessage } = useChat(chatRoomId);
  const {
    pendingRequests,
    loading: requestsLoading,
    markAsRead,
    removeRequest,
  } = useFriendRequestNotifications();

  // Refs
  const friendsRef = useRef(new Set());
  const initializationRef = useRef(false);
  const friendshipSubscriptionRef = useRef(null);
  const processedRequestsRef = useRef(new Set());

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

        if (mounted) {
          await loadInitialData();
          setConnectionState("online");
          subscribeFriendships();
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

    return () => {
      mounted = false;
      initializationRef.current = false;
      if (friendshipSubscriptionRef.current) {
        friendshipSubscriptionRef.current.unsubscribe();
      }
    };
  }, [appState.isAuthenticated, appState.user]);

  // Sottoscrizione alle amicizie usando Observable
  const subscribeFriendships = () => {
    const subscription = new Observable((subscriber) => {
      const handler = gun
        .get(DAPP_NAME)
        .get("friendships")
        .map()
        .on((friendship, id) => {
          if (!friendship) return;

          if (
            friendship.user1 === appState.user?.is?.pub ||
            friendship.user2 === appState.user?.is?.pub
          ) {
            subscriber.next({ friendship, id });
          }
        });

      return () => {
        if (typeof handler === "function") handler();
      };
    }).subscribe({
      next: async ({ friendship, id }) => {
        const friendPub =
          friendship.user1 === appState.user?.is?.pub
            ? friendship.user2
            : friendship.user1;

        // Verifica se l'amico è già presente
        const existingFriend = oldFriends.find((f) => f.pub === friendPub);
        if (existingFriend) return;

        try {
          // Carica le informazioni dell'amico in modo sincrono
          const userData = await new Promise((resolve) => {
            gun
              .get(DAPP_NAME)
              .get("userList")
              .get("users")
              .map()
              .once((data) => {
                if (data && data.pub === friendPub) {
                  resolve(data);
                }
              });
          });

          if (userData) {
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
              chatId: [friendPub, appState.user.is.pub].sort().join("_"),
            };

            setOldFriends((prev) => [...prev, newFriend]);
          }
        } catch (error) {
          console.error("Errore caricamento dati amico:", error);
        }
      },
      error: (error) => {
        console.error("Errore nella sottoscrizione amicizie:", error);
      },
    });

    friendshipSubscriptionRef.current = subscription;
  };

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

  // Effetto per gestire il resize della finestra
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobileView(mobile);
      if (!mobile) {
        setShowMobileChat(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  // Gestione ritorno alla lista in vista mobile
  const handleBackToList = useCallback(() => {
    setShowMobileChat(false);
  }, []);

  // Gestione richieste di amicizia processate
  const handleRequestProcessed = useCallback(
    async (requestId, action) => {
      // Se la richiesta è già stata processata, ignora
      if (processedRequestsRef.current.has(requestId)) {
        console.log(`Richiesta ${requestId} già processata, ignoro`);
        return;
      }

      console.log(
        `Homepage: Richiesta ${requestId} processata con azione ${action}`
      );

      // Marca la richiesta come processata
      processedRequestsRef.current.add(requestId);

      // Rimuovi immediatamente la richiesta dalla lista delle pendenti
      removeRequest(requestId);

      // Se la richiesta è stata accettata, aggiorna la lista amici
      if (action === "accept") {
        try {
          await loadInitialData();
          toast.success("Richiesta di amicizia accettata");
        } catch (error) {
          console.error("Errore nell'aggiornamento della lista amici:", error);
          toast.error("Errore nell'aggiornamento della lista amici");
        }
      } else {
        toast.success("Richiesta di amicizia rifiutata");
      }
    },
    [removeRequest, loadInitialData]
  );

  // Reset del ref quando cambia l'utente
  useEffect(() => {
    processedRequestsRef.current.clear();
  }, [appState.user?.is?.pub]);

  return (
    <div className="flex flex-col h-screen max-h-screen">
      <Header />

      {/* Container principale */}
      <div className="flex flex-1 min-h-0 bg-[#373B5C]">
        {/* Sidebar */}
        <div
          className={`${
            isMobileView && showMobileChat ? "hidden" : "flex"
          } w-full md:w-[320px] lg:w-[380px] flex-col min-h-0 bg-[#373B5C] border-r border-[#4A4F76]`}
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
                onRequestProcessed={handleRequestProcessed}
              />
            )}
            {activeView === "channels" && <Channels onSelect={handleSelect} />}
          </div>
        </div>

        {/* Area chat */}
        <div
          className={`${
            isMobileView && !showMobileChat ? "hidden" : "flex"
          } flex-1 flex-col min-h-0 bg-[#424874]`}
        >
          {oldSelected ? (
            <Messages
              key={oldSelected.pub || oldSelected.roomId || oldSelected.id}
              chatData={oldSelected}
              messages={messages}
              loading={chatLoading}
              onSendMessage={sendMessage}
              isMobileView={isMobileView}
              onBack={handleBackToList}
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
