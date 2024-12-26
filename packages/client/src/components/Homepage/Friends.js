import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { useAppState } from "../../context/AppContext";
import FriendItem from "./FriendItem";
import FriendRequest from "./FriendRequest";
import { useFriends } from "../../hooks/useFriends";
import { toast } from "react-hot-toast";
import { gun, DAPP_NAME } from "linda-protocol";
import { getUserUsername } from "../../utils/userUtils";

const Friends = ({
  onSelect,
  selectedUser,
  pendingRequests = [],
  loading = false,
  onRequestProcessed,
}) => {
  const { appState } = useAppState();
  const { friends, removeFriend, blockUser, unblockUser } = useFriends();
  const [searchQuery, setSearchQuery] = useState("");
  const [friendsWithNames, setFriendsWithNames] = useState([]);

  // Gestione richieste di amicizia
  const handleRequestProcessed = useCallback(
    (requestId, action) => {
      console.log(
        `Richiesta ${requestId} ${
          action === "accept" ? "accettata" : "rifiutata"
        }`
      );
      // Notifica il componente padre
      onRequestProcessed?.(requestId, action);
    },
    [onRequestProcessed]
  );

  // Carica i nomi degli amici
  useEffect(() => {
    const loadFriendsInfo = async () => {
      if (!friends) return;

      const friendsInfo = await Promise.all(
        friends.map(async (friend) => {
          try {
            const displayName = await getUserUsername(friend.pub);
            return {
              ...friend,
              displayName:
                displayName ||
                friend.nickname ||
                friend.username ||
                `${friend.pub.slice(0, 6)}...${friend.pub.slice(-4)}`,
              roomId: [friend.pub, appState.pub].sort().join("_"),
              type: "friend",
            };
          } catch (error) {
            console.warn("Errore caricamento info amico:", error);
            return {
              ...friend,
              displayName:
                friend.nickname ||
                friend.username ||
                `${friend.pub.slice(0, 6)}...${friend.pub.slice(-4)}`,
              roomId: [friend.pub, appState.pub].sort().join("_"),
              type: "friend",
            };
          }
        })
      );

      setFriendsWithNames(friendsInfo);
    };

    loadFriendsInfo();
  }, [friends, appState.pub]);

  const handleSelectFriend = useCallback(
    (friend) => {
      if (friend.isBlocked) {
        toast.error("Non puoi chattare con un utente bloccato");
        return;
      }
      onSelect(friend);
    },
    [onSelect]
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
    const searchLower = searchQuery.toLowerCase();
    return friendsWithNames.filter((friend) =>
      friend.displayName.toLowerCase().includes(searchLower)
    );
  }, [friendsWithNames, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4">
        <input
          type="text"
          placeholder="Cerca amici..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 bg-[#2D325A] border border-[#4A4F76] rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Richieste di amicizia pendenti */}
        {pendingRequests.length > 0 && (
          <div className="mb-4">
            <h3 className="px-4 py-2 text-sm font-medium text-gray-400">
              Richieste di amicizia ({pendingRequests.length})
            </h3>
            <div className="space-y-2 px-4">
              {pendingRequests.map((request) => (
                <FriendRequest
                  key={request.id}
                  request={request}
                  onRequestProcessed={handleRequestProcessed}
                />
              ))}
            </div>
          </div>
        )}

        {/* Lista amici */}
        <div>
          <h3 className="px-4 py-2 text-sm font-medium text-gray-400">
            Amici ({filteredFriends.length})
          </h3>
          {filteredFriends.length > 0 ? (
            filteredFriends.map((friend) => (
              <FriendItem
                key={friend.pub}
                friend={friend}
                isSelected={selectedUser?.pub === friend.pub}
                onSelect={() => handleSelectFriend(friend)}
                onRemove={handleRemoveFriend}
                onBlock={handleBlockUser}
                onUnblock={handleUnblockUser}
              />
            ))
          ) : (
            <div className="px-4 py-2 text-gray-400 text-sm">
              {searchQuery ? "Nessun amico trovato" : "Nessun amico"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(Friends);
