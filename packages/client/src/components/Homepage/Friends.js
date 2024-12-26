import React from "react";
import {
  gun,
  user,
  DAPP_NAME,
  blocking,
  messaging,
  friendsService,
} from "linda-protocol";
import { userUtils } from "linda-protocol";
import { removeFriend } from "linda-protocol";
import { toast } from "react-hot-toast";
import FriendRequest from "./FriendRequest";
import FriendItem from "./FriendItem";

const { userBlocking } = blocking;
const { chat } = messaging;

// Funzione per rimuovere un amico
const handleRemoveFriend = async (friend) => {
  try {
    if (window.confirm("Sei sicuro di voler rimuovere questo amico?")) {
      setIsLoading(true);
      const result = await removeFriend(friend.pub);

      if (result.success) {
        // Rimuovi l'amico dalla lista locale
        setFriends((prev) => prev.filter((f) => f.pub !== friend.pub));
        setFilteredFriends((prev) => prev.filter((f) => f.pub !== friend.pub));
        toast.success(result.message || "Amico rimosso con successo");
      } else {
        throw new Error(
          result.message || "Errore durante la rimozione dell'amico"
        );
      }
    }
  } catch (error) {
    console.error("Errore rimozione amico:", error);
    toast.error(error.message || "Errore durante la rimozione dell'amico");
  } finally {
    setIsLoading(false);
    setActiveMenu(null);
  }
};

