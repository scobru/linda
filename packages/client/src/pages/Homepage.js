import React, { useEffect, useRef, useState } from "react";
import Context from "../contexts/context";
import { messaging, sessionManager } from "linda-protocol";
import { toast } from "react-hot-toast";
import { gun, user } from "linda-protocol";
// compos
import Friends from "../components/Homepage/Friends";
import Profile from "../components/Homepage/Profile";
import AddFriend from "../components/Homepage/AddFriend";
import Messages from "../components/Homepage/Messages";
import AppStatus from "../components/AppStatus";
import { useNavigate } from "react-router-dom";
import { authentication, DAPP_NAME } from "linda-protocol";
import Channels from "../components/Homepage/Channels";
import { walletService } from "linda-protocol";
import TransactionHistory from "../components/Homepage/TransactionHistory";
import GlobalWalletModal from "../components/Homepage/GlobalWalletModal";
import TransactionModal from "../components/Homepage/TransactionModal";

const { chat } = messaging; // Destruttura il servizio chat

export default function Homepage() {
  const [isShown, setIsShown] = React.useState(false);
  const { setFriends, setSelected, selected, setConnectionState } =
    React.useContext(Context);
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
  const [isMobileView, setIsMobileView] = useState(false);
  const [showChatList, setShowChatList] = useState(true);

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

  // Gestione selezione utente
  const handleSelect = React.useCallback(
    async (user) => {
      try {
        setLoading(true);
        setChatInitialized(false);
        chatInitializedRef.current = false;

        console.log("Selecting user:", user);

        // Reset dello stato corrente
        setCurrentChatData(null);
        setSelected(null);

        // Prepara i dati della chat in base al tipo
        let chatData;
        if (user.type === "channel" || user.type === "group") {
          chatData = {
            roomId: user.id,
            type: user.type,
            name: user.name,
            isGroup: true,
            members: user.members,
            creator: user.creator,
          };
        } else {
          // Per le chat private, usa sempre createChat per ottenere/creare la chat
          chatData = await new Promise((resolve, reject) => {
            chat.createChat(user.pub, (response) => {
              console.log("Create chat response:", response);
              if (response.success && response.chat) {
                resolve(response.chat);
              } else {
                reject(
                  new Error(response.errMessage || "Failed to create chat")
                );
              }
            });
          });
        }

        console.log("Chat data prepared:", chatData);

        // Imposta l'utente/gruppo selezionato con i dati aggiornati
        const selectedData = {
          ...user,
          roomId: chatData.roomId || chatData.id,
          type: user.type || "friend",
          chat: chatData,
        };

        console.log("Setting selected data:", selectedData);

        setSelected(selectedData);
        selectedRef.current = selectedData;

        // Imposta i dati della chat
        setCurrentChatData(chatData);
        setChatInitialized(true);
        chatInitializedRef.current = true;

        // Salva la selezione nel localStorage
        localStorage.setItem("selectedUser", JSON.stringify(selectedData));
      } catch (error) {
        console.error("Errore selezione:", error);
        toast.error("Errore nella selezione");
        setSelected(null);
        selectedRef.current = null;
        localStorage.removeItem("selectedUser");
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
        setSelected(parsedSelection);
        selectedRef.current = parsedSelection;
        if (parsedSelection.chat && parsedSelection.roomId) {
          setCurrentChatData(parsedSelection.chat);
          setChatInitialized(true);
          chatInitializedRef.current = true;
        }
      } catch (error) {
        console.error("Error parsing saved selection:", error);
        localStorage.removeItem("selectedUser");
      }
    }
  }, [setSelected]);

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
    const processedRequests = new Set(); // Cache per le richieste già processate

    // Monitora il nodo pubblico delle richieste
    const processRequest = async (request) => {
      if (!mounted || !request) return;

      // Verifica che la richiesta sia diretta all'utente corrente
      if (request.to !== user.is.pub) return;

      // Crea un ID univoco per la richiesta
      const requestId = `${request.from}_${request.timestamp}`;

      // Se la richiesta è già stata processata, ignorala
      if (processedRequests.has(requestId)) {
        console.log("Request already processed:", requestId);
        return;
      }

      console.log("Processing friend request:", request);
      processedRequests.add(requestId);

      // Verifica se l'utente è già un amico
      if (friendsRef.current.has(request.from)) {
        console.log("User is already a friend:", request.from);
        // Rimuovi la richiesta se esiste
        gun
          .get(DAPP_NAME)
          .get("all_friend_requests")
          .map()
          .once((data, key) => {
            if (data && data.from === request.from) {
              gun.get(DAPP_NAME).get("all_friend_requests").get(key).put(null);
            }
          });
        return;
      }

      // Aggiungi la nuova richiesta
      setPendingRequests((prev) => {
        const exists = prev.some((r) => r.pub === request.from);
        if (!exists) {
          const newRequest = {
            pub: request.from,
            alias:
              request.senderInfo?.alias ||
              request.data?.senderInfo?.alias ||
              "Unknown",
            timestamp: request.timestamp,
            data: request.data,
            senderInfo: request.senderInfo,
            key: request.key,
          };
          console.log("New request added:", newRequest);
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

  // Effetto per gestire la visualizzazione mobile/desktop
  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768; // 768px è il breakpoint md di Tailwind
      setIsMobileView(isMobile);
      if (!isMobile) {
        setShowChatList(true);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Effetto per gestire la visualizzazione quando viene selezionata una chat
  useEffect(() => {
    if (isMobileView && selected) {
      setShowChatList(false);
    }
  }, [selected, isMobileView]);

  // Handler per tornare alla lista chat
  const handleBackToList = () => {
    setSelected(null);
    setShowChatList(true);
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div
        className={`
        ${isMobileView ? "fixed inset-0 z-30" : "relative w-80 min-w-[320px]"}
        ${!isMobileView || showChatList ? "block" : "hidden"}
        bg-white border-r
      `}
      >
        <div className="flex flex-col h-full">
          {/* Tab navigation */}
          <div className="flex border-b">
            <button
              onClick={() => setActiveView("chats")}
              className={`flex-1 py-3 text-sm font-medium ${
                activeView === "chats"
                  ? "text-blue-500 border-b-2 border-blue-500"
                  : "text-gray-500"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveView("channels")}
              className={`flex-1 py-3 text-sm font-medium ${
                activeView === "channels"
                  ? "text-blue-500 border-b-2 border-blue-500"
                  : "text-gray-500"
              }`}
            >
              Boards and Channels
            </button>
          </div>

          {/* Content based on active view */}
          {activeView === "chats" ? (
            <Friends onSelect={handleSelect} />
          ) : (
            <Channels onSelect={handleSelect} />
          )}
        </div>
      </div>

      {/* Chat area */}
      <div
        className={`
        flex-1 
        ${isMobileView ? (showChatList ? "hidden" : "block") : "block"}
      `}
      >
        <Messages
          chatData={currentChatData}
          isMobileView={isMobileView}
          onBack={handleBackToList}
        />
      </div>

      {/* Modal per aggiungere amici */}
      {isShown && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-medium">Aggiungi amico</h3>
              <button
                onClick={() => setIsShown(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
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
      <GlobalWalletModal
        isOpen={isGlobalWalletModalOpen}
        onClose={() => setIsGlobalWalletModalOpen(false)}
      />
      <TransactionModal
        isOpen={isTransactionModalOpen}
        onClose={() => setIsTransactionModalOpen(false)}
      />
    </div>
  );
}
