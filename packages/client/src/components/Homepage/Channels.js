import React from "react";
import { gun, user, DAPP_NAME } from "linda-protocol";
import { messaging } from "linda-protocol";
import { toast } from "react-hot-toast";

const { channels } = messaging;

export default function Channels({ onSelect }) {
  const [myChannels, setMyChannels] = React.useState([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filteredChannels, setFilteredChannels] = React.useState([]);
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [showSearchModal, setShowSearchModal] = React.useState(false);
  const [newChannelName, setNewChannelName] = React.useState("");
  const [isChannel, setIsChannel] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState({
    boards: [],
    channels: [],
  });

  // Carica i canali dell'utente
  React.useEffect(() => {
    if (!user.is) return;

    let mounted = true;

    const loadChannels = async () => {
      try {
        const channelsList = new Map();
        let loadingPromises = [];

        // Caricamento parallelo dei canali
        await new Promise((resolve) => {
          gun
            .user()
            .get(DAPP_NAME)
            .get("my_channels")
            .map()
            .once(async (data) => {
              if (!data || !data.channelId) return;

              loadingPromises.push(
                Promise.all([
                  channels.countMembers(data.channelId),
                  new Promise((resolveChannel) => {
                    gun
                      .get(DAPP_NAME)
                      .get("channels")
                      .get(data.channelId)
                      .once((channelData) => {
                        resolveChannel(channelData);
                      });
                  }),
                ]).then(([membersCount, channelData]) => {
                  if (channelData) {
                    channelsList.set(data.channelId, {
                      ...channelData,
                      id: data.channelId,
                      joined: data.joined || channelData.created || Date.now(),
                      membersCount,
                    });
                  }
                })
              );
            });

          setTimeout(resolve, 500);
        });

        await Promise.all(loadingPromises);

        if (mounted) {
          const channelsArray = Array.from(channelsList.values());
          setMyChannels(channelsArray.sort((a, b) => b.joined - a.joined));
          setFilteredChannels(channelsArray);
        }
      } catch (error) {
        console.error("Error loading channels:", error);
        if (mounted) {
          toast.error("Error loading channels");
        }
      }
    };

    loadChannels();

    // Monitora i cambiamenti nei canali
    const channelsSubscription = gun
      .user()
      .get(DAPP_NAME)
      .get("my_channels")
      .map()
      .on(async (data) => {
        if (!mounted || !data || !data.channelId) return;

        try {
          const [membersCount, channel] = await Promise.all([
            channels.countMembers(data.channelId),
            new Promise((resolve) => {
              gun
                .get(DAPP_NAME)
                .get("channels")
                .get(data.channelId)
                .once((channelData) => {
                  resolve(channelData);
                });
            }),
          ]);

          if (channel) {
            setMyChannels((prev) => {
              const withoutCurrent = prev.filter(
                (c) => c.id !== data.channelId
              );
              const updatedChannel = {
                ...channel,
                id: data.channelId,
                joined: data.joined || channel.created || Date.now(),
                membersCount,
              };
              return [...withoutCurrent, updatedChannel].sort(
                (a, b) => b.joined - a.joined
              );
            });
          }
        } catch (error) {
          console.error("Error updating channel:", error);
        }
      });

    return () => {
      mounted = false;
      if (typeof channelsSubscription === "function") {
        channelsSubscription();
      }
    };
  }, []);

  // Effetto per gestire la ricerca
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredChannels(myChannels);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = myChannels.filter((channel) => {
      const name = channel.name || "";
      const type = channel.type || "";
      const members = channel.membersCount || 0;

      return (
        name.toLowerCase().includes(query) ||
        type.toLowerCase().includes(query) ||
        `${members} members`.toLowerCase().includes(query)
      );
    });

    setFilteredChannels(filtered);
  }, [searchQuery, myChannels]);

  // Gestisci la selezione del canale
  const handleChannelSelect = (channel) => {
    onSelect({
      ...channel,
      roomId: channel.id,
      type: channel.type,
      name: channel.name,
      isGroup: false,
      pub: channel.id,
      timestamp: Date.now(),
    });
  };

  // Create new board/channel
  const handleCreate = async () => {
    if (!user.is) {
      toast.error("User not authenticated");
      return;
    }

    if (!newChannelName.trim()) {
      toast.error("Please enter a name");
      return;
    }

    setLoading(true);

    try {
      await channels.create(
        newChannelName.trim(),
        isChannel ? "channel" : "board"
      );
      toast.success(`${isChannel ? "Channel" : "Board"} created successfully!`);
      setNewChannelName("");
      setIsChannel(false);
      setShowCreateModal(false);
    } catch (error) {
      console.error("Error during creation:", error);
      toast.error(error.message || "Error during creation");
    } finally {
      setLoading(false);
    }
  };

  // Search boards and channels
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const results = await channels.search(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error("Error searching:", error);
      toast.error("Error during search");
    } finally {
      setLoading(false);
    }
  };

  // Join a board/channel
  const handleJoin = async (channelId) => {
    try {
      await channels.join(channelId);
      toast.success("Successfully joined");
      setShowSearchModal(false);
    } catch (error) {
      console.error("Error joining:", error);
      toast.error(error.message);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#373B5C]">
      {/* Pulsanti principali */}
      <div className="p-3 space-y-2">
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create Board/Channel
        </button>
        <button
          onClick={() => setShowSearchModal(true)}
          className="w-full py-2 px-4 bg-[#2D325A] text-white rounded-lg hover:bg-[#4A4F76] transition-colors"
        >
          Search Boards and Channels
        </button>
      </div>

      {/* Barra di ricerca locale */}
      <div className="p-3 border-b border-[#4A4F76]">
        <div className="relative">
          <input
            type="text"
            placeholder="Filter your boards and channels..."
            className="w-full bg-[#2D325A] text-white placeholder-gray-400 rounded-full py-2 px-4 pl-10 focus:outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <svg
            className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
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
        </div>
      </div>

      {/* Lista canali */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-[#4A4F76]">
          {(searchQuery ? filteredChannels : myChannels).map((channel) => (
            <div
              key={channel.id}
              onClick={() => handleChannelSelect(channel)}
              className="flex items-center p-3 hover:bg-[#4A4F76] cursor-pointer"
            >
              <div className="flex-shrink-0">
                <img
                  className="h-10 w-10 rounded-full"
                  src={`https://api.dicebear.com/7.x/icons/svg?seed=${channel.name}`}
                  alt=""
                />
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-white">{channel.name}</p>
                <p className="text-xs text-gray-300">
                  {channel.type === "board" ? "Board" : "Channel"} •{" "}
                  {channel.membersCount || 0} members
                </p>
              </div>
            </div>
          ))}
        </div>
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
                  onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1 px-3 py-2 bg-[#373B5C] rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search..."
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
              <div className="space-y-2">
                {[...searchResults.boards, ...searchResults.channels].map(
                  (item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-[#373B5C] rounded-lg"
                    >
                      <div>
                        <h4 className="font-medium">{item.name}</h4>
                        <p className="text-sm text-gray-300">
                          {item.membersCount || 0} members •{" "}
                          {item.type === "channel" ? "Channel" : "Board"}
                        </p>
                      </div>
                      <button
                        onClick={() => handleJoin(item.id)}
                        className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        Join
                      </button>
                    </div>
                  )
                )}
                {searchResults.boards.length === 0 &&
                  searchResults.channels.length === 0 &&
                  searchQuery &&
                  !loading && (
                    <p className="text-center text-gray-300 py-4">
                      No results found
                    </p>
                  )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setShowSearchModal(false)}
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
