import React, { useState, useEffect } from "react";
import { channelsV2 } from "linda-protocol";

const ChannelList = () => {
  const [channelList, setChannelList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  if (loading) return <div className="p-4">Caricamento canali...</div>;
  if (error) return <div className="p-4 text-red-500">Errore: {error}</div>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Canali Disponibili</h2>
      <div className="space-y-2">
        {channelList.map((channel) => (
          <div
            key={channel.id}
            className="p-3 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold">{channel.name}</h3>
            <p className="text-sm text-gray-600">{channel.description}</p>
            <div className="mt-2 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                Creato il: {new Date(channel.created).toLocaleDateString()}
              </span>
              <button
                onClick={() => channelsV2.join(channel.id)}
                className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
              >
                Unisciti
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChannelList;
