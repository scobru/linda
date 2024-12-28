import React, { useState, useEffect } from "react";
import { useAppState } from "../../../context/AppContext";
import { toast } from "react-hot-toast";
import { boardsV2 } from "linda-protocol";

export default function Boards() {
  const { appState, updateAppState } = useAppState();
  const [boards, setBoards] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  console.log("Rendering Boards component", {
    boards,
    searchQuery,
    searchResults,
    isSearching,
    loading,
    showCreateModal,
  });

  // Carica le board
  const loadBoards = async () => {
    console.log("Loading boards...");
    try {
      await boardsV2.list((response) => {
        console.log("Boards loaded:", response);
        if (response.success) {
          setBoards(response.boards || []);
        } else {
          throw new Error(response.error);
        }
      });
    } catch (error) {
      console.error("Errore caricamento board:", error);
      toast.error("Errore nel caricamento delle board");
    } finally {
      setLoading(false);
    }
  };

  // Cerca board
  const searchBoards = async (query) => {
    console.log("Searching boards:", query);
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      await boardsV2.search(query, (response) => {
        console.log("Search results:", response);
        if (response.success) {
          setSearchResults(response.boards || []);
        } else {
          throw new Error(response.error);
        }
      });
    } catch (error) {
      console.error("Errore ricerca board:", error);
      toast.error("Errore nella ricerca delle board");
    }
  };

  // Gestisce la selezione di una board
  const handleSelect = async (board) => {
    console.log("Selezionando board:", board);
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
      },
      currentView: "boards",
    });
  };

  // Crea una nuova board
  const handleCreateBoard = async (boardData) => {
    try {
      await boardsV2.create(boardData, (response) => {
        if (response.success) {
          toast.success("Board creata con successo");
          setShowCreateModal(false);
          loadBoards();
        } else {
          throw new Error(response.error);
        }
      });
    } catch (error) {
      console.error("Errore creazione board:", error);
      toast.error(error.message || "Errore durante la creazione della board");
    }
  };

  // Effetti
  useEffect(() => {
    loadBoards();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      searchBoards(searchQuery);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Header con pulsante nuova board */}
      <div className="p-4 bg-[#373B5C] border-b border-[#4A4F76]">
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

      {/* Area di ricerca e griglia board */}
      <div className="flex-1 overflow-hidden">
        {/* Barra di ricerca fissa */}
        <div className="sticky top-0 p-4 bg-[#424874] shadow-md z-10">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                className="h-5 w-5 text-gray-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca board..."
              className="w-full pl-10 pr-10 py-2 bg-[#2D325A] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
              >
                <svg
                  className="h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </div>
          {isSearching && (
            <div className="mt-2 text-sm text-gray-400 text-center">
              Ricerca in corso...
            </div>
          )}
        </div>

        {/* Griglia board scrollabile */}
        <div className="overflow-y-auto h-full p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <>
              {/* Board disponibili */}
              {!isSearching && boards.length > 0 && (
                <div>
                  <h3 className="text-white font-medium mb-4">
                    Boards Disponibili
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {boards.map((board) => (
                      <div
                        key={board.id}
                        onClick={() => handleSelect(board)}
                        className="bg-[#2D325A] rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all cursor-pointer hover:transform hover:scale-105"
                      >
                        <div className="h-32 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                          <span className="text-white text-4xl font-bold">
                            {board.name?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-white font-semibold text-lg">
                              {board.name}
                            </h4>
                            {board.creator === appState.user.is.pub && (
                              <span className="text-xs text-blue-400 px-2 py-1 rounded-full bg-[#373B5C]">
                                Creatore
                              </span>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm line-clamp-2">
                            {board.description || "Nessuna descrizione"}
                          </p>
                          <div className="mt-4 flex items-center text-xs text-gray-400">
                            <svg
                              className="w-4 h-4 mr-1"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            Creato il{" "}
                            {new Date(board.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risultati ricerca */}
              {isSearching && searchResults.length > 0 && (
                <div>
                  <h3 className="text-white font-medium mb-4">
                    Risultati ricerca
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {searchResults.map((board) => (
                      <div
                        key={board.id}
                        onClick={() => handleSelect(board)}
                        className="bg-[#2D325A] rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-all cursor-pointer hover:transform hover:scale-105"
                      >
                        <div className="h-32 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                          <span className="text-white text-4xl font-bold">
                            {board.name?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-white font-semibold text-lg">
                              {board.name}
                            </h4>
                          </div>
                          <p className="text-gray-400 text-sm line-clamp-2">
                            {board.description || "Nessuna descrizione"}
                          </p>
                          <div className="mt-4 flex items-center text-xs text-gray-400">
                            <svg
                              className="w-4 h-4 mr-1"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            Creato il{" "}
                            {new Date(board.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nessun risultato */}
              {!loading && boards.length === 0 && !isSearching && (
                <div className="text-center text-gray-400 mt-8">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  <p>Non ci sono board disponibili</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-4 text-blue-400 hover:text-blue-300"
                  >
                    Crea la prima board
                  </button>
                </div>
              )}
              {isSearching && searchResults.length === 0 && (
                <div className="text-center text-gray-400 mt-8">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <p>Nessuna board trovata</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modale creazione board */}
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
