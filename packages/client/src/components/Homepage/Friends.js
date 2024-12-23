import React from "react";
import { gun, user, DAPP_NAME, blocking, messaging } from "linda-protocol";
import { userUtils } from "linda-protocol";
import {
  removeFriend,
  acceptFriendRequest,
  rejectFriendRequest,
} from "linda-protocol";
import { toast } from "react-hot-toast";
import { walletService } from "linda-protocol";

const { userBlocking } = blocking;
const { chat } = messaging;

// Componente per la richiesta di amicizia
const FriendRequest = ({ request, onRequestProcessed }) => {
  const [userInfo, setUserInfo] = React.useState({
    displayName: "Caricamento...",
    username: "",
    nickname: "",
  });
  const [isProcessing, setIsProcessing] = React.useState(false);

  React.useEffect(() => {
    const loadUserInfo = async () => {
      const info = await userUtils.getUserInfo(request.from);
      setUserInfo(info);
    };
    loadUserInfo();
  }, [request.from]);

  const handleAccept = async () => {
    try {
      setIsProcessing(true);
      const result = await acceptFriendRequest(request);

      if (result.success) {
        // Rimuovi immediatamente la richiesta dall'UI
        onRequestProcessed(request.from);

        // Rimuovi la richiesta da Gun
        gun
          .get(DAPP_NAME)
          .get("all_friend_requests")
          .map()
          .once((data, key) => {
            if (data && data.from === request.from) {
              gun.get(DAPP_NAME).get("all_friend_requests").get(key).put(null);
            }
          });

        gun
          .get(DAPP_NAME)
          .get("friend_requests")
          .get(user.is.pub)
          .map()
          .once((data, key) => {
            if (data && data.from === request.from) {
              gun
                .get(DAPP_NAME)
                .get("friend_requests")
                .get(user.is.pub)
                .get(key)
                .put(null);
            }
          });

        toast.success("Richiesta di amicizia accettata");
      }
    } catch (error) {
      console.error("Errore accettazione richiesta:", error);
      toast.error("Errore nell'accettare la richiesta");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    try {
      setIsProcessing(true);
      await rejectFriendRequest(request);

      // Rimuovi immediatamente la richiesta dall'UI
      onRequestProcessed(request.from);

      // Rimuovi la richiesta da Gun
      gun
        .get(DAPP_NAME)
        .get("all_friend_requests")
        .map()
        .once((data, key) => {
          if (data && data.from === request.from) {
            gun.get(DAPP_NAME).get("all_friend_requests").get(key).put(null);
          }
        });

      gun
        .get(DAPP_NAME)
        .get("friend_requests")
        .get(user.is.pub)
        .map()
        .once((data, key) => {
          if (data && data.from === request.from) {
            gun
              .get(DAPP_NAME)
              .get("friend_requests")
              .get(user.is.pub)
              .get(key)
              .put(null);
          }
        });

      toast.success("Richiesta di amicizia rifiutata");
    } catch (error) {
      console.error("Errore rifiuto richiesta:", error);
      toast.error("Errore nel rifiutare la richiesta");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm mb-2">
      <div className="flex items-center">
        <img
          className="h-10 w-10 rounded-full"
          src={`https://api.dicebear.com/7.x/bottts/svg?seed=${userInfo.displayName}&backgroundColor=b6e3f4`}
          alt=""
        />
        <div className="ml-3">
          <p className="text-sm font-medium text-gray-900">
            {userInfo.displayName}
          </p>
          {userInfo.username && (
            <p className="text-xs text-gray-500">@{userInfo.username}</p>
          )}
        </div>
      </div>
      <div className="flex space-x-2">
        <button
          onClick={handleAccept}
          disabled={isProcessing}
          className={`px-3 py-1 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600 
            ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isProcessing ? "In corso..." : "Accetta"}
        </button>
        <button
          onClick={handleReject}
          disabled={isProcessing}
          className={`px-3 py-1 text-sm font-medium text-white bg-red-500 rounded hover:bg-red-600
            ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Rifiuta
        </button>
      </div>
    </div>
  );
};

const FriendItem = React.memo(
  ({
    friend,
    isSelected,
    onSelect,
    onRemove,
    onBlock,
    onUnblock,
    isActiveMenu,
    onMenuToggle,
  }) => {
    const [userInfo, setUserInfo] = React.useState({
      displayName: friend.alias || "Caricamento...",
      username: "",
      nickname: "",
    });
    const isBlocked = friend.isBlocked;

    React.useEffect(() => {
      const loadUserInfo = async () => {
        const info = await userUtils.getUserInfo(friend.pub);
        setUserInfo(info);
      };

      loadUserInfo();

      // Sottoscrizione diretta al nodo dell'utente
      const unsub = gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .get(friend.pub)
        .on((data) => {
          if (data) {
            setUserInfo({
              displayName: data.nickname || data.username || friend.alias,
              username: data.username || "",
              nickname: data.nickname || "",
            });
          }
        });

      return () => {
        if (typeof unsub === "function") unsub();
      };
    }, [friend.pub, friend.alias]);

    return (
      <div
        className={`relative flex items-center p-3 hover:bg-gray-50 cursor-pointer ${
          isSelected ? "bg-blue-50" : ""
        } ${isBlocked ? "opacity-50" : ""}`}
      >
        <div
          className="flex-1 flex items-center"
          onClick={() => onSelect(friend)}
        >
          <div className="flex-shrink-0">
            <img
              className="h-10 w-10 rounded-full"
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${userInfo.displayName}&backgroundColor=b6e3f4`}
              alt=""
            />
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {userInfo.displayName}
            </p>
            {userInfo.username && (
              <p className="text-xs text-gray-500">@{userInfo.username}</p>
            )}
          </div>
        </div>

        {/* Menu contestuale */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            className="p-2 hover:bg-gray-100 rounded-full"
            onClick={() => onMenuToggle(friend.pub)}
          >
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
          </button>

          {isActiveMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-50">
              <div className="py-1">
                <button
                  onClick={() => {
                    onRemove(friend);
                    onMenuToggle(null);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Rimuovi amico
                </button>
                {friend.isBlocked ? (
                  <button
                    onClick={() => {
                      onUnblock(friend);
                      onMenuToggle(null);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
                  >
                    Sblocca utente
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onBlock(friend);
                      onMenuToggle(null);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Blocca utente
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Indicatore di blocco */}
        {isBlocked && (
          <div className="absolute top-0 right-0 m-2">
            <span className="text-xs text-red-500 bg-red-100 px-2 py-1 rounded-full">
              Bloccato
            </span>
          </div>
        )}
      </div>
    );
  }
);

export default function Friends({
  onSelect,
  pendingRequests,
  loading,
  selectedUser,
  setPendingRequests,
}) {
  const [friends, setFriends] = React.useState([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeMenu, setActiveMenu] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // Filter friends based on search query
  const filteredFriends = React.useMemo(() => {
    if (!searchQuery.trim()) return friends;

    return friends.filter((friend) => {
      const searchLower = searchQuery.toLowerCase();
      const alias = (friend.alias || "").toLowerCase();
      const username = (friend.username || "").toLowerCase();
      const nickname = (friend.nickname || "").toLowerCase();

      return (
        alias.includes(searchLower) ||
        username.includes(searchLower) ||
        nickname.includes(searchLower)
      );
    });
  }, [friends, searchQuery]);

  // Load friends
  React.useEffect(() => {
    if (!user?.is) return;

    let mounted = true;
    const loadFriends = async () => {
      try {
        setIsLoading(true);
        const friendsList = await userUtils.getFriends();
        if (mounted) {
          setFriends(friendsList);
        }
      } catch (error) {
        console.error("Error loading friends:", error);
        toast.error("Error loading friends list");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadFriends();
    return () => {
      mounted = false;
    };
  }, [user?.is]);

  // Monitor friends status
  React.useEffect(() => {
    if (!user?.is) return;

    const unsubscribe = gun
      .get(DAPP_NAME)
      .get("userList")
      .get("users")
      .map()
      .on((userData, key) => {
        if (!userData || !userData.pub) return;

        setFriends((prev) => {
          const index = prev.findIndex((f) => f.pub === userData.pub);
          if (index === -1) return prev;

          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            alias:
              userData.nickname || userData.username || updated[index].alias,
            username: userData.username,
            nickname: userData.nickname,
            lastSeen: userData.lastSeen,
          };
          return updated;
        });
      });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [user?.is]);

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-4 border-b">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search friends..."
            className="w-full px-4 py-2 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </span>
        </div>
      </div>

      {/* Friend requests section */}
      {pendingRequests.length > 0 && (
        <div className="p-4 border-b">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Friend Requests ({pendingRequests.length})
          </h3>
          <div className="space-y-2">
            {pendingRequests.map((request) => (
              <FriendRequest
                key={request.pub}
                request={request}
                onRequestProcessed={(pub) =>
                  setPendingRequests((prev) =>
                    prev.filter((r) => r.pub !== pub)
                  )
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Friends list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : filteredFriends.length > 0 ? (
          filteredFriends.map((friend) => (
            <FriendItem
              key={friend.pub}
              friend={friend}
              isSelected={selectedUser?.pub === friend.pub}
              onSelect={onSelect}
              onRemove={async () => {
                try {
                  await removeFriend(friend.pub);
                  setFriends((prev) =>
                    prev.filter((f) => f.pub !== friend.pub)
                  );
                  toast.success("Friend removed");
                } catch (error) {
                  console.error("Error removing friend:", error);
                  toast.error("Error removing friend");
                }
              }}
              onBlock={async () => {
                try {
                  await userBlocking.blockUser(friend.pub);
                  setFriends((prev) =>
                    prev.map((f) =>
                      f.pub === friend.pub ? { ...f, isBlocked: true } : f
                    )
                  );
                  toast.success("User blocked");
                } catch (error) {
                  console.error("Error blocking user:", error);
                  toast.error("Error blocking user");
                }
              }}
              onUnblock={async () => {
                try {
                  await userBlocking.unblockUser(friend.pub);
                  setFriends((prev) =>
                    prev.map((f) =>
                      f.pub === friend.pub ? { ...f, isBlocked: false } : f
                    )
                  );
                  toast.success("User unblocked");
                } catch (error) {
                  console.error("Error unblocking user:", error);
                  toast.error("Error unblocking user");
                }
              }}
              isActiveMenu={activeMenu === friend.pub}
              onMenuToggle={(pub) =>
                setActiveMenu(activeMenu === pub ? null : pub)
              }
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            {searchQuery ? (
              <p>No friends found matching "{searchQuery}"</p>
            ) : (
              <p>No friends yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
