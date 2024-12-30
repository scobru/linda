import React from "react";

const FriendItem = ({
  friend,
  selected,
  onSelect,
  onRemove,
  onBlock,
  onUnblock,
  isBlocked,
  isMobileView,
}) => {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center p-3 hover:bg-[#373B5C] cursor-pointer relative ${
        selected ? "bg-[#373B5C]" : ""
      }`}
    >
      <div className="w-14 h-14 rounded-full relative">
        <img
          src={
            friend.avatar ||
            `https://api.dicebear.com/7.x/bottts/svg?seed=${friend.displayName}&backgroundColor=b6e3f4`
          }
          alt={friend.displayName}
          className="w-full h-full rounded-full object-cover"
        />
        {friend.status === "online" && (
          <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-[#424874]"></div>
        )}
      </div>
      <div className="ml-4 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-lg font-medium text-white">
            {friend.displayName}
          </span>
          <div className="flex items-center space-x-2">
            {isBlocked ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnblock();
                }}
                className="p-1.5 hover:bg-[#4A4F76] rounded-full"
                title="Sblocca"
              >
                <svg
                  className="w-5 h-5 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                  />
                </svg>
              </button>
            ) : (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onBlock();
                  }}
                  className="p-1.5 hover:bg-[#4A4F76] rounded-full"
                  title="Blocca"
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
                      d="M12 15v2m0 0v2m0-2h2m-2 0H8m4-6V4"
                    />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                  className="p-1.5 hover:bg-[#4A4F76] rounded-full"
                  title="Rimuovi amico"
                >
                  <svg
                    className="w-5 h-5 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
        {friend.username && (
          <span className="text-sm text-gray-400">@{friend.username}</span>
        )}
        {friend.lastMessage && (
          <p className="text-sm text-gray-400 truncate mt-1">
            {friend.lastMessage}
          </p>
        )}
      </div>
    </div>
  );
};

export default FriendItem;
