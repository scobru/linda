import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { gun, DAPP_NAME } from "linda-protocol";
import { friendsService } from "linda-protocol";
import { useAppState } from "../context/AppContext";
import { useChat } from "../hooks/useChat";
import { useFriendRequestNotifications } from "../hooks/useFriendRequestNotifications";
import { Observable } from "rxjs";

// Components
import Friends from "../components/Homepage/Friends/Friends";
import Messages from "../components/Homepage/Messages/Messages";
import Header from "../components/Header";
import ChannelList from "../components/Homepage/Channels/ChannelList";
import BoardList from "../components/Homepage/Boards/BoardList";
import CreateChannel from "../components/Homepage/Channels/CreateChannel";
import CreateBoard from "../components/Homepage/Boards/CreateBoard";

export default function Homepage() {
  const navigate = useNavigate();
  const { appState, updateAppState, currentView, setCurrentView } =
    useAppState();

  // Stati locali
  const [loading, setLoading] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [chatRoomId, setChatRoomId] = useState(null);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);
  const [showCreateModal, setShowCreateModal] = useState(false);

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
          updateAppState({ connectionState: "online" });
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
        const existingFriend = appState.friends.find(
          (f) => f.pub === friendPub
        );
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

            updateAppState((prev) => ({
              friends: [...prev.friends, newFriend],
            }));
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
        updateAppState({ friends: friendsWithChatId });
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

  // Effetto per gestire il cambio di chat selezionata
  useEffect(() => {
    console.log("Cambio selezione:", {
      selected: appState.selected,
      user: appState.user?.is,
    });

    if (!appState.user?.is?.pub) {
      console.log("Utente non autenticato");
      return;
    }

    if (appState.selected) {
      console.log("Chat selezionata:", appState.selected);

      if (appState.selected.pub) {
        const roomId = [appState.user.is.pub, appState.selected.pub]
          .sort()
          .join("_");
        console.log("Impostazione roomId per chat privata:", roomId);
        setChatRoomId(roomId);
      } else if (appState.selected.roomId) {
        console.log(
          "Impostazione roomId per gruppo:",
          appState.selected.roomId
        );
        setChatRoomId(appState.selected.roomId);
      }
    } else {
      console.log("Nessuna chat selezionata");
      setChatRoomId(null);
    }
  }, [appState.selected, appState.user?.is?.pub]);

  // Effetto per monitorare il chatRoomId
  useEffect(() => {
    console.log("ChatRoomId aggiornato:", chatRoomId);
  }, [chatRoomId]);

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

  return (
    <div className="flex h-screen bg-[#1E2140]">
      <div
        className={`w-full md:w-80 bg-[#1E2140] border-r border-[#2D325A] flex flex-col ${
          showMobileChat ? "hidden md:flex" : "flex"
        }`}
      >
        <Header />

        {/* Navigation Buttons */}
        <div className="p-4 flex space-x-2">
          <button
            onClick={() => setCurrentView("chats")}
            className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
              currentView === "chats"
                ? "bg-blue-600 text-white"
                : "bg-[#2D325A] text-gray-300 hover:bg-[#4A4F76]"
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setCurrentView("channels")}
            className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
              currentView === "channels"
                ? "bg-blue-600 text-white"
                : "bg-[#2D325A] text-gray-300 hover:bg-[#4A4F76]"
            }`}
          >
            Canali
          </button>
          <button
            onClick={() => setCurrentView("boards")}
            className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
              currentView === "boards"
                ? "bg-blue-600 text-white"
                : "bg-[#2D325A] text-gray-300 hover:bg-[#4A4F76]"
            }`}
          >
            Board
          </button>
        </div>

        {/* Create Button for Channels and Boards */}
        {(currentView === "channels" || currentView === "boards") && (
          <div className="px-4 mb-4">
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              {currentView === "channels" ? "Nuovo Canale" : "Nuova Board"}
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {currentView === "chats" && (
            <Friends
              selectedUser={appState.selected}
              pendingRequests={pendingRequests}
              loading={loading || requestsLoading}
              onRequestProcessed={removeRequest}
              onMobileSelect={setShowMobileChat}
            />
          )}
          {currentView === "channels" && <ChannelList />}
          {currentView === "boards" && <BoardList />}
        </div>
      </div>

      {/* Chat Area */}
      <div
        className={`flex-1 ${!showMobileChat ? "hidden md:block" : "block"}`}
      >
        <Messages
          messages={messages}
          loading={chatLoading}
          onSend={sendMessage}
          selected={appState.selected}
          showBackButton={isMobileView}
          onBack={() => setShowMobileChat(false)}
        />
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#2D325A] rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center p-4 border-b border-[#4A4F76]">
              <h2 className="text-xl font-bold text-white">
                {currentView === "channels" ? "Nuovo Canale" : "Nuova Board"}
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              {currentView === "channels" ? (
                <CreateChannel
                  onChannelCreated={() => {
                    setShowCreateModal(false);
                  }}
                />
              ) : (
                <CreateBoard
                  onBoardCreated={() => {
                    setShowCreateModal(false);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
