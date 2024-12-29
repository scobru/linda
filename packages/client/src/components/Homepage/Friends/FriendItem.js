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
      className={`flex items-center p-2 ${
        isMobileView ? "px-2" : "px-3"
      } rounded-lg cursor-pointer transition-colors ${
        selected ? "bg-blue-600" : "hover:bg-[#2D325A]"
      }`}
    >
      {/* Avatar */}
      <div
        className={`${
          isMobileView ? "w-8 h-8" : "w-10 h-10"
        } rounded-full bg-[#2D325A] flex items-center justify-center mr-3 flex-shrink-0`}
      >
        {friend.avatar ? (
          <img
            src={friend.avatar}
            alt={friend.displayName}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <span
            className={`text-white ${
              isMobileView ? "text-sm" : "text-base"
            } font-semibold`}
          >
            {friend.displayName?.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3
          className={`text-white font-medium truncate ${
            isMobileView ? "text-sm" : "text-base"
          }`}
        >
          {friend.displayName}
        </h3>
        {friend.status && (
          <p
            className={`text-gray-400 truncate ${
              isMobileView ? "text-xs" : "text-sm"
            }`}
          >
            {friend.status === "online" ? "Online" : "Offline"}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-1 ml-2">
        {isBlocked ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnblock();
            }}
            className={`p-1.5 rounded-full text-red-500 hover:bg-[#4A4F76] ${
              isMobileView ? "text-sm" : "text-base"
            }`}
            title="Sblocca"
          >
            <svg
              className={`${isMobileView ? "w-4 h-4" : "w-5 h-5"}`}
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
              className={`p-1.5 rounded-full text-gray-400 hover:bg-[#4A4F76] ${
                isMobileView ? "text-sm" : "text-base"
              }`}
              title="Blocca"
            >
              <svg
                className={`${isMobileView ? "w-4 h-4" : "w-5 h-5"}`}
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
              className={`p-1.5 rounded-full text-gray-400 hover:bg-[#4A4F76] ${
                isMobileView ? "text-sm" : "text-base"
              }`}
              title="Rimuovi amico"
            >
              <svg
                className={`${isMobileView ? "w-4 h-4" : "w-5 h-5"}`}
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
  );
};

export default FriendItem;
