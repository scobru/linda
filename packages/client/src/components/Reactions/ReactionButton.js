import React from "react";

const ReactionButton = ({
  emoji,
  count,
  isActive,
  onClick,
  usernames = [],
}) => {
  const tooltipTitle =
    usernames.length > 0 ? usernames.join(", ") : "Nessuna reazione";

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`
          inline-flex items-center px-3 py-2 rounded-lg text-sm min-w-[48px] min-h-[36px]
          ${
            isActive
              ? "bg-blue-500 text-white"
              : "bg-[#2D325A] text-white hover:bg-[#373B5C]"
          }
          transition-colors duration-200 shadow-sm cursor-pointer
        `}
      >
        <span className="text-lg">{emoji}</span>
        {count > 0 && <span className="text-sm ml-2 font-medium">{count}</span>}
      </button>
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
        {tooltipTitle}
      </div>
    </div>
  );
};

export default ReactionButton;
