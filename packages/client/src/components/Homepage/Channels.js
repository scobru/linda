import React, { useState } from "react";
import { useChannels } from "../../hooks/useChannels";

export default function Channels({ onSelect }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [isChannel, setIsChannel] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const {
    channelList,
    loading,
    createChannel,
    joinChannel,
    leaveChannel,
    deleteChannel,
    searchChannels,
    isChannelCreator,
  } = useChannels();

  const handleCreate = async () => {
    if (!newChannelName.trim()) return;

    try {
      const result = await createChannel(newChannelName.trim(), isChannel);
      if (result) {
        setShowCreateModal(false);
        setNewChannelName("");
      }
    } catch (error) {
      console.error("Errore nella creazione:", error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const results = await searchChannels(searchQuery.trim());
      setSearchResults(results);
    } catch (error) {
      console.error("Errore nella ricerca:", error);
    }
  };

  const handleJoin = async (channelId) => {
    try {
      await joinChannel(channelId);
    } catch (error) {
      console.error("Errore nell'iscrizione:", error);
    }
  };

  const handleLeave = async (channelId) => {
    try {
      await leaveChannel(channelId);
    } catch (error) {
      console.error("Errore nella disiscrizione:", error);
    }
  };

  const handleDelete = async (channelId) => {
    try {
      await deleteChannel(channelId);
    } catch (error) {
      console.error("Errore nell'eliminazione:", error);
    }
  };

  const handleSelect = (channel) => {
    onSelect({
      item: {
        ...channel,
        roomId: channel.id,
        pub: channel.id,
        name: channel.name,
        type: channel.isChannel ? "channel" : "board",
        isGroup: true,
        timestamp: channel.created,
        creator: channel.creator,
        members: channel.members,
        settings: channel.settings || {
          isPublic: true,
          canWrite: true,
        },
        messages: channel.messages || {},
      },
      type: channel.isChannel ? "channel" : "board",
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header con pulsanti */}
      <div className="flex justify-between items-center p-4 border-b border-[#4A4F76]">
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create New
        </button>
        <button
          onClick={() => setShowSearchModal(true)}
          className="px-4 py-2 text-white hover:bg-[#4A4F76] rounded-lg"
        >
          Search
        </button>
      </div>

      {/* Lista canali */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : (
          channelList.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center justify-between p-4 bg-[#2D325A] rounded-lg hover:bg-[#373B5C] cursor-pointer"
              onClick={() => handleSelect(channel)}
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    channel.isChannel ? "bg-blue-500" : "bg-green-500"
                  }`}
                >
                  {channel.isChannel ? "C" : "B"}
                </div>
                <div>
                  <h3 className="text-white font-medium">{channel.name}</h3>
                  <p className="text-sm text-gray-400">
                    {channel.members?.length || 0} members
                  </p>
                </div>
              </div>
              <div className="flex space-x-2">
                {isChannelCreator(channel) ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(channel.id);
                    }}
                    className="p-2 text-red-400 hover:bg-[#4A4F76] rounded-lg"
                  >
                    Delete
                  </button>
                ) : channel.joined ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLeave(channel.id);
                    }}
                    className="p-2 text-gray-300 hover:bg-[#4A4F76] rounded-lg"
                  >
                    Leave
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJoin(channel.id);
                    }}
                    className="p-2 text-blue-400 hover:bg-[#4A4F76] rounded-lg"
                  >
                    Join
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal creazione */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#2D325A] rounded-lg p-6 w-96 text-white">
            <h3 className="text-lg font-medium mb-4">
              Create new {isChannel ? "channel" : "board"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#373B5C] rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter a name..."
                  disabled={loading}
                  autoFocus
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={isChannel}
                  onChange={(e) => setIsChannel(e.target.checked)}
                  className="mr-2"
                  disabled={loading}
                />
                <label className="text-sm">Create as channel</label>
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-300 hover:bg-[#4A4F76] rounded-md"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={loading || !newChannelName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal ricerca */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#2D325A] rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto text-white">
            <h3 className="text-lg font-medium mb-4">
              Search Boards and Channels
            </h3>
            <div className="space-y-4">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#373B5C] rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search..."
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                />
                <button
                  onClick={handleSearch}
                  disabled={loading || !searchQuery.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Search
                </button>
              </div>

              {/* Risultati ricerca */}
              <div className="space-y-3">
                {searchResults.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center justify-between p-3 bg-[#373B5C] rounded-lg"
                  >
                    <div>
                      <h4 className="font-medium">{channel.name}</h4>
                      <p className="text-sm text-gray-400">
                        {channel.members?.length || 0} members
                      </p>
                    </div>
                    {!channel.joined && (
                      <button
                        onClick={() => handleJoin(channel.id)}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Join
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setShowSearchModal(false);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className="px-4 py-2 text-gray-300 hover:bg-[#4A4F76] rounded-md"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
