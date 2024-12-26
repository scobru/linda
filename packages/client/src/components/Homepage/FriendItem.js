import React from "react";
import UserInfoModal from "./UserInfoModal";
import { useAppState } from "../../context/AppContext";
import { useFriends } from "../../hooks/useFriends";

const FriendItem = React.memo(({ friend, isSelected, onSelect }) => {
  const { appState } = useAppState();
  const { handleRemoveFriend, handleBlockUser, handleUnblockUser } =
    useFriends();
  const [showUserInfo, setShowUserInfo] = React.useState(false);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const isBlocked = friend.isBlocked;

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
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${
                friend.displayName || friend.alias
              }&backgroundColor=b6e3f4`}
              alt=""
            />
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-white">
              {friend.displayName || friend.alias}
            </p>
            {friend.username && (
              <p className="text-xs text-gray-300">@{friend.username}</p>
            )}
          </div>
        </div>

        {/* Menu contestuale */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
            className="p-2 hover:bg-[#5A5F86] rounded-full transition-colors"
          >
            <svg
              className="w-5 h-5 text-gray-400"
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

          {/* Menu dropdown */}
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-[#2D325A] ring-1 ring-black ring-opacity-5 z-50">
              <div
                className="py-1"
                role="menu"
                aria-orientation="vertical"
                aria-labelledby="options-menu"
              >
                {isBlocked ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnblockUser(friend);
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#4A4F76] hover:text-white transition-colors"
                  >
                    Sblocca utente
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBlockUser(friend);
                      setIsMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#4A4F76] hover:text-white transition-colors"
                  >
                    Blocca utente
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFriend(friend);
                    setIsMenuOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-[#4A4F76] hover:text-red-300 transition-colors"
                >
                  Rimuovi amico
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal info utente */}
      <UserInfoModal
        isOpen={showUserInfo}
        onClose={() => setShowUserInfo(false)}
        userInfo={friend}
      />
    </>
  );
});

export default FriendItem;
