import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { useAppState } from "../../../context/AppContext";
import FriendItem from "./FriendItem";
import FriendRequest from "./FriendRequest";
import { useFriends } from "../../../hooks/useFriends";
import { useFriendRequestNotifications } from "../../../hooks/useFriendRequestNotifications";
import { toast } from "react-hot-toast";
import { gun, DAPP_NAME } from "linda-protocol";
import { getUserUsername } from "../../../utils/userUtils";

const Friends = ({
  selectedUser,
  onMobileSelect,
}) => {
  const { appState, updateAppState } = useAppState();
  const { friends, removeFriend, blockUser, unblockUser } = useFriends();
  const {
    pendingRequests,
    loading: requestsLoading,
    acceptRequest,
    removeRequest,
  } = useFriendRequestNotifications();
  const [searchQuery, setSearchQuery] = useState("");
  const [friendsWithNames, setFriendsWithNames] = useState([]);
  const isMobile = window.innerWidth <= 768;

  // Gestione richieste di amicizia
  const handleRequestProcessed = useCallback(
    async (requestId, action) => {
      console.log(
        `Richiesta ${requestId} ${
          action === "accept" ? "accettata" : "rifiutata"
        }`
      );

      try {
        if (action === "accept") {
          await acceptRequest(requestId);
        } else {
          await removeRequest(requestId);
        }
      } catch (error) {
        console.error("Errore nell'elaborazione della richiesta:", error);
        toast.error("Errore nell'elaborazione della richiesta");
      }
    },
    [acceptRequest, removeRequest]
  );

  // Effetto per gestire gli aggiornamenti delle richieste pendenti
  useEffect(() => {
    console.log("Richieste pendenti aggiornate:", pendingRequests);
  }, [pendingRequests]);

  // Carica i nomi degli amici
  useEffect(() => {
    const loadFriendsInfo = async () => {
      if (!friends || !appState.user?.is?.pub) return;

      const friendsInfo = await Promise.all(
        friends.map(async (friend) => {
          try {
            const displayName = await getUserUsername(friend.pub);
            const roomId = [friend.pub, appState.user.is.pub].sort().join("_");
            return {
              ...friend,
              displayName:
                displayName ||
                friend.nickname ||
                friend.username ||
                `${friend.pub.slice(0, 6)}...${friend.pub.slice(-4)}`,
              roomId,
              type: "friend",
            };
          } catch (error) {
            console.warn("Errore caricamento info amico:", error);
            const roomId = [friend.pub, appState.user.is.pub].sort().join("_");
            return {
              ...friend,
              displayName:
                friend.nickname ||
                friend.username ||
                `${friend.pub.slice(0, 6)}...${friend.pub.slice(-4)}`,
              roomId,
              type: "friend",
            };
          }
        })
      );

      setFriendsWithNames(friendsInfo);
    };

    loadFriendsInfo();
  }, [friends, appState.user?.is?.pub]);

  const handleSelectFriend = useCallback(
    (friend) => {
      if (friend.isBlocked) {
        toast.error("Non puoi chattare con un utente bloccato");
        return;
      }

      console.log("Selezionando amico:", friend);

      // Usa il chatId come roomId se disponibile
      const roomId =
        friend.chatId || [friend.pub, appState.user.is.pub].sort().join("_");

      // Aggiorna lo stato globale
      updateAppState({
        selected: {
          ...friend,
          roomId,
        },
        currentChat: {
          ...friend,
          roomId,
        },
        activeChat: {
          id: roomId,
          type: "friend",
          name: friend.displayName,
          pub: friend.pub,
          isGroup: false,
        },
      });

      // Se siamo in modalità mobile, mostra la chat
      if (isMobile) {
        onMobileSelect?.(true);
      }
    },
    [updateAppState, isMobile, onMobileSelect, appState.user?.is?.pub]
  );

  const handleRemoveFriend = useCallback(
    async (friendPub) => {
      try {
        await removeFriend(friendPub);
        toast.success("Amico rimosso con successo");
      } catch (error) {
        console.error("Errore rimozione amico:", error);
        toast.error("Errore durante la rimozione dell'amico");
      }
    },
    [removeFriend]
  );

  const handleBlockUser = useCallback(
    async (friendPub) => {
      try {
        await blockUser(friendPub);
        toast.success("Utente bloccato con successo");
      } catch (error) {
        console.error("Errore blocco utente:", error);
        toast.error("Errore durante il blocco dell'utente");
      }
    },
    [blockUser]
  );

  const handleUnblockUser = useCallback(
    async (friendPub) => {
      try {
        await unblockUser(friendPub);
        toast.success("Utente sbloccato con successo");
      } catch (error) {
        console.error("Errore sblocco utente:", error);
        toast.error("Errore durante lo sblocco dell'utente");
      }
    },
    [unblockUser]
  );

  const filteredFriends = useMemo(() => {
    if (!searchQuery) return friendsWithNames;
    return friendsWithNames.filter((friend) =>
      friend.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [friendsWithNames, searchQuery]);

  const filteredRequests = useMemo(() => {
    if (!searchQuery) return pendingRequests;
    return pendingRequests.filter((request) =>
      request.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [pendingRequests, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4">
        <input
          type="text"
          placeholder="Cerca amici..."
          className="w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-700"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Richieste di amicizia in sospeso */}
      {!requestsLoading && filteredRequests.length > 0 && (
        <div className="mb-4">
          <h3 className="px-4 py-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
            Richieste di amicizia
          </h3>
          <div className="space-y-1">
            {filteredRequests.map((request) => (
              <FriendRequest
                key={request.id}
                request={request}
                onProcess={handleRequestProcessed}
              />
            ))}
          </div>
        </div>
      )}

      {/* Lista amici */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="px-4 py-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
          Amici
        </h3>
        <div className="space-y-1">
          {filteredFriends.map((friend) => (
            <FriendItem
              key={friend.pub}
              friend={friend}
              selected={selectedUser?.pub === friend.pub}
              onSelect={() => handleSelectFriend(friend)}
              onRemove={() => handleRemoveFriend(friend.pub)}
              onBlock={() => handleBlockUser(friend.pub)}
              onUnblock={() => handleUnblockUser(friend.pub)}
              isBlocked={friend.isBlocked}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default React.memo(Friends);
