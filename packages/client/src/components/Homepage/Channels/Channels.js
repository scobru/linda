import React, { useState, useEffect } from "react";
import { useAppState } from "../../../context/AppContext";
import { useMobileView } from "../../../hooks/useMobileView";
import { useChannelsV2 } from "../../../hooks/useChannelsV2";
import { toast } from "react-hot-toast";

export default function Channels({ onSelect }) {
  const { appState } = useAppState();
  const { isMobileView } = useMobileView();
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { channels, loading, createChannel, error } = useChannelsV2();

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleCreateChannel = async () => {
    if (!appState.isAuthenticated) {
      toast.error("Devi essere autenticato per creare un canale");
      return;
    }

    if (!newChannelName.trim()) {
      toast.error("Inserisci un nome per il canale");
      return;
    }

    try {
      const channelData = {
        name: newChannelName.trim(),
        type: "public",
        description: "",
      };

      const success = await createChannel(channelData);
      if (success) {
        setNewChannelName("");
        setShowCreateChannel(false);
        toast.success("Canale creato con successo");
      }
    } catch (error) {
      console.error("Errore creazione canale:", error);
      toast.error(error.message || "Errore durante la creazione del canale");
    }
  };

  const filteredChannels = channels.filter((channel) =>
    channel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 bg-[#373B5C] border-b border-[#4A4F76] sticky top-0 z-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">Canali</h2>
          <button
            onClick={() => setShowCreateChannel(true)}
            className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            disabled={!appState.isAuthenticated}
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
        <div className="relative">
          <input
            type="text"
            placeholder="Cerca canali..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#2D325A] text-white placeholder-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Lista canali */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p>Nessun canale trovato</p>
            {appState.isAuthenticated && (
              <p className="mt-2">
                Crea un nuovo canale usando il pulsante + in alto!
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredChannels.map((channel) => (
              <div
                key={channel.id}
                onClick={() => onSelect(channel)}
                className="flex items-center space-x-3 p-3 rounded-lg hover:bg-[#4A4F76] cursor-pointer transition-colors"
              >
                <div className="flex-shrink-0 w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-medium text-lg">
                    {channel.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium truncate">
                    {channel.name}
                  </h3>
                  <p className="text-gray-400 text-sm truncate">
                    {Object.keys(channel.members || {}).length} membri
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#373B5C] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-white mb-4">
              Crea nuovo canale
            </h3>
            <input
              type="text"
              placeholder="Nome del canale"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              className="w-full bg-[#2D325A] text-white placeholder-gray-400 rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCreateChannel(false)}
                className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={handleCreateChannel}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Crea
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
