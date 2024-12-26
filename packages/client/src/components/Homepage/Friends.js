import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useAppState } from "../../context/AppContext";
import FriendItem from "./FriendItem";
import { useFriends } from "../../hooks/useFriends";
import { toast } from "react-hot-toast";
import { gun, DAPP_NAME, createMessagesCertificate } from "linda-protocol";
import { getUserUsername } from "../../utils/userUtils";

const Friends = ({ onSelect, selectedUser }) => {
  const { appState, currentView, setCurrentView } = useAppState();
  const { friends } = useFriends();
  const [searchQuery, setSearchQuery] = useState("");
  const [friendsWithNames, setFriendsWithNames] = useState([]);

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
    async (friend) => {
      if (!appState.pub) {
        toast.error("Errore: utente non autenticato");
        return;
      }

      try {
        const roomId = [friend.pub, appState.pub].sort().join("_");
        console.log("Selezione amico:", {
          ...friend,
          type: "friend",
          roomId,
        });

        // Verifica se esiste già il certificato
        const cert = await gun
          .get(DAPP_NAME)
          .get("certificates")
          .get(friend.pub)
          .get("messages")
          .then();

        if (!cert) {
          console.log("Creazione certificato per:", friend.pub);
          await createMessagesCertificate(friend.pub);
        }

        // Passa l'amico selezionato con le informazioni necessarie
        onSelect({
          ...friend,
          type: "friend",
          roomId,
        });
      } catch (error) {
        console.error("Errore selezione amico:", error);
        toast.error("Errore nella selezione dell'amico");
      }
    },
    [appState.pub, onSelect]
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
