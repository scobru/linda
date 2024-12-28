import React from "react";
import { useAppState } from "../../context/AppContext";
import Messages from "./Messages/Messages";
import Channels from "./Channels/Channels";
import Boards from "./Boards/Boards";
import Chat from "./Chat/Chat";

const Homepage = () => {
  const { appState } = useAppState();
  const { currentView, selected } = appState;

  const renderContent = () => {
    switch (currentView) {
      case "chats":
        return <Chat />;
      case "channels":
        return <Channels />;
      case "boards":
        return <Boards />;
      default:
        return <Chat />;
    }
  };

  return (
    <div className="flex h-screen bg-[#424874]">
      <div className="w-[320px] flex-shrink-0 border-r border-[#4A4F76] overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto">{renderContent()}</div>
      </div>
      <div className="flex-1 overflow-hidden">
        {selected ? (
          <Messages />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            {currentView === "boards"
              ? "Seleziona una board"
              : currentView === "channels"
              ? "Seleziona un canale"
              : "Seleziona una chat"}
          </div>
        )}
      </div>
    </div>
  );
};

export default Homepage;
