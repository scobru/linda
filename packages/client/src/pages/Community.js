import React, { useState } from "react";
import ChannelList from "../components/Homepage/Channels/ChannelList";
import BoardList from "../components/Homepage/Boards/BoardList";
import CreateChannel from "../components/Homepage/Channels/CreateChannel";
import CreateBoard from "../components/Homepage/Boards/CreateBoard";

const Community = () => {
  const [activeTab, setActiveTab] = useState("channels");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleCreated = () => {
    setShowCreateModal(false);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Tabs */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab("channels")}
            className={`px-4 py-2 rounded-lg ${
              activeTab === "channels"
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Canali
          </button>
          <button
            onClick={() => setActiveTab("boards")}
            className={`px-4 py-2 rounded-lg ${
              activeTab === "boards"
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Boards
          </button>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
        >
          {activeTab === "channels" ? "Nuovo Canale" : "Nuova Board"}
        </button>
      </div>

      {/* Content */}
      <div className="bg-gray-50 rounded-lg min-h-screen">
        {activeTab === "channels" ? <ChannelList /> : <BoardList />}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-bold">
                {activeTab === "channels" ? "Nuovo Canale" : "Nuova Board"}
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              {activeTab === "channels" ? (
                <CreateChannel onChannelCreated={handleCreated} />
              ) : (
                <CreateBoard onBoardCreated={handleCreated} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Community;
