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
import FriendRequest from "./FriendRequest";
import UserInfoModal from "./UserInfoModal";

const { userBlocking } = blocking;
const { chat } = messaging;

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
    const [showUserInfo, setShowUserInfo] = React.useState(false);
    const isBlocked = friend.isBlocked;

    React.useEffect(() => {
      const loadUserInfo = async () => {
        try {
          // Prima cerca l'alias dell'utente
          const userData = await new Promise((resolve) => {
            gun.get(`~${friend.pub}`).once((data) => {
              resolve(data);
            });
          });

          if (userData?.alias) {
            const username = userData.alias.split(".")[0];
            setUserInfo({
              displayName: `@${username}`,
              username: username,
              nickname: "",
            });
            return;
          }

          // Se non c'è un alias, cerca nel nodo nicknames
          const nickname = await new Promise((resolve) => {
            gun
              .get(DAPP_NAME)
              .get("userList")
              .get("nicknames")
              .get(friend.pub)
              .once((nickname) => {
                resolve(nickname);
              });
          });

          if (nickname) {
            setUserInfo({
              displayName: nickname,
              username: "",
              nickname: nickname,
            });
            return;
          }

          // Se non c'è un nickname, cerca nelle info utente
          const userInfo = await new Promise((resolve) => {
            gun
              .get(DAPP_NAME)
              .get("userList")
              .get("users")
              .get(friend.pub)
              .once((userData) => {
                resolve(userData);
              });
          });

          if (userInfo?.username) {
            setUserInfo({
              displayName: `@${userInfo.username}`,
              username: userInfo.username,
              nickname: userInfo.nickname || "",
            });
            return;
          }

          // Come ultima risorsa, usa la chiave pubblica abbreviata
          setUserInfo({
            displayName: `${friend.pub.slice(0, 6)}...${friend.pub.slice(-4)}`,
            username: "",
            nickname: "",
          });
        } catch (error) {
          console.warn("Errore nel recupero info utente:", error);
          setUserInfo({
            displayName: `${friend.pub.slice(0, 6)}...${friend.pub.slice(-4)}`,
            username: "",
            nickname: "",
          });
        }
      };

      loadUserInfo();

      // Sottoscrizione ai cambiamenti dell'alias
      const unsubAlias = gun.get(`~${friend.pub}`).on((data) => {
        if (data?.alias) {
          const username = data.alias.split(".")[0];
          setUserInfo({
            displayName: `@${username}`,
            username: username,
            nickname: "",
          });
        }
      });

      // Sottoscrizione ai cambiamenti del nickname
      const unsubNickname = gun
        .get(DAPP_NAME)
        .get("userList")
        .get("nicknames")
        .get(friend.pub)
        .on((nickname) => {
          if (nickname) {
            setUserInfo({
              displayName: nickname,
              username: "",
              nickname: nickname,
            });
          }
        });

      // Sottoscrizione ai cambiamenti delle info utente
      const unsubUser = gun
        .get(DAPP_NAME)
        .get("userList")
        .get("users")
        .get(friend.pub)
        .on((data) => {
          if (data?.username) {
            setUserInfo({
              displayName: `@${data.username}`,
              username: data.username,
              nickname: data.nickname || "",
            });
          }
        });

      return () => {
        if (typeof unsubAlias === "function") unsubAlias();
        if (typeof unsubNickname === "function") unsubNickname();
        if (typeof unsubUser === "function") unsubUser();
      };
    }, [friend.pub]);

    return (
      <>
        <div
          className={`relative flex items-center p-3 hover:bg-[#4A4F76] cursor-pointer ${
            isSelected ? "bg-[#4A4F76]" : ""
          } ${isBlocked ? "opacity-50" : ""}`}
        >
          <div className="flex-1 flex items-center">
            <div
              className="flex-shrink-0 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setShowUserInfo(true);
              }}
              title="Visualizza informazioni contatto"
            >
              <img
                className="h-10 w-10 rounded-full hover:opacity-80 transition-opacity"
                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${userInfo.displayName}&backgroundColor=b6e3f4`}
                alt=""
              />
            </div>
            <div className="ml-3 flex-1" onClick={() => onSelect(friend)}>
              <p className="text-sm font-medium text-white">
                {userInfo.displayName}
              </p>
              {userInfo.username && (
                <p className="text-xs text-gray-300">@{userInfo.username}</p>
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
                {/* Overlay trasparente per gestire il click fuori */}
                <div
                  className="fixed inset-0"
                  onClick={() => onMenuToggle(null)}
                />
                {/* Contenuto del menu con z-index più alto */}
                <div className="relative z-50 bg-white rounded-md">
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
          {/* Indicatore di blocco con pulsante di sblocco */}
          {friend.isBlocked && (
            <div className="absolute top-0 right-0 m-2 flex items-center space-x-2">
              <span className="text-xs text-red-500 bg-red-100 px-2 py-1 rounded-full">
                Bloccato
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnblock(friend);
                }}
                className="text-xs text-blue-500 bg-blue-100 px-2 py-1 rounded-full hover:bg-blue-200"
              >
                Sblocca
              </button>
            </div>
          )}
        </div>

        <UserInfoModal
          isOpen={showUserInfo}
          onClose={() => setShowUserInfo(false)}
          userPub={friend.pub}
        />
      </>
    );
  }
);

export default function Friends({ onSelect, loading, selectedUser }) {
  const [friends, setFriends] = React.useState([]);
  const [pendingRequests, setPendingRequests] = React.useState([]);
  const friendsRef = React.useRef(new Map());
  const [activeMenu, setActiveMenu] = React.useState(null);
  const [blockedUsers, setBlockedUsers] = React.useState(new Set());
  const blockedUsersRef = React.useRef(new Set());
  const [isLoading, setIsLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filteredFriends, setFilteredFriends] = React.useState([]);
  const [activeTab, setActiveTab] = React.useState("chat");

  // Funzione per gestire la rimozione delle richieste processate
  const handleRequestProcessed = (fromPub) => {
    // Rimuovi immediatamente la richiesta dalla lista locale
    setPendingRequests((prev) => prev.filter((r) => r.from !== fromPub));
  };

  React.useEffect(() => {
    if (!user?.is) return;

    let mounted = true;
    const unsubscribers = new Map();

    const updateFriendData = async (friendPub) => {
      if (!mounted) return;

      // Sottoscrizione al nickname dell'amico
      const unsubNickname = gun
        .get(DAPP_NAME)
        .get("userList")
        .get("nicknames")
        .get(friendPub)
        .on((nickname) => {
          if (!mounted) return;

          setFriends((prev) =>
            prev.map((friend) => {
              if (friend.pub === friendPub) {
                return {
                  ...friend,
                  alias:
                    nickname ||
                    `${friendPub.slice(0, 6)}...${friendPub.slice(-4)}`,
                };
              }
              return friend;
            })
          );
        });

      unsubscribers.set(friendPub, unsubNickname);
    };

    // Monitora la lista amici
    const unsubFriendships = gun
      .get(DAPP_NAME)
      .get("friendships")
      .map()
      .on((friendship, id) => {
        if (!friendship || !mounted) return;

        if (
          friendship.user1 === user.is.pub ||
          friendship.user2 === user.is.pub
        ) {
          const friendPub =
            friendship.user1 === user.is.pub
              ? friendship.user2
              : friendship.user1;

          if (!friendsRef.current.has(friendPub)) {
            friendsRef.current.set(friendPub, true);

            // Aggiorna la lista amici
            setFriends((prev) => {
              const exists = prev.some((f) => f.pub === friendPub);
              if (!exists) {
                return [
                  ...prev,
                  {
                    pub: friendPub,
                    alias: `${friendPub.slice(0, 6)}...${friendPub.slice(-4)}`,
                    friendshipId: id,
                    added: friendship.created,
                    type: "friend",
                  },
                ];
              }
              return prev;
            });

            // Sottoscrivi agli aggiornamenti del nickname
            updateFriendData(friendPub);
          }
        }
      });

    return () => {
      mounted = false;
      unsubscribers.forEach((unsub) => {
        if (typeof unsub === "function") unsub();
      });
      if (typeof unsubFriendships === "function") unsubFriendships();
      friendsRef.current.clear();
    };
  }, [user?.is]);

  React.useEffect(() => {
    if (!user?.is) return;

    const unsubRequests = gun
      .get(DAPP_NAME)
      .get("all_friend_requests")
      .map()
      .on((request) => {
        if (request && request.to === user.is.pub) {
          setPendingRequests((prev) => {
            const exists = prev.some((r) => r.from === request.from);
            if (!exists) {
              return [...prev, request];
            }
            return prev;
          });
        }
      });

    return () => {
      if (typeof unsubRequests === "function") {
        unsubRequests();
      }
    };
  }, []);

  React.useEffect(() => {
    let isSubscribed = true;

    const loadBlockedUsers = async () => {
      try {
        // Usa Promise.allSettled invece di Promise.all per gestire meglio gli errori
        const [blockedListResult, blockedChatsResult] =
          await Promise.allSettled([
            userBlocking.getBlockedUsers(),
            chat.getBlockedChats(),
          ]);

        if (!isSubscribed) return;

        const blockedList =
          blockedListResult.status === "fulfilled"
            ? blockedListResult.value
            : [];
        const blockedChats =
          blockedChatsResult.status === "fulfilled"
            ? blockedChatsResult.value
            : [];

        const blockedSet = new Set(blockedList.map((user) => user.pub));
        setBlockedUsers(blockedSet);
        blockedUsersRef.current = blockedSet;

        // Aggiorna la lista amici per riflettere lo stato di blocco
        setFriends((prev) =>
          prev.map((friend) => {
            const chatId = [user.is.pub, friend.pub].sort().join("_");
            const isChatBlocked = blockedChats.includes(chatId);

            return {
              ...friend,
              isBlocked: blockedSet.has(friend.pub),
              canChat: !blockedSet.has(friend.pub) && !isChatBlocked,
            };
          })
        );
      } catch (error) {
        console.error("Error loading blocked users:", error);
      }
    };

    loadBlockedUsers();

    // Ascolta gli eventi di cambio stato utente
    const handleUserStatusChange = async (event) => {
      const { type, userPub } = event.detail;

      if (type === "block") {
        setBlockedUsers((prev) => {
          const newSet = new Set(prev);
          newSet.add(userPub);
          blockedUsersRef.current = newSet;
          return newSet;
        });

        setFriends((prev) =>
          prev.map((friend) =>
            friend.pub === userPub ? { ...friend, isBlocked: true } : friend
          )
        );
      } else if (type === "unblock") {
        setBlockedUsers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(userPub);
          blockedUsersRef.current = newSet;
          return newSet;
        });

        setFriends((prev) =>
          prev.map((friend) =>
            friend.pub === userPub ? { ...friend, isBlocked: false } : friend
          )
        );
      }
    };

    window.addEventListener("userStatusChanged", handleUserStatusChange);

    return () => {
      isSubscribed = false;
      window.removeEventListener("userStatusChanged", handleUserStatusChange);
    };
  }, [setFriends]);

  const handleRemoveFriend = async (friend) => {
    try {
      if (window.confirm("Sei sicuro di voler rimuovere questo amico?")) {
        await removeFriend(friend.pub);
        toast.success("Amico rimosso con successo");
        // La lista amici si aggiornerà automaticamente tramite le sottoscrizioni
      }
    } catch (error) {
      console.error("Errore rimozione amico:", error);
      toast.error("Errore durante la rimozione");
    }
  };

  const handleUnblock = async (friend) => {
    try {
      // Sblocca l'utente
      const unblockResult = await userBlocking.unblockUser(friend.pub);
      if (!unblockResult.success) {
        throw new Error(unblockResult.message);
      }

      // Sblocca anche la chat
      const chatId = [user.is.pub, friend.pub].sort().join("_");
      await chat.unblockChat(chatId);

      // Aggiorna lo stato locale
      setFriends((prev) =>
        prev.map((f) => (f.pub === friend.pub ? { ...f, isBlocked: false } : f))
      );

      toast.success(`${friend.alias} è stato sbloccato`);
      setActiveMenu(null);
    } catch (error) {
      console.error("Error unblocking user:", error);
      toast.error("Errore durante lo sblocco dell'utente");
    }
  };

  const handleSendTip = async (friendPub, amount) => {
    try {
      setIsLoading(true);

      // Usa sempre il wallet interno per i tip
      const tx = await walletService.sendTip(friendPub, amount);

      toast.success("Tip inviato con successo!");

      // Aggiorna la UI se necessario
      // ...
    } catch (error) {
      console.error("Error sending tip:", error);
      toast.error("Errore nell'invio del tip");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMenuToggle = (friendPub) => {
    setActiveMenu(activeMenu === friendPub ? null : friendPub);
  };

  const handleBlock = async (friend) => {
    try {
      const result = await userBlocking.blockUser(friend.pub);
      if (result.success) {
        toast.success(`${friend.alias} è stato bloccato`);
        // Aggiorna lo stato locale
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
  };

  // Aggiungi questo effetto per gestire la ricerca
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFriends(friends);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = friends.filter(
      (friend) =>
        friend.alias?.toLowerCase().includes(query) ||
        friend.pub?.toLowerCase().includes(query)
    );
    setFilteredFriends(filtered);
  }, [searchQuery, friends]);

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

      {/* Lista amici */}
      <div className="flex-1 overflow-y-auto">
        {/* Richieste di amicizia in sospeso */}
        {pendingRequests.length > 0 && (
          <div className="p-3 border-b border-[#4A4F76]">
            <h3 className="text-sm font-medium text-gray-300 mb-2">
              Richieste di amicizia
            </h3>
            {pendingRequests.map((request) => (
              <FriendRequest
                key={request.from}
                request={request}
                onAccept={handleAcceptRequest}
                onReject={handleRejectRequest}
              />
            ))}
          </div>
        )}

        {/* Lista amici */}
        <div className="divide-y divide-[#4A4F76]">
          {(searchQuery ? filteredFriends : friends).map((friend) => (
            <FriendItem
              key={friend.pub}
              friend={friend}
              isSelected={selectedUser?.pub === friend.pub}
              onSelect={onSelect}
              onRemove={handleRemoveFriend}
              onBlock={handleBlock}
              onUnblock={handleUnblock}
              isActiveMenu={activeMenu === friend.pub}
              onMenuToggle={handleMenuToggle}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
