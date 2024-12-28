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
  const [isRemoving, setIsRemoving] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isUnblocking, setIsUnblocking] = useState(false);

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

  const handleRemove = async (e) => {
    e.stopPropagation();
    setIsRemoving(true);
    try {
      await onRemove(friend.pub);
    } finally {
      setIsRemoving(false);
      setShowMenu(false);
    }
  };

  const handleBlock = async (e) => {
    e.stopPropagation();
    setIsBlocking(true);
    try {
      await onBlock(friend.pub);
    } finally {
      setIsBlocking(false);
      setShowMenu(false);
    }
  };

  const handleUnblock = async (e) => {
    e.stopPropagation();
    setIsUnblocking(true);
    try {
      await onUnblock(friend.pub);
    } finally {
      setIsUnblocking(false);
      setShowMenu(false);
    }
  };

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
          disabled={isRemoving || isBlocking || isUnblocking}
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
                    onClick={handleUnblock}
                    disabled={isUnblocking}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#4A4F76] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUnblocking ? (
                      <span className="flex items-center">
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Sbloccando...
                      </span>
                    ) : (
                      "Sblocca utente"
                    )}
                  </button>
                ) : (
                  <button
                    onClick={handleBlock}
                    disabled={isBlocking}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-[#4A4F76] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBlocking ? (
                      <span className="flex items-center">
                        <svg
                          className="animate-spin -ml-1 mr-2 h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Bloccando...
                      </span>
                    ) : (
                      "Blocca utente"
                    )}
                  </button>
                )}
                <button
                  onClick={handleRemove}
                  disabled={isRemoving}
                  className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-[#4A4F76] hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRemoving ? (
                    <span className="flex items-center">
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Rimuovendo...
                    </span>
                  ) : (
                    "Rimuovi amico"
                  )}
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
