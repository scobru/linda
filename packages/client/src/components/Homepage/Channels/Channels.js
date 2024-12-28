import React, { useState } from "react";
import { useAppState } from "../../../context/AppContext";
import { useChannelsV2 } from "../../../hooks/useChannelsV2";
import { useMobileView } from "../../../hooks/useMobileView";
import { toast } from "react-hot-toast";

export default function Channels({ onSelect }) {
  const { appState } = useAppState();
  const { isMobileView } = useMobileView();
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { channels, loading, createChannel } = useChannelsV2();

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) {
      toast.error("Inserisci un nome per il canale");
      return;
    }

    try {
      await createChannel(newChannelName);
      setNewChannelName("");
      setShowCreateChannel(false);
      toast.success("Canale creato con successo");
    } catch (error) {
      console.error("Errore creazione canale:", error);
      toast.error("Errore durante la creazione del canale");
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

      {/* Channels List */}
      <div className={`flex-1 overflow-y-auto ${isMobileView ? "pb-16" : ""}`}>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="text-center p-8 text-gray-400">
            <p>Nessun canale trovato.</p>
            <p className="mt-2">
              Crea un nuovo canale usando il pulsante + in alto!
            </p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredChannels.map((channel) => (
              <div
                key={channel.id}
                onClick={() => onSelect && onSelect(channel)}
                className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                  appState.selected?.id === channel.id
                    ? "bg-blue-600"
                    : "hover:bg-[#2D325A]"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-[#2D325A] flex items-center justify-center mr-3">
                  <span className="text-white text-lg font-semibold">
                    {channel.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium truncate">
                    {channel.name}
                  </h3>
                  <p className="text-gray-400 text-sm truncate">
                    {channel.members?.length || 0} membri
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
