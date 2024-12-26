import React, { useEffect, useRef, useState } from "react";
import Context from "../contexts/context";
import {
  messaging,
  sessionManager,
  userBlocking,
  friendships,
} from "linda-protocol";
import { toast } from "react-hot-toast";
import { gun, user, DAPP_NAME } from "linda-protocol";
// compos
import Friends from "../components/Homepage/Friends";
import Profile from "../components/Homepage/Profile";
import AddFriend from "../components/Homepage/AddFriend";
import Messages from "../components/Homepage/Messages";
import AppStatus from "../components/AppStatus";
import { useNavigate } from "react-router-dom";
import Channels from "../components/Homepage/Channels";
import { walletService } from "linda-protocol";
import TransactionHistory from "../components/Homepage/TransactionHistory";
import GlobalWalletModal from "../components/Homepage/GlobalWalletModal";
import TransactionModal from "../components/Homepage/TransactionModal";
import Header from "../components/Header";

const { chat } = messaging;

// Funzione per rimuovere un amico
const removeFriend = async (friendPub) => {
  try {
    // Rimuovi l'amicizia da Gun
    await new Promise((resolve, reject) => {
      const friendshipId = [user.is.pub, friendPub].sort().join("_");
      gun
        .get(DAPP_NAME)
        .get("friendships")
        .get(friendshipId)
        .put(null, (ack) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve();
        });
    });

    // Rimuovi l'amico dalla lista amici dell'utente
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get("users")
        .get(user.is.pub)
        .get("friends")
        .map()
        .once((data, key) => {
          if (data && data.pub === friendPub) {
            gun
              .get(DAPP_NAME)
              .get("users")
              .get(user.is.pub)
              .get("friends")
              .get(key)
              .put(null, (ack) => {
                if (ack.err) reject(new Error(ack.err));
                else resolve();
              });
          }
        });
      setTimeout(resolve, 500);
    });

    return { success: true };
  } catch (error) {
    console.error("Errore nella rimozione dell'amico:", error);
    throw new Error("Errore nella rimozione dell'amico");
  }
};