export default function Friends({
  onSelect,
  loading,
  selectedUser,
  onRequestProcessed,
  onRemoveFriend,
  onBlockUser,
  onUnblockUser,
  initialFriends = [],
}) {
  const [friends, setFriends] = React.useState([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filteredFriends, setFilteredFriends] = React.useState([]);
  const [activeMenu, setActiveMenu] = React.useState(null);
  const [pendingRequests, setPendingRequests] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const processedRequestsRef = React.useRef(new Map()); // Usiamo useRef per mantenere la Map tra i re-render

  // Monitora le richieste di amicizia usando friendsService
  React.useEffect(() => {
    if (!user?.is) {
      console.log("Utente non autenticato, monitoraggio richieste non avviato");
      return;
    }

    console.log("Avvio monitoraggio richieste usando friendsService");
    let mounted = true;

    const processRequest = async (data) => {
      if (
        !mounted ||
        !data ||
        !data.from ||
        !data.to ||
        data.to !== user.is.pub
      ) {
        return;
      }

      try {
        const senderInfo = await userUtils.getUserInfo(data.from);
        console.log("Info mittente recuperate:", senderInfo);

        // Se abbiamo già una richiesta con alias da questo mittente, ignoriamo le altre
        const existingRequest = processedRequestsRef.current.get(data.from);
        if (existingRequest && existingRequest.hasAlias && !data.alias) {
          console.log(
            "Ignoro richiesta senza alias, abbiamo già una richiesta completa"
          );
          return;
        }

        const requestId =
          data.id || `${data.from}_${data.to}_${data.timestamp}`;
        const enrichedRequest = {
          id: requestId,
          from: data.from,
          to: data.to,
          timestamp: data.timestamp || Date.now(),
          type: "friendRequest",
          senderInfo: {
            ...senderInfo,
            pub: data.from,
            alias: data.alias || senderInfo?.alias || "Utente sconosciuto",
          },
          data: data.data,
          hasAlias: !!data.alias,
        };

        console.log("Richiesta arricchita:", enrichedRequest);

        // Aggiorna la Map delle richieste processate
        processedRequestsRef.current.set(data.from, enrichedRequest);

        // Aggiorna lo stato con tutte le richieste valide dalla Map
        setPendingRequests(Array.from(processedRequestsRef.current.values()));
      } catch (error) {
        console.error("Errore processamento richiesta:", error);
      }
    };

    // Sottoscrizione alle richieste di amicizia
    const subscription = friendsService.observeFriendRequests().subscribe({
      next: async ({ type, data }) => {
        if (!mounted) return;
        console.log("Nuova richiesta ricevuta:", { type, data });
        if (type === "incoming") {
          await processRequest(data);
        }
      },
      error: (error) => {
        console.error("Errore nel monitoraggio richieste:", error);
      },
    });

    // Carica le richieste esistenti
    gun
      .get(DAPP_NAME)
      .get("friend_requests")
      .get(user.is.pub)
      .map()
      .once((request, key) => {
        if (request && !request._) {
          processRequest(request);
        }
      });

    gun
      .get(DAPP_NAME)
      .get("all_friend_requests")
      .map()
      .once((request, key) => {
        if (request && !request._ && request.to === user.is.pub) {
          processRequest(request);
        }
      });

    return () => {
      console.log("Cleanup monitoraggio richieste");
      mounted = false;
      processedRequestsRef.current.clear();
      subscription.unsubscribe();
    };
  }, [user?.is, onRequestProcessed]);

  // Monitora la lista amici usando friendsService
  React.useEffect(() => {
    if (!user?.is) {
      console.log("Utente non autenticato nel componente Friends");
      return;
    }

    console.log("Avvio monitoraggio lista amici usando friendsService");
    let mounted = true;
    let processedFriends = new Set();

    const updateFriendBlockStatus = async (friend) => {
      try {
        const blockStatus = await userBlocking.getBlockStatus(friend.pub);
        return {
          ...friend,
          isBlocked: blockStatus.blocked,
          isBlockedBy: blockStatus.blockedBy,
        };
      } catch (error) {
        console.error("Errore nel recupero dello stato di blocco:", error);
        return friend;
      }
    };

    const subscription = friendsService.observeFriendsList().subscribe({
      next: async (friend) => {
        if (!mounted) return;

        const friendId = friend.pub;
        if (processedFriends.has(friendId)) {
          console.log("Amico già processato, aggiorno solo i dati:", friendId);
          const updatedFriend = await updateFriendBlockStatus(friend);
          setFriends((prev) =>
            prev.map((f) =>
              f.pub === friendId ? { ...f, ...updatedFriend } : f
            )
          );
          return;
        }

        console.log("Nuovo amico:", friend);
        processedFriends.add(friendId);
        const friendWithBlockStatus = await updateFriendBlockStatus(friend);
        setFriends((prev) => {
          const withoutDuplicates = prev.filter((f) => f.pub !== friendId);
          return [...withoutDuplicates, friendWithBlockStatus];
        });
      },
      error: (error) => {
        console.error("Errore nel monitoraggio lista amici:", error);
      },
    });

    // Carica la lista amici iniziale
    friendsService.getFriendsList(user.is.pub).then(async (friendsList) => {
      if (mounted) {
        console.log("Lista amici iniziale caricata:", friendsList);
        const uniqueFriends = [];
        for (const friend of friendsList) {
          if (!friend || !friend.pub) continue;
          const existingIndex = uniqueFriends.findIndex(
            (f) => f.pub === friend.pub
          );
          if (existingIndex >= 0) {
            uniqueFriends[existingIndex] = {
              ...uniqueFriends[existingIndex],
              ...friend,
            };
          } else {
            const friendWithBlockStatus = await updateFriendBlockStatus(friend);
            uniqueFriends.push(friendWithBlockStatus);
            processedFriends.add(friend.pub);
          }
        }

        setFriends(uniqueFriends);
        setFilteredFriends(uniqueFriends);
      }
    });

    // Monitora i cambiamenti nello stato di blocco
    const blockStatusSubscription = userBlocking
      .observeBlockStatus()
      .subscribe({
        next: ({ targetPub, isBlocked }) => {
          if (!mounted) return;
          setFriends((prev) =>
            prev.map((f) => (f.pub === targetPub ? { ...f, isBlocked } : f))
          );
        },
        error: (error) => {
          console.error("Errore nel monitoraggio stato di blocco:", error);
        },
      });

    return () => {
      console.log("Cleanup sottoscrizioni amici");
      mounted = false;
      processedFriends.clear();
      subscription.unsubscribe();
      blockStatusSubscription.unsubscribe();
    };
  }, [user?.is]);

  // Filtra gli amici in base alla ricerca
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFriends(friends);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = friends.filter((friend) => {
      if (!friend) return false;

      const displayName = friend.displayName || friend.alias || "";
      const username = friend.username || "";
      const pub = friend.pub || "";

      return (
        displayName.toLowerCase().includes(query) ||
        username.toLowerCase().includes(query) ||
        pub.toLowerCase().includes(query)
      );
    });

    setFilteredFriends(filtered);
  }, [searchQuery, friends]);

  const handleMenuToggle = (friendPub) => {
    setActiveMenu(activeMenu === friendPub ? null : friendPub);
  };

  // Renderizza le richieste di amicizia
  const renderFriendRequests = () => {
    console.log("Rendering richieste di amicizia:", {
      count: pendingRequests.length,
      requests: pendingRequests,
    });

    if (!pendingRequests || pendingRequests.length === 0) {
      console.log("Nessuna richiesta pendente");
      return null;
    }

    return (
      <div className="p-3">
        <h3 className="text-sm font-medium text-gray-300 mb-2">
          Richieste di amicizia ({pendingRequests.length})
        </h3>
        {pendingRequests.map((request) => {
          console.log("Rendering singola richiesta:", request);
          return (
            <FriendRequest
              key={request.id || `${request.from}_${request.timestamp}`}
              request={request}
              onRequestProcessed={async (from, action) => {
                console.log(`Richiesta ${action}:`, from);

                // Rimuovi la richiesta dalle pending
                setPendingRequests((prev) =>
                  prev.filter((r) => r.from !== from)
                );

                // Rimuovi la richiesta dalla Map delle richieste processate
                processedRequestsRef.current.delete(from);

                // Notifica il componente padre
                if (onRequestProcessed) {
                  onRequestProcessed(from);
                }
              }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#373B5C]">
      {/* Barra di ricerca */}
      <div className="p-3 border-b border-[#4A4F76]">
        <div className="relative">
          <input
            type="text"
            placeholder="Cerca una chat..."
            className="w-full bg-[#2D325A] text-white placeholder-gray-400 rounded-full py-2 px-4 pl-10 focus:outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <svg
            className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Lista amici con gestione migliore dello spazio */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Richieste di amicizia in sospeso */}
        {renderFriendRequests()}

        {/* Lista amici */}
        <div className="divide-y divide-[#4A4F76]">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : (searchQuery.trim() ? filteredFriends : friends).length > 0 ? (
            <div className="flex flex-col min-h-0">
              {(searchQuery.trim() ? filteredFriends : friends).map(
                (friend) =>
                  friend && (
                    <FriendItem
                      key={friend.pub}
                      friend={friend}
                      isSelected={selectedUser?.pub === friend.pub}
                      onSelect={onSelect}
                      onRemove={onRemoveFriend}
                      onBlock={onBlockUser}
                      onUnblock={onUnblockUser}
                      isActiveMenu={activeMenu === friend.pub}
                      onMenuToggle={handleMenuToggle}
                    />
                  )
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              {searchQuery ? (
                <p>Nessun amico trovato per "{searchQuery}"</p>
              ) : (
                <p>Nessun amico ancora</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
