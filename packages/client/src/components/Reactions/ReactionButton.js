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
          inline-flex items-center px-1 py-0.5 rounded text-xs
          ${
            isActive
              ? "bg-blue-500 text-white"
              : "bg-[#373B5C] text-white hover:bg-[#4A4F76]"
          }
          transition-colors duration-200 cursor-pointer min-w-[24px] min-h-[20px]
        `}
      >
        <span className="text-sm leading-none">{emoji}</span>
        {count > 0 && (
          <span className="text-xs leading-none ml-0.5">{count}</span>
        )}
      </button>
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50">
        {tooltipTitle}
      </div>
    </div>
  );
};

export default ReactionButton;
