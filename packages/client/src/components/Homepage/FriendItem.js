import React from "react";

const FriendItem = ({
  friend,
  isSelected,
  onSelect,
  onRemove,
  onBlock,
  onUnblock,
  isActiveMenu,
  onMenuToggle,
}) => {
  return (
    <div
      className={`flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer ${
        isSelected ? "bg-blue-50" : ""
      }`}
      onClick={() => onSelect(friend)}
    >
      <div className="flex items-center">
        <img
          className="h-10 w-10 rounded-full"
          src={`https://api.dicebear.com/7.x/bottts/svg?seed=${
            friend.alias || friend.pub
          }&backgroundColor=b6e3f4`}
          alt=""
        />
        <div className="ml-3">
          <p className="text-sm font-medium text-gray-900">
            {friend.nickname || friend.alias || friend.pub}
          </p>
          {friend.username && (
            <p className="text-xs text-gray-500">@{friend.username}</p>
          )}
        </div>
      </div>

      {/* Menu contestuale */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenuToggle(friend.pub);
          }}
          className="p-2 hover:bg-gray-100 rounded-full"
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

        {/* Menu dropdown */}
        {isActiveMenu && (
          <div className="absolute right-0 -mt-2 w-48 bg-white rounded-md shadow-lg z-50">
            <div className="py-1 mt-4">
              <div
                className="fixed inset-0 bg-transparent"
                onClick={(e) => {
                  e.stopPropagation();
                  onMenuToggle(null);
                }}
              />
              <div className="relative z-50">
                {friend.isBlocked ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnblock(friend);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Sblocca
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onBlock(friend);
                      onMenuToggle(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Blocca
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(friend);
                    onMenuToggle(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                >
                  Rimuovi amico
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FriendItem;
