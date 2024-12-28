import React, { useState, useEffect } from "react";
import { useAppState } from "../../../context/AppContext";
import { toast } from "react-hot-toast";
import { channelsV2 } from "linda-protocol";

export default function Channels() {
  const { appState, updateAppState } = useAppState();
  const [channels, setChannels] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  console.log("Rendering Channels component", {
    channels,
    searchQuery,
    searchResults,
    isSearching,
    loading,
    showCreateModal,
  });

  // Carica i canali dell'utente
  const loadChannels = async () => {
    console.log("Loading channels...");
    try {
      await channelsV2.list((response) => {
        console.log("Channels loaded:", response);
        if (response.success) {
          // Marca tutti i canali nella lista come canali di cui siamo membri
          const channelsWithMembership = (response.channels || []).map(
            (channel) => ({
              ...channel,
              isMember: true, // Questi sono i nostri canali, quindi siamo membri
            })
          );
          setChannels(channelsWithMembership);
        } else {
          throw new Error(response.error);
        }
      });
    } catch (error) {
      console.error("Errore caricamento canali:", error);
      toast.error("Errore nel caricamento dei canali");
    } finally {
      setLoading(false);
    }
  };

  // Cerca canali pubblici
  const searchChannels = async (query) => {
    console.log("Searching channels:", query);
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      await channelsV2.search(query, (response) => {
        console.log("Search results:", response);
        if (response.success) {
          // Filtra i risultati per rimuovere i canali che sono già nella lista dei nostri canali
          const filteredResults = (response.channels || []).filter(
            (searchResult) =>
              !channels.some((myChannel) => myChannel.id === searchResult.id)
          );
          setSearchResults(filteredResults);
        } else {
          throw new Error(response.error);
        }
      });
    } catch (error) {
      console.error("Errore ricerca canali:", error);
      toast.error("Errore nella ricerca dei canali");
    }
  };

  // Gestisce la selezione di un canale
  const handleSelect = async (channel) => {
    // Se il canale è nella lista dei nostri canali, siamo già membri
    const isAlreadyMember = channels.some((c) => c.id === channel.id);

    if (isAlreadyMember) {
      console.log("Già membro del canale, accesso diretto");
      updateAppState({
        ...appState,
        selected: {
          roomId: channel.id,
          type: "channel",
          name: channel.name,
          creator: channel.creator,
        },
        currentView: "channels",
      });
      return;
    }

    // Se non è nei nostri canali, chiedi conferma per unirsi
    if (window.confirm("Vuoi unirti a questo canale?")) {
      try {
        await channelsV2.join(channel.id, (response) => {
          if (response.success) {
            toast.success("Ti sei unito al canale con successo");
            loadChannels(); // Ricarica la lista dei canali

            // Aggiorna lo stato dell'app con il nuovo canale selezionato
            updateAppState({
              ...appState,
              selected: {
                roomId: channel.id,
                type: "channel",
                name: channel.name,
                creator: channel.creator,
              },
              currentView: "channels",
            });
          } else {
            throw new Error(response.error);
          }
        });
      } catch (error) {
        console.error("Errore partecipazione al canale:", error);
        toast.error("Errore durante l'accesso al canale");
      }
    }
  };

  // Crea un nuovo canale
  const handleCreateChannel = async (channelData) => {
    try {
      await channelsV2.create(channelData, (response) => {
        if (response.success) {
          toast.success("Canale creato con successo");
          setShowCreateModal(false);
          loadChannels();
        } else {
          throw new Error(response.error);
        }
      });
    } catch (error) {
      console.error("Errore creazione canale:", error);
      toast.error(error.message || "Errore durante la creazione del canale");
    }
  };

  // Effetti
  useEffect(() => {
    loadChannels();

    // Aggiungi listener per l'evento di eliminazione canale
    const handleChannelDeleted = () => {
      console.log("Ricarico i canali dopo eliminazione");
      loadChannels();
    };

    window.addEventListener("channelDeleted", handleChannelDeleted);

    // Cleanup
    return () => {
      window.removeEventListener("channelDeleted", handleChannelDeleted);
    };
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      searchChannels(searchQuery);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Header con pulsante nuovo canale */}
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
          <span>Nuovo Canale</span>
        </button>
      </div>

      {/* Area di ricerca e lista canali */}
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
              placeholder="Cerca canali pubblici..."
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

        {/* Lista canali scrollabile */}
        <div className="overflow-y-auto h-full p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <>
              {/* Canali iscritti */}
              {!isSearching && channels.length > 0 && (
                <div>
                  <h3 className="text-white font-medium mb-2">I tuoi canali</h3>
                  <div className="space-y-2">
                    {channels.map((channel) => (
                      <div
                        key={channel.id}
                        onClick={() => handleSelect(channel)}
                        className="flex items-center space-x-3 p-3 bg-[#2D325A] rounded-lg cursor-pointer hover:bg-[#373B5C] transition-colors"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                          <span className="text-white text-lg font-semibold">
                            {channel.name?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium">
                            {channel.name}
                          </p>
                          <p className="text-sm text-gray-400">
                            {channel.members
                              ? Object.keys(channel.members).length
                              : 1}{" "}
                            membri
                          </p>
                        </div>
                        {channel.creator === appState.user.is.pub && (
                          <span className="text-xs text-blue-400 px-2 py-1 rounded-full bg-[#373B5C]">
                            Creatore
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risultati ricerca */}
              {isSearching && searchResults.length > 0 && (
                <div>
                  <h3 className="text-white font-medium mb-2">
                    Risultati ricerca
                  </h3>
                  <div className="space-y-2">
                    {searchResults.map((channel) => (
                      <div
                        key={channel.id}
                        onClick={() => handleSelect(channel)}
                        className="flex items-center space-x-3 p-3 bg-[#2D325A] rounded-lg cursor-pointer hover:bg-[#373B5C] transition-colors"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                          <span className="text-white text-lg font-semibold">
                            {channel.name?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium">
                            {channel.name}
                          </p>
                          <p className="text-sm text-gray-400">
                            {channel.members
                              ? Object.keys(channel.members).length
                              : 1}{" "}
                            membri
                            {channel.isMember && " • Iscritto"}
                          </p>
                        </div>
                        {!channel.isMember && (
                          <button
                            className="text-blue-400 hover:text-blue-300"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelect(channel);
                            }}
                          >
                            Unisciti
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nessun risultato */}
              {!loading && channels.length === 0 && !isSearching && (
                <p className="text-center text-gray-400">
                  Non sei iscritto a nessun canale
                </p>
              )}
              {isSearching && searchResults.length === 0 && (
                <p className="text-center text-gray-400">
                  Nessun canale trovato
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modale creazione canale */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-[#2D325A] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">
              Crea nuovo canale
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                handleCreateChannel({
                  name: formData.get("name"),
                  description: formData.get("description"),
                  type: formData.get("type"),
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-white mb-1">Nome del canale</label>
                <input
                  type="text"
                  name="name"
                  required
                  maxLength={50}
                  placeholder="es. Generale"
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
                  placeholder="Descrivi il canale..."
                  className="w-full px-3 py-2 bg-[#373B5C] text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-white mb-1">Tipo di canale</label>
                <select
                  name="type"
                  defaultValue="public"
                  className="w-full px-3 py-2 bg-[#373B5C] text-white rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="public">Pubblico</option>
                  <option value="private">Privato</option>
                </select>
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
                  Crea Canale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
