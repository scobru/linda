import React, { useState, useEffect } from "react";
import { getUserAvatar } from "../../../utils/userUtils";

const FriendItem = ({
  friend,
  isSelected,
  onSelect,
  onRemove,
  onBlock,
  onUnblock,
}) => {
  const [avatar, setAvatar] = useState(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const avatarUrl = await getUserAvatar(friend.pub);
        setAvatar(avatarUrl);
      } catch (error) {
        console.warn("Errore caricamento avatar:", error);
      }
    };

    loadAvatar();
  }, [friend.pub]);

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-[#2D325A] ${
        isSelected ? "bg-[#2D325A]" : ""
      } ${friend.isBlocked ? "opacity-50" : ""}`}
      onClick={onSelect}
    >
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-full flex-shrink-0">
          {avatar ? (
            <img
              src={avatar}
              alt={friend.displayName}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <img
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${friend.displayName}&backgroundColor=b6e3f4`}
              alt={friend.displayName}
              className="w-full h-full rounded-full"
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium truncate">
            {friend.displayName}
          </p>
          {friend.isBlocked && <p className="text-xs text-red-400">Bloccato</p>}
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 text-gray-400 hover:text-gray-300 transition-colors relative"
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
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
          {showMenu && (
            <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-[#2D325A] ring-1 ring-black ring-opacity-5 z-50">
              <div className="py-1" role="menu">
                {friend.isBlocked ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnblock(friend.pub);
                      setShowMenu(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#4A4F76] hover:text-white"
                  >
                    Sblocca utente
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onBlock(friend.pub);
                      setShowMenu(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#4A4F76] hover:text-white"
                  >
                    Blocca utente
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(friend.pub);
                    setShowMenu(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-[#4A4F76] hover:text-red-300"
                >
                  Rimuovi amico
                </button>
              </div>
            </div>
          )}
        </button>
      </div>
    </div>
  );
};

export default React.memo(FriendItem);
