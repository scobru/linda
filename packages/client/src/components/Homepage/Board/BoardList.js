import React from "react";

const BoardList = ({ boards, onSelectBoard }) => {
  return (
    <div className="p-4">
      <h2 className="text-white text-lg font-semibold mb-4">Le tue board</h2>
      <div className="space-y-2">
        {boards.map((board) => (
          <div
            key={board.roomId}
            onClick={() => onSelectBoard(board)}
            className="bg-[#2D325A] hover:bg-[#373B5C] rounded-lg p-3 cursor-pointer transition-colors duration-200"
          >
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-bold text-white">
                  {board.name?.charAt(0).toUpperCase() || "B"}
                </span>
              </div>
              <div className="ml-3 flex-grow">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-medium">
                    {board.name || "Board senza nome"}
                  </h3>
                  {board.creator === board.creator && (
                    <span className="text-xs text-blue-400 bg-[#373B5C] px-2 py-0.5 rounded-full">
                      Creatore
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400">
                  {board.members?.length || 1} membri
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BoardList;
