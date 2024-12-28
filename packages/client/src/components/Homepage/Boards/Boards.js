import React, { useState, useEffect } from "react";
import { useAppState } from "../../../context/AppContext";
import { toast } from "react-hot-toast";
import { useBoardsV2 } from "../../../hooks/useBoardsV2";

export default function Boards() {
  const { appState, updateAppState } = useAppState();
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

  // Funzione di utilità per verificare se un utente è membro di una board
  const isMemberOfBoard = (board, userId) => {
    if (!board.members) return false;
    if (Array.isArray(board.members)) return board.members.includes(userId);
    if (typeof board.members === "object") return userId in board.members;
    return false;
  };

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

  useEffect(() => {
    const handleBoardLeave = (event) => {
      if (event.detail?.boardId) {
        handleLeaveBoard(event.detail.boardId);
      }
    };

    window.addEventListener("boardLeave", handleBoardLeave);
    return () => window.removeEventListener("boardLeave", handleBoardLeave);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 space-y-2">
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
            className="w-full px-4 py-2 bg-[#2D325A] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
              }}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2"
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
          <span>Nuova Board</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 px-2">
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
              searchResults.map((board) => {
                const isMember = isMemberOfBoard(board, appState.user.is.pub);
                return (
                  <div
                    key={board.id}
                    className="flex items-center space-x-3 p-2 rounded-md hover:bg-[#373B5C] group"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-white">
                        {board.name?.charAt(0).toUpperCase() || "B"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-white text-sm font-medium truncate">
                          {board.name || "Board senza nome"}
                        </h3>
                        <div className="flex items-center space-x-2">
                          {board.creator === appState.user.is.pub && (
                            <span className="text-xs text-blue-400 bg-[#2D325A] px-2 py-0.5 rounded-full">
                              Creatore
                            </span>
                          )}
                          {!isMember && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleJoinBoard(board);
                              }}
                              className="text-xs text-white bg-blue-500 px-2 py-0.5 rounded-full hover:bg-blue-600 transition-colors"
                            >
                              Unisciti
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-400 truncate">
                        {board.description || "Nessuna descrizione"}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-gray-400 py-4">
                Nessuna board trovata
              </div>
            )
          ) : boards.length > 0 ? (
            boards.map((board) => (
              <div
                key={board.id}
                onClick={() => handleSelect(board)}
                className="flex items-center space-x-3 p-2 rounded-md hover:bg-[#373B5C] cursor-pointer group"
              >
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-white">
                    {board.name?.charAt(0).toUpperCase() || "B"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-white text-sm font-medium truncate">
                      {board.name || "Board senza nome"}
                    </h3>
                    {board.creator === appState.user.is.pub && (
                      <span className="text-xs text-blue-400 bg-[#2D325A] px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100">
                        Creatore
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-400 mt-8">
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
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#2D325A] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">
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
              className="space-y-4"
            >
              <div>
                <label className="block text-white mb-1">
                  Nome della board
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  maxLength={50}
                  placeholder="es. Annunci"
                  className="w-full px-3 py-2 bg-[#373B5C] text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-white mb-1">
                  Descrizione (opzionale)
                </label>
                <textarea
                  name="description"
                  maxLength={200}
                  rows={3}
                  placeholder="Descrivi la board..."
                  className="w-full px-3 py-2 bg-[#373B5C] text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-white rounded hover:bg-[#4A4F76] transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
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
