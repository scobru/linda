import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useAppState } from "../../../context/AppContext";
import FriendItem from "./FriendItem";
import FriendRequest from "./FriendRequest";
import { useFriends } from "../../../hooks/useFriends";
import { useFriendRequestNotifications } from "../../../hooks/useFriendRequestNotifications";
import { toast } from "react-hot-toast";
import { gun, DAPP_NAME } from "#protocol";
import { getUserUsername } from "../../../utils/userUtils";
import { useMobileView } from "../../../hooks/useMobileView";

const Friends = ({ onSelect }) => {
  const { appState, updateAppState } = useAppState();
  const { isMobileView } = useMobileView();
  const { friends, removeFriend, blockUser, unblockUser } = useFriends();
  const {
    pendingRequests,
    loading: requestsLoading,
    acceptRequest,
    removeRequest,
  } = useFriendRequestNotifications();
  const [searchQuery, setSearchQuery] = useState("");
  const [friendsWithNames, setFriendsWithNames] = useState([]);

  // Gestione richieste di amicizia
  const handleRequestProcessed = useCallback(
    async (requestId, action) => {
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

  // Carica i nomi degli amici
  useEffect(() => {
    const loadFriendsInfo = async () => {
      if (!friends || !appState.user?.is?.pub) return;

      const activeFriends = friends.filter((friend) => {
        if (!friend || friend.status === "removed" || !friend.pub) {
          return false;
        }
        return true;
      });

      const friendsInfo = await Promise.all(
        activeFriends.map(async (friend) => {
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

      const roomId = [friend.pub, appState.user.is.pub].sort().join("_");

      // Aggiorna lo stato globale
      updateAppState({
        ...appState,
        selected: {
          ...friend,
          roomId,
          type: "friend",
        },
        currentChat: {
          ...friend,
          roomId,
        },
      });

      // Chiama onSelect per la versione mobile
      if (isMobileView && onSelect) {
        onSelect(friend);
      }
    },
    [updateAppState, appState, isMobileView, onSelect]
  );

  const handleRemoveFriend = useCallback(
    async (friendPub) => {
      try {
        await removeFriend(friendPub);
        setFriendsWithNames((prev) =>
          prev.filter((friend) => friend.pub !== friendPub)
        );

        if (appState.selected?.pub === friendPub) {
          updateAppState({
            ...appState,
            selected: null,
            currentChat: null,
          });
        }

        toast.success("Amico rimosso con successo");
      } catch (error) {
        console.error("Errore rimozione amico:", error);
        toast.error("Errore durante la rimozione dell'amico");
      }
    },
    [removeFriend, appState, updateAppState]
  );

  const filteredFriends = useMemo(() => {
    if (!searchQuery) return friendsWithNames;
    return friendsWithNames.filter((friend) =>
      friend.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [friendsWithNames, searchQuery]);

  return (
    <div className="h-full flex flex-col bg-[#1E2142]">
      {/* Header con barra di ricerca */}
      <div className="sticky top-0 z-20 bg-[#1E2142] shadow-md">
        <div className="p-2">
          <input
            type="text"
            placeholder="Cerca amici..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#2D325A] text-white text-sm placeholder-gray-400 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Friend Requests */}
      {!requestsLoading && pendingRequests.length > 0 && (
        <div className="px-2 py-1 border-b border-[#4A4F76]">
          <h3 className="text-xs font-medium text-gray-400 mb-1">
            Richieste di amicizia ({pendingRequests.length})
          </h3>
          <div className="space-y-1">
            {pendingRequests.map((request) => (
              <FriendRequest
                key={request.id}
                request={request}
                onProcess={handleRequestProcessed}
              />
            ))}
          </div>
        </div>
      )}

      {/* Friends List */}
      <div className="flex-1 overflow-y-auto">
        {filteredFriends.length === 0 ? (
          <div className="text-center p-4 text-gray-400 text-sm">
            <p>Nessun amico trovato</p>
          </div>
        ) : (
          <div className="space-y-0.5 p-1">
            {filteredFriends.map((friend) => (
              <FriendItem
                key={friend.pub}
                friend={friend}
                selected={appState.selected?.pub === friend.pub}
                onSelect={() => handleSelectFriend(friend)}
                onRemove={() => handleRemoveFriend(friend.pub)}
                onBlock={() => blockUser(friend.pub)}
                onUnblock={() => unblockUser(friend.pub)}
                isBlocked={friend.isBlocked}
                isMobileView={isMobileView}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Friends;
