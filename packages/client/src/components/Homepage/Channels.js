import React, { useState } from "react";
import { useChannelsV2 } from "../../hooks/useChannelsV2";
import { useAppState } from "../../context/AppContext";
import { toast } from "react-hot-toast";

export default function Channels() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const { updateAppState } = useAppState();

  const { channels, loading, error, createChannel } = useChannelsV2();

  const handleCreate = async () => {
    if (!newChannelName.trim()) return;

    try {
      const result = await createChannel({
        name: newChannelName.trim(),
        type: "channel",
      });
      if (result) {
        setShowCreateModal(false);
        setNewChannelName("");
      }
    } catch (error) {
      console.error("Errore nella creazione:", error);
      toast.error(error.message || "Errore nella creazione del canale");
    }
  };

  const handleSelect = (channel) => {
    console.log("Selecting channel:", channel);
    if (!channel || !channel.id) {
      console.error("Canale non valido:", channel);
      return;
    }

    updateAppState({
      selected: {
        roomId: channel.id,
        pub: channel.id,
        name: channel.name,
        type: "channel",
        isChannel: true,
        isGroup: true,
        timestamp: channel.created || Date.now(),
        creator: channel.creator,
        members: channel.members || {},
        settings: {
          isPublic: true,
          canWrite: true,
        },
        messages: channel.messages || {},
      },
      chatData: {
        type: "channel",
        roomId: channel.id,
        pub: channel.id,
        name: channel.name,
        creator: channel.creator,
        members: channel.members || {},
      },
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-[#4A4F76]">
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Nuovo Canale
        </button>
      </div>

      {/* Lista canali */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : error ? (
          <div className="text-red-500 text-center">{error}</div>
        ) : channels.length === 0 ? (
          <div className="text-center text-gray-400">
            Nessun canale disponibile
          </div>
        ) : (
          channels.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center justify-between p-4 bg-[#2D325A] rounded-lg hover:bg-[#373B5C] cursor-pointer"
              onClick={() => handleSelect(channel)}
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                  {channel.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-medium">{channel.name}</h3>
                  <p className="text-sm text-gray-400">
                    {channel.members ? Object.keys(channel.members).length : 0}{" "}
                    membri
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal creazione canale */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#2D325A] rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium mb-4">Crea nuovo canale</h3>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              className="w-full px-3 py-2 bg-[#373B5C] rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nome del canale..."
              autoFocus
            />
            <div className="flex justify-end mt-4 space-x-2">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewChannelName("");
                }}
                className="px-4 py-2 text-gray-300 hover:bg-[#4A4F76] rounded-md"
              >
                Annulla
              </button>
              <button
                onClick={handleCreate}
                disabled={!newChannelName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
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
