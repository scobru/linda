import React from "react";

const BoardView = ({ board, onBack, isMobileView }) => {
  return (
    <div className="flex flex-col h-full bg-[#1E2142]">
      {/* Header */}
      <div className="bg-[#1E2142] border-b border-[#4A4F76] p-4 flex items-center">
        {isMobileView && (
          <button
            onClick={onBack}
            className="mr-3 text-gray-400 hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        )}
        <h2 className="text-white text-lg font-medium">
          {board.name || "Board"}
        </h2>
      </div>

      {/* Board Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Qui inseriremo il contenuto della board */}
        <div className="bg-[#2D325A] rounded-lg p-4">
          <p className="text-gray-300">ID Board: {board.id}</p>
          {/* Aggiungi qui altri dettagli della board */}
        </div>
      </div>
    </div>
  );
};

export default BoardView;
