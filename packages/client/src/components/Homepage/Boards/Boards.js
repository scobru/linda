import React, { useState, useEffect } from "react";
import { useAppState } from "../../../context/AppContext";
import { toast } from "react-hot-toast";
import { useBoardsV2 } from "../../../hooks/useBoardsV2";
import { useMobileView } from "../../../hooks/useMobileView";

export default function Boards({ onSelect }) {
  const { appState, updateAppState } = useAppState();
  const { isMobileView } = useMobileView();
  const {
    boards,
    loading: boardsLoading,
    joinBoard,
    leaveBoard,
    createBoard,
    searchBoards,
    loadBoards,
  } = useBoardsV2();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (query) => {
    setIsSearching(true);
    try {
      const results = await searchBoards(query);
      setSearchResults(results || []);
    } catch (error) {
      console.error("Errore ricerca board:", error);
      toast.error("Errore nella ricerca delle board");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = async (board) => {
    if (onSelect) {
      onSelect(board);
    }
    updateAppState({
      ...appState,
      selected: {
        roomId: board.id,
        type: "board",
        name: board.name,
        creator: board.creator,
        isBoard: true,
        admins: board.admins || {},
        description: board.description,
        members: board.members || [],
        canWrite: true,
        isMember: true,
      },
      currentView: "boards",
    });
  };

  const handleLeaveBoard = async (boardId) => {
    try {
      await leaveBoard(boardId);
      if (appState.selected?.roomId === boardId) {
        updateAppState({
          ...appState,
          selected: null,
        });
      }
    } catch (error) {
      console.error("Errore nell'uscita dalla board:", error);
    }
  };

  const handleCreateBoard = async (boardData) => {
    try {
      await createBoard(boardData);
      setShowCreateModal(false);
    } catch (error) {
      console.error("Errore creazione board:", error);
    }
  };

  const handleJoinBoard = async (board) => {
    try {
      await joinBoard(board.id);
      handleSelect(board);
    } catch (error) {
      console.error("Errore nell'unirsi alla board:", error);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 bg-[#373B5C] border-b border-[#4A4F76] sticky top-0 z-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">Board</h2>
          <div className="flex items-center space-x-2">
            {appState.selected && appState.selected.type === "board" && (
              <button
                onClick={() => handleLeaveBoard(appState.selected.roomId)}
                className="p-2 rounded-full text-white hover:bg-[#4A4F76] transition-colors"
                title="Lascia board"
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
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
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
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value.trim()) {
                handleSearch(e.target.value);
              } else {
                setSearchResults([]);
              }
            }}
            placeholder="Cerca board..."
            className="w-full bg-[#2D325A] text-white placeholder-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Board List */}
      <div className={`flex-1 overflow-y-auto ${isMobileView ? "pb-0" : ""}`}>
        {boardsLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : searchQuery ? (
          isSearching ? (
            <div className="text-center text-gray-400 py-4">
              Ricerca in corso...
            </div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-1 p-2">
              {searchResults.map((board) => (
                <div
                  key={board.id}
                  onClick={() => handleSelect(board)}
                  className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                    appState.selected?.roomId === board.id
                      ? "bg-blue-600"
                      : "hover:bg-[#2D325A]"
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[#2D325A] flex items-center justify-center mr-3">
                    <span className="text-white text-lg font-semibold">
                      {board.name?.charAt(0).toUpperCase() || "B"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate">
                      {board.name || "Board senza nome"}
                    </h3>
                    <p className="text-gray-400 text-sm truncate">
                      {board.members?.length || 0} membri
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-4">
              Nessuna board trovata
            </div>
          )
        ) : boards.length > 0 ? (
          <div className="space-y-1 p-2">
            {boards.map((board) => (
              <div
                key={board.id}
                onClick={() => handleSelect(board)}
                className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                  appState.selected?.roomId === board.id
                    ? "bg-blue-600"
                    : "hover:bg-[#2D325A]"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-[#2D325A] flex items-center justify-center mr-3">
                  <span className="text-white text-lg font-semibold">
                    {board.name?.charAt(0).toUpperCase() || "B"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium truncate">
                    {board.name || "Board senza nome"}
                  </h3>
                  <p className="text-gray-400 text-sm truncate">
                    {board.members?.length || 0} membri
                  </p>
                </div>
                {board.creator !== appState.user.is.pub && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLeaveBoard(board.id);
                    }}
                    className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-[#4A4F76] transition-colors"
                    title="Lascia board"
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
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-8">
            <p>Non ci sono board disponibili</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 text-blue-400 hover:text-blue-300"
            >
              Crea la prima board
            </button>
          </div>
        )}
      </div>

      {/* Create Board Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-[#373B5C] rounded-lg p-6 w-full max-w-md m-auto">
            <h3 className="text-xl font-semibold text-white mb-6">
              Crea nuova board
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                handleCreateBoard({
                  name: formData.get("name"),
                  description: formData.get("description"),
                });
              }}
              className="space-y-6"
            >
              <div>
                <label className="block text-white mb-2">
                  Nome della board
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  maxLength={50}
                  placeholder="es. Annunci"
                  className="w-full px-4 py-3 bg-[#2D325A] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-white mb-2">
                  Descrizione (opzionale)
                </label>
                <textarea
                  name="description"
                  maxLength={200}
                  rows={4}
                  placeholder="Descrivi la board..."
                  className="w-full px-4 py-3 bg-[#2D325A] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-2.5 text-white rounded-lg hover:bg-[#4A4F76] transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Crea Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
