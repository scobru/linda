import React, { useState, useEffect } from "react";
import { channelsV2 } from "linda-protocol";
import { toast } from "react-hot-toast";

const ChannelList = ({ onSelect }) => {
  const [channelList, setChannelList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joiningChannel, setJoiningChannel] = useState(null);

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    try {
      await channelsV2.list((response) => {
        if (response.success) {
          setChannelList(response.channels);
        } else {
          setError(response.error);
        }
        setLoading(false);
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleJoin = async (channelId) => {
    try {
      setJoiningChannel(channelId);
      await channelsV2.join(channelId, () => {
        loadChannels();
        toast.success("Ti sei unito al canale con successo!");
      });
    } catch (error) {
      toast.error(error.message || "Errore durante l'unione al canale");
    } finally {
      setJoiningChannel(null);
    }
  };

  const handleSelect = (channel) => {
    const selectedChannel = {
      ...channel,
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
    };

    onSelect({
      item: selectedChannel,
      type: "channel",
    });
  };

  if (loading) return <div className="p-4">Caricamento canali...</div>;
  if (error) return <div className="p-4 text-red-500">Errore: {error}</div>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Canali Disponibili</h2>
      <div className="space-y-2">
        {channelList.map((channel) => (
          <div
            key={channel.id}
            className="p-3 bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => handleSelect(channel)}
          >
            <h3 className="font-semibold">{channel.name}</h3>
            <p className="text-sm text-gray-600">{channel.description}</p>
            <div className="mt-2 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                Creato il: {new Date(channel.created).toLocaleDateString()}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Previene il click sul canale quando si clicca Unisciti
                  handleJoin(channel.id);
                }}
                disabled={joiningChannel === channel.id}
                className={`px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm ${
                  joiningChannel === channel.id ? "opacity-50 cursor-wait" : ""
                }`}
              >
                {joiningChannel === channel.id ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Unione...
                  </span>
                ) : (
                  "Unisciti"
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChannelList;
