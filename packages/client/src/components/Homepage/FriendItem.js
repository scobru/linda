import React from "react";
import { gun, DAPP_NAME } from "linda-protocol";
import { toast } from "react-hot-toast";
import { removeFriend } from "linda-protocol";
import UserInfoModal from "./UserInfoModal";

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
          onClick={() => onSelect(friend)}
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
            <div className="ml-3 flex-1">
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
              className="p-2 hover:bg-[#4A4F76] rounded-full"
              onClick={() => onMenuToggle(friend.pub)}
            >
              <svg
                className="w-5 h-5 text-gray-300"
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
              <div className="fixed inset-x-0 bottom-0 sm:absolute sm:inset-auto sm:right-0 sm:bottom-auto sm:mt-2 w-full sm:w-48 bg-[#2D325A] rounded-t-lg sm:rounded-md shadow-lg z-50">
                <div
                  className="fixed inset-0 bg-black bg-opacity-50"
                  onClick={() => onMenuToggle(null)}
                />
                <div className="relative z-50 bg-[#2D325A] rounded-t-lg sm:rounded-md">
                  {/* Menu contestuale mobile-friendly */}
                  <div className="py-1 max-h-[calc(100vh-200px)] overflow-y-auto">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          if (
                            window.confirm(
                              "Sei sicuro di voler rimuovere questo amico?"
                            )
                          ) {
                            await removeFriend(friend.pub);
                            toast.success("Amico rimosso con successo");
                            onRemove(friend);
                            onMenuToggle(null);
                          }
                        } catch (error) {
                          console.error("Errore rimozione amico:", error);
                          toast.error(
                            error.message || "Errore durante la rimozione"
                          );
                        }
                      }}
                      className="block w-full text-left px-4 py-4 text-sm text-red-400 hover:bg-[#373B5C] border-b border-[#4A4F76]"
                    >
                      Rimuovi amico
                    </button>
                    {friend.isBlocked ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnblock(friend);
                          onMenuToggle(null);
                        }}
                        className="block w-full text-left px-4 py-4 text-sm text-blue-400 hover:bg-[#373B5C]"
                      >
                        Sblocca utente
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onBlock(friend);
                          onMenuToggle(null);
                        }}
                        className="block w-full text-left px-4 py-4 text-sm text-red-400 hover:bg-[#373B5C]"
                      >
                        Blocca utente
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
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

export default FriendItem;