export default function Homepage() {
  const [isShown, setIsShown] = React.useState(false);
  const [isMobileView, setIsMobileView] = React.useState(false);
  const [showMobileChat, setShowMobileChat] = React.useState(false);
  const {
    setFriends,
    setSelected,
    selected,
    friends,
    setConnectionState,
    currentView,
    setCurrentView,
  } = React.useContext(Context);
  const [pendingRequests, setPendingRequests] = React.useState([]);
  const processedRequestsRef = React.useRef(new Set());
  const friendsRef = React.useRef(new Set());
  const [isProcessingRequest, setIsProcessingRequest] = React.useState(false);
  const subscriptions = useRef({});
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);
  const selectedRef = useRef(null);
  const [chatInitialized, setChatInitialized] = React.useState(false);
  const chatInitializedRef = useRef(false);
  const [currentChatData, setCurrentChatData] = React.useState(null);
  const [activeView, setActiveView] = React.useState("chats");
  const [isGlobalWalletModalOpen, setIsGlobalWalletModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [chatsState, setChatsState] = React.useState({
    friends: [],
    channels: [],
  });
  const [viewStates, setViewStates] = React.useState({
    chats: {
      selected: null,
      list: [],
    },
    channels: {
      selected: null,
      list: [],
    },
  });
  const [myChannels, setMyChannels] = React.useState([]);

  // Stato separato per chat e canali
  const [chatState, setChatState] = React.useState({
    selected: null,
    lastChat: null,
  });

  const [channelState, setChannelState] = React.useState({
    selected: null,
    lastChannel: null,
  });

  const [processedRequests, setProcessedRequests] = React.useState(() => {
    try {
      const saved = localStorage.getItem("processedFriendRequests");
      return new Set(saved ? JSON.parse(saved) : []);
    } catch {
      return new Set();
    }
  });

  const addProcessedRequest = (requestId) => {
    setProcessedRequests((prev) => {
      const newSet = new Set(prev);
      newSet.add(requestId);
      localStorage.setItem(
        "processedFriendRequests",
        JSON.stringify([...newSet])
      );
      return newSet;
    });
  };

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Monitora lo stato della connessione
  React.useEffect(() => {
    if (!setConnectionState) return;

    const handleConnect = () => setConnectionState("connected");
    const handleDisconnect = () => setConnectionState("disconnected");

    gun.on("hi", handleConnect);
    gun.on("bye", handleDisconnect);

    return () => {
      gun.off("hi", handleConnect);
      gun.off("bye", handleDisconnect);
    };
  }, [setConnectionState]);

  // Effetto per gestire il resize della finestra
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768); // 768px è il breakpoint md di Tailwind
    };

    handleResize(); // Chiamata iniziale
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Modifica la gestione del cambio tab
  const handleViewChange = (view) => {
    console.log("Cambio vista:", {
      da: activeView,
      a: view,
      selectedAttuale: selected,
      chatState,
      channelState,
    });

    // Se stiamo tornando alle chat
    if (view === "chats") {
      // Salva lo stato corrente dei canali
      if (
        selected &&
        (selected.type === "channel" || selected.type === "board")
      ) {
        console.log("Salvo il canale corrente:", selected);
        setChannelState((prev) => ({
          ...prev,
          selected: selected,
        }));
        // Reset della selezione corrente poiché stiamo passando alle chat
        setSelected(null);
      }

      // Forza il caricamento degli amici
      loadFriends().then((loadedFriends) => {
        console.log("Amici caricati:", loadedFriends);
        // Ripristina l'ultima chat selezionata solo se era una chat privata
        if (chatState.selected && chatState.selected.type === "friend") {
          console.log("Ripristino l'ultima chat:", chatState.selected);
          setSelected(chatState.selected);
        }
      });
    }

    // Se stiamo passando a channels
    if (view === "channels") {
      // Salva lo stato corrente delle chat
      if (selected && selected.type === "friend") {
        console.log("Salvo la chat corrente:", selected);
        setChatState((prev) => ({
          ...prev,
          selected: selected,
          list: friends, // Preserva la lista degli amici
        }));
        // Reset della selezione corrente poiché stiamo passando ai canali
        setSelected(null);
      }
      // Ripristina l'ultimo canale selezionato
      if (channelState.selected) {
        console.log("Ripristino l'ultimo canale:", channelState.selected);
        setSelected(channelState.selected);
      }
    }

    // Aggiorna le viste
    setActiveView(view);
    if (setCurrentView) {
      setCurrentView(view);
    }
  };

  // Funzione per caricare gli amici
  const loadFriends = async () => {
    try {
      console.log("Caricamento lista amici...");
      const friendsList = [];
      await new Promise((resolve) => {
        gun
          .get(DAPP_NAME)
          .get("friendships")
          .map()
          .once((friendship, id) => {
            if (!friendship) return;
            if (
              friendship.user1 === user.is.pub ||
              friendship.user2 === user.is.pub
            ) {
              const friendPub =
                friendship.user1 === user.is.pub
                  ? friendship.user2
                  : friendship.user1;
              friendsList.push({
                pub: friendPub,
                alias: `${friendPub.slice(0, 6)}...${friendPub.slice(-4)}`,
                friendshipId: id,
                added: friendship.created,
                type: "friend",
              });
            }
          });
        setTimeout(resolve, 1000);
      });

      console.log("Lista amici caricata:", friendsList);
      setFriends(friendsList);
      friendsRef.current = new Set(friendsList.map((f) => f.pub));
      return friendsList;
    } catch (error) {
      console.error("Errore caricamento amici:", error);
      return [];
    }
  };

  // Modifica la gestione della selezione
  const handleSelect = React.useCallback(
    async (item) => {
      try {
        setLoading(true);
        console.log("Selezionando:", item);

        // Determina il tipo di selezione
        const isChannel = item.type === "channel" || item.type === "board";

        // Prepara i dati
        let finalData;
        if (isChannel) {
          finalData = {
            ...item,
            id: item.id,
            roomId: item.id,
            type: item.type,
            name: item.name,
            creator: item.creator,
            members: item.members || [],
          };

          // Aggiorna lo stato dei canali
          setChannelState((prev) => ({
            ...prev,
            selected: finalData,
          }));
        } else {
          // Per le chat private
          const chatData = await new Promise((resolve, reject) => {
            chat.createChat(item.pub, (response) => {
              if (response.success && response.chat) {
                resolve(response.chat);
              } else {
                reject(
                  new Error(
                    response.errMessage || "Errore nella creazione della chat"
                  )
                );
              }
            });
          });

          finalData = {
            ...item,
            roomId: chatData.roomId || chatData.id,
            chat: chatData,
          };

          // Aggiorna lo stato delle chat
          setChatState((prev) => ({
            ...prev,
            selected: finalData,
          }));
        }

        // Aggiorna la selezione globale
        setSelected(finalData);
        setShowMobileChat(true);
      } catch (error) {
        console.error("Errore nella selezione:", error);
        toast.error("Errore nella selezione della chat");
      } finally {
        setLoading(false);
      }
    },
    [setSelected]
  );

  // Effetto per mantenere la selezione
  useEffect(() => {
    const savedSelection = localStorage.getItem("selectedUser");
    if (savedSelection && !selectedRef.current) {
      try {
        const parsedSelection = JSON.parse(savedSelection);
        if (parsedSelection && (parsedSelection.roomId || parsedSelection.id)) {
          handleSelect(parsedSelection);
        }
      } catch (error) {
        console.error("Errore nel ripristino della selezione:", error);
        localStorage.removeItem("selectedUser");
      }
    }
  }, [handleSelect]);

  // Effetto per gestire il cleanup
  useEffect(() => {
    return () => {
      chatInitializedRef.current = false;
    };
  }, []);

  // Definisci validateSession fuori dall'effetto delle amicizie
  const validateSession = async () => {
    try {
      // Verifica se l'utente è presente e autenticato
      if (!user?.is || !localStorage.getItem("isAuthenticated")) {
        console.log("Utente non presente o non autenticato");
        localStorage.removeItem("isAuthenticated");
        sessionManager.clearSession();
        navigate("/login", { replace: true });
        return false;
      }

      // Verifica la sessione
      const isValid = await sessionManager.validateSession();
      if (!isValid) {
        console.log("Sessione non valida");
        localStorage.removeItem("isAuthenticated");
        sessionManager.clearSession();
        navigate("/login", { replace: true });
        return false;
      }

      // Verifica che il pub dell'utente corrisponda
      const storedPub = localStorage.getItem("userPub");
      if (!storedPub || storedPub !== user.is.pub) {
        console.log("Mismatch tra userPub salvato e user.is.pub");
        localStorage.removeItem("isAuthenticated");
        sessionManager.clearSession();
        navigate("/login", { replace: true });
        return false;
      }

      // Aggiorna il timestamp dell'ultimo accesso
      gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .get(user.is.pub)
        .get("lastSeen")
        .put(Date.now());

      return true;
    } catch (error) {
      console.error("Errore validazione sessione:", error);
      localStorage.removeItem("isAuthenticated");
      sessionManager.clearSession();
      navigate("/login", { replace: true });
      return false;
    }
  };

  // Modifica l'effetto per la gestione dell'autenticazione
  React.useEffect(() => {
    let mounted = true;
    let authCheckInterval;

    const checkAuth = async () => {
      if (!mounted) return;

      const isValid = await validateSession();
      if (!isValid && mounted) {
        console.log("Sessione non valida, reindirizzamento al login");
        localStorage.removeItem("isAuthenticated");
        sessionManager.clearSession();
        navigate("/login", { replace: true });
      }
    };

    // Verifica iniziale
    checkAuth();

    // Verifica periodica ogni minuto invece che ogni 30 secondi
    authCheckInterval = setInterval(checkAuth, 60000);

    return () => {
      mounted = false;
      if (authCheckInterval) {
        clearInterval(authCheckInterval);
      }
    };
  }, [navigate]);

  // Monitora le richieste di amicizia e gli amici
  React.useEffect(() => {
    if (!user?.is) return;

    console.log("Starting friend requests and friends monitoring");
    let mounted = true;

    // Monitora il nodo pubblico delle richieste
    const processRequest = async (request) => {
      if (!mounted || !request) return;

      // Verifica che la richiesta sia diretta all'utente corrente
      if (request.to !== user.is.pub) return;

      // Crea un ID univoco per la richiesta
      const requestId = `${request.from || request.pub}_${request.timestamp}`;

      // Se la richiesta è già stata processata, ignorala
      if (processedRequests.has(requestId)) {
        console.log("Richiesta già processata, la ignoro:", requestId);
        return;
      }

      // Verifica se l'utente è già un amico
      const isAlreadyFriend = friendsRef.current.has(
        request.from || request.pub
      );
      if (isAlreadyFriend) {
        console.log(
          "Utente già amico, ignoro la richiesta:",
          request.from || request.pub
        );
        addProcessedRequest(requestId);
        return;
      }

      // Aggiungi la nuova richiesta solo se non è già presente
      setPendingRequests((prev) => {
        const exists = prev.some(
          (r) =>
            (r.from === request.from || r.pub === request.pub) &&
            (!r.timestamp || r.timestamp === request.timestamp)
        );
        if (!exists) {
          const newRequest = {
            pub: request.pub || request.from,
            from: request.from || request.pub,
            alias:
              request.senderInfo?.alias ||
              request.data?.senderInfo?.alias ||
              "Unknown",
            timestamp: request.timestamp,
            data: request.data,
            senderInfo: request.senderInfo,
            key: request.key,
            id: requestId,
          };
          console.log("Nuova richiesta aggiunta:", newRequest);
          return [...prev, newRequest];
        }
        return prev;
      });
    };

    // Usa un debounce per le richieste private
    let debounceTimeout;
    const processPrivateRequest = async (request) => {
      if (debounceTimeout) clearTimeout(debounceTimeout);

      debounceTimeout = setTimeout(async () => {
        if (!request?.data) return;

        try {
          const senderPub = request.from;
          const senderData = await gun.get(`~${senderPub}`).then();
          if (!senderData?.epub) return;

          const sharedSecret = await SEA.secret(senderData.epub, user._.sea);
          const decrypted = await SEA.decrypt(request.data, sharedSecret);

          if (decrypted) {
            const parsedRequest =
              typeof decrypted === "string" ? JSON.parse(decrypted) : decrypted;
            processRequest(parsedRequest);
          }
        } catch (error) {
          console.error("Error processing encrypted request:", error);
        }
      }, 500); // Delay di 500ms
    };

    // Sottoscrizioni con throttling
    const unsubPublic = gun
      .get(DAPP_NAME)
      .get("all_friend_requests")
      .map()
      .on((request) => {
        if (request) {
          processRequest(request);
        }
      });

    const unsubPrivate = gun
      .get(DAPP_NAME)
      .get("friend_requests")
      .get(user.is.pub)
      .map()
      .on((request) => {
        if (request) {
          processPrivateRequest(request);
        }
      });

    // Debug info con throttling
    const debugInterval = setInterval(() => {
      if (!mounted) return;
      console.log("Debug info:");
      console.log("- Pending requests:", pendingRequests);
      console.log("- Processed requests:", Array.from(processedRequests));
      console.log("- Current friends:", Array.from(friendsRef.current));
    }, 10000); // Ogni 10 secondi invece di 5

    return () => {
      mounted = false;
      if (debounceTimeout) clearTimeout(debounceTimeout);
      if (typeof unsubPublic === "function") unsubPublic();
      if (typeof unsubPrivate === "function") unsubPrivate();
      clearInterval(debugInterval);
      processedRequests.clear();
    };
  }, [user?.is]);

  useEffect(() => {
    const handlePreLogout = () => {
      Object.values(subscriptions.current).forEach((unsub) => {
        if (typeof unsub === "function") {
          try {
            unsub();
          } catch (error) {
            console.warn(
              "Errore durante la pulizia della sottoscrizione:",
              error
            );
          }
        }
      });
    };

    window.addEventListener("pre-logout", handlePreLogout);

    return () => {
      window.removeEventListener("pre-logout", handlePreLogout);
      handlePreLogout();
    };
  }, []);

  // Aggiungi questa funzione per gestire la riconnessione
  const handleReconnect = () => {
    try {
      // Forza la disconnessione
      gun.off();
      // Riconnetti dopo un breve delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error("Errore durante la riconnessione:", error);
    }
  };

  // Aggiungi un effetto per il ping periodico
  React.useEffect(() => {
    const pingInterval = setInterval(() => {
      if (user?.is) {
        gun
          .get(DAPP_NAME)
          .get("userList")
          .get("users")
          .get(user?.is?.pub)
          .get("lastSeen")
          .put(Date.now());
      }
    }, 30000); // Ogni 30 secondi

    return () => clearInterval(pingInterval);
  }, []);

  // Aggiungi questo effetto per gestire gli errori di rete
  React.useEffect(() => {
    const handleNetworkError = () => {
      toast.error("Errore di connessione. Tentativo di riconnessione...");
      handleReconnect();
    };

    window.addEventListener("offline", handleNetworkError);
    gun.on("disconnect", handleNetworkError);

    return () => {
      window.removeEventListener("offline", handleNetworkError);
      gun.off("disconnect", handleNetworkError);
    };
  }, []);

  // Aggiungi questa cache per gli aggiornamenti
  const updateCache = {
    friends: new Map(),
    selected: null,
    lastUpdate: 0,
    THROTTLE_TIME: 2000, // 2 secondi di throttle
  };

  // Modifica l'effetto che monitora gli aggiornamenti degli utenti
  React.useEffect(() => {
    if (!user?.is) return;

    let mounted = true;
    let updateTimeout = null;

    const processUpdate = (userData) => {
      if (!mounted || !userData?.pub) return;

      const now = Date.now();
      if (now - updateCache.lastUpdate < updateCache.THROTTLE_TIME) {
        return; // Ignora aggiornamenti troppo frequenti
      }

      // Verifica se i dati sono effettivamente cambiati
      const currentData = updateCache.friends.get(userData.pub);
      const newData = JSON.stringify({
        nickname: userData.nickname,
        username: userData.username,
        avatarSeed: userData.avatarSeed,
      });

      if (currentData === newData) return; // Nessun cambiamento
      updateCache.friends.set(userData.pub, newData);
      updateCache.lastUpdate = now;

      // Raggruppa gli aggiornamenti
      if (updateTimeout) clearTimeout(updateTimeout);

      updateTimeout = setTimeout(() => {
        // Aggiorna friends solo se necessario
        setFriends((prev) => {
          const needsUpdate = prev.some((friend) => {
            const cached = JSON.parse(
              updateCache.friends.get(friend.pub) || "{}"
            );
            return (
              friend.pub === userData.pub &&
              (friend.alias !== (cached.nickname || cached.username) ||
                friend.avatarSeed !== cached.avatarSeed)
            );
          });

          if (!needsUpdate) return prev;

          return prev.map((friend) => {
            if (friend.pub === userData.pub) {
              const cached = JSON.parse(
                updateCache.friends.get(friend.pub) || "{}"
              );
              return {
                ...friend,
                alias: cached.nickname || cached.username || friend.alias,
                avatarSeed: cached.avatarSeed,
              };
            }
            return friend;
          });
        });

        // Aggiorna selected solo se necessario
        setSelected((prev) => {
          if (!prev || prev.pub !== userData.pub) return prev;

          const cached = JSON.parse(
            updateCache.friends.get(userData.pub) || "{}"
          );
          const newUpdate = JSON.stringify({
            alias: cached.nickname || cached.username,
            avatarSeed: cached.avatarSeed,
          });

          if (updateCache.selected === newUpdate) return prev;
          updateCache.selected = newUpdate;

          return {
            ...prev,
            alias: cached.nickname || cached.username || prev.alias,
            avatarSeed: cached.avatarSeed,
          };
        });
      }, 1000);
    };

    // Una sola sottoscrizione per gli aggiornamenti degli utenti
    const unsubUserUpdates = gun
      .get(DAPP_NAME)
      .get("userList")
      .get("users")
      .map()
      .on((userData, key) => {
        if (userData?.pub) {
          processUpdate(userData);
        }
      });

    return () => {
      mounted = false;
      if (updateTimeout) clearTimeout(updateTimeout);
      if (typeof unsubUserUpdates === "function") {
        unsubUserUpdates();
      }
      updateCache.friends.clear();
      updateCache.selected = null;
    };
  }, [user?.is]);

  // Effetto per caricare le chat
  React.useEffect(() => {
    if (!user?.is) return;

    console.log("Caricamento chat iniziato");
    let mounted = true;

    const loadChats = async () => {
      try {
        // Carica la lista amici da Gun
        const friendsList = [];
        await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("friendships")
            .map()
            .once((friendship, id) => {
              if (!friendship) return;
              if (
                friendship.user1 === user.is.pub ||
                friendship.user2 === user.is.pub
              ) {
                const friendPub =
                  friendship.user1 === user.is.pub
                    ? friendship.user2
                    : friendship.user1;
                friendsList.push({
                  pub: friendPub,
                  alias: `${friendPub.slice(0, 6)}...${friendPub.slice(-4)}`,
                  friendshipId: id,
                  added: friendship.created,
                  type: "friend",
                });
              }
            });
          setTimeout(resolve, 1000);
        });

        if (mounted) {
          console.log("Chat caricate:", friendsList);
          setFriends(friendsList);
          friendsRef.current = new Set(friendsList.map((f) => f.pub));
        }
      } catch (error) {
        console.error("Errore caricamento chat:", error);
      }
    };

    loadChats();
    return () => {
      mounted = false;
    };
  }, [user?.is]);

  // Modifica l'effetto che monitora lo stato
  React.useEffect(() => {
    console.log("Stato attuale:", {
      activeView,
      selected: selected?.pub || selected?.id,
      selectedType: selected?.type,
      chatState,
      channelState,
      friends: friends.length,
    });

    // Aggiorna lo stato appropriato in base al tipo
    if (selected) {
      if (selected.type === "channel" || selected.type === "board") {
        setChannelState((prev) => ({
          ...prev,
          selected: selected,
        }));
      } else {
        setChatState((prev) => ({
          ...prev,
          selected: selected,
        }));
      }
    }
  }, [activeView, selected, friends]);

  // Modifica l'effetto per il ripristino iniziale
  React.useEffect(() => {
    if (activeView === "chats" && !selected) {
      const savedChat = localStorage.getItem("lastSelectedChat");
      if (savedChat) {
        const parsedChat = JSON.parse(savedChat);
        // Ripristina solo se è una chat privata o un amico
        if (parsedChat.type === "friend" || !parsedChat.type) {
          console.log("Ripristino chat iniziale dal localStorage:", parsedChat);
          setSelected(parsedChat);
          selectedRef.current = parsedChat;
        }
      }
    }

    // Forza l'aggiornamento della lista amici quando si torna alla tab 'chats'
    if (activeView === "chats") {
      console.log("Aggiornamento lista amici");
      setFriends((prev) => [...prev]); // Forza un aggiornamento della lista
    }
  }, [activeView]);

  return (
    <div className="flex flex-col h-screen max-h-screen">
      <Header
        onProfileUpdate={(updatedData) => {
          gun
            .get(DAPP_NAME)
            .get("userList")
            .get("users")
            .set({
              pub: user.is.pub,
              nickname: updatedData.nickname,
              avatarSeed: updatedData.avatarSeed,
              timestamp: Date.now(),
              lastSeen: Date.now(),
              username: user.is.alias,
              authType: localStorage.getItem("walletAuth") ? "wallet" : "gun",
            });
        }}
        onAddClick={() => setIsShown(true)}
        onWalletClick={() => setIsGlobalWalletModalOpen(true)}
        onTransactionClick={() => setIsTransactionModalOpen(true)}
        onProfileClick={() => setIsEditingProfile(true)}
        activeView={activeView}
      />

      {/* Container principale */}
      <div className="flex flex-1 min-h-0 bg-[#373B5C]">
        {/* Sidebar */}
        <div
          className={`${
            showMobileChat ? "hidden" : "w-full"
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
                onSelect={handleSelect}
                pendingRequests={pendingRequests}
                loading={loading}
                selectedUser={selected}
                onRequestProcessed={(requestFrom, action) => {
                  console.log("Processamento richiesta:", requestFrom, action);

                  // Trova la richiesta nel pendingRequests
                  const request = pendingRequests.find(
                    (r) => r.from === requestFrom || r.pub === requestFrom
                  );
                  if (request) {
                    // Aggiungi l'ID della richiesta a quelle processate
                    const requestId =
                      request.id || `${requestFrom}_${request.timestamp}`;
                    addProcessedRequest(requestId);
                  }

                  // Rimuovi la richiesta dalla lista delle pending
                  setPendingRequests((prev) =>
                    prev.filter(
                      (r) => r.from !== requestFrom && r.pub !== requestFrom
                    )
                  );

                  if (action === "accept") {
                    loadFriends();
                  }
                }}
                onRemoveFriend={async (friend) => {
                  try {
                    if (
                      window.confirm(
                        "Sei sicuro di voler rimuovere questo amico?"
                      )
                    ) {
                      const result = await removeFriend(friend.pub);
                      if (result.success) {
                        toast.success("Amico rimosso con successo");
                        // Aggiorna la lista amici
                        setFriends((prev) =>
                          prev.filter((f) => f.pub !== friend.pub)
                        );
                        friendsRef.current.delete(friend.pub);
                        // Se l'amico rimosso era selezionato, deselezionalo
                        if (selected?.pub === friend.pub) {
                          setSelected(null);
                        }
                      }
                    }
                  } catch (error) {
                    console.error("Errore rimozione amico:", error);
                    toast.error("Errore durante la rimozione");
                  }
                }}
                onBlockUser={async (friend) => {
                  try {
                    const result = await userBlocking.blockUser(friend.pub);
                    if (result.success) {
                      toast.success(`${friend.alias} è stato bloccato`);
                      setFriends((prev) =>
                        prev.map((f) =>
                          f.pub === friend.pub ? { ...f, isBlocked: true } : f
                        )
                      );
                    }
                  } catch (error) {
                    console.error("Error blocking user:", error);
                    toast.error("Errore durante il blocco dell'utente");
                  }
                }}
                onUnblockUser={async (friend) => {
                  try {
                    const unblockResult = await userBlocking.unblockUser(
                      friend.pub
                    );
                    if (!unblockResult.success) {
                      throw new Error(unblockResult.message);
                    }
                    const chatId = [user.is.pub, friend.pub].sort().join("_");
                    await chat.unblockChat(chatId);
                    setFriends((prev) =>
                      prev.map((f) =>
                        f.pub === friend.pub ? { ...f, isBlocked: false } : f
                      )
                    );
                    toast.success(`${friend.alias} è stato sbloccato`);
                  } catch (error) {
                    console.error("Error unblocking user:", error);
                    toast.error("Errore durante lo sblocco dell'utente");
                  }
                }}
                friends={friends}
              />
            )}
            {activeView === "channels" && <Channels onSelect={handleSelect} />}
            {activeView === "transactions" && <TransactionHistory />}
          </div>
        </div>

        {/* Area chat */}
        <div
          className={`${
            !showMobileChat ? "hidden" : "w-full"
          } md:flex flex-1 flex-col min-h-0 bg-[#424874]`}
        >
          {selected ? (
            <Messages
              key={selected.pub || selected.roomId || selected.id}
              chatData={selected}
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

      {/* Modali */}
      {isShown && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#373B5C] rounded-lg shadow-xl w-full max-w-[320px] border border-[#4A4F76]">
            <div className="p-4 border-b border-[#4A4F76] flex justify-between items-center">
              <h3 className="text-base font-medium text-white">
                Aggiungi amico
              </h3>
              <button
                onClick={() => setIsShown(false)}
                className="p-2 hover:bg-[#4A4F76] rounded-full transition-colors text-gray-300 hover:text-white"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <AddFriend onClose={() => setIsShown(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Altri modali */}
      {isEditingProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#373B5C] rounded-lg w-full max-w-[320px] max-h-[80vh] overflow-y-auto border border-[#4A4F76]">
            <div className="sticky top-0 bg-[#2D325A] p-4 border-b border-[#4A4F76] flex justify-between items-center">
              <h3 className="text-base font-medium text-white">
                Modifica Profilo
              </h3>
              <button
                onClick={() => setIsEditingProfile(false)}
                className="p-2 hover:bg-[#4A4F76] rounded-full transition-colors text-gray-300 hover:text-white"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <Profile onClose={() => setIsEditingProfile(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Wallet e Transaction modals */}
      <div className="z-50">
        <GlobalWalletModal
          isOpen={isGlobalWalletModalOpen}
          onClose={() => setIsGlobalWalletModalOpen(false)}
        />
        <TransactionModal
          isOpen={isTransactionModalOpen}
          onClose={() => setIsTransactionModalOpen(false)}
        />
      </div>
    </div>
  );
}
