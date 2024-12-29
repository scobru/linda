import React from "react";
import { useAppState } from "../context/AppContext";
import Channels from "../components/Homepage/Channels/Channels";
import Messages from "../components/Homepage/Messages/Messages";
import Header from "../components/Header";
import Friends from "../components/Homepage/Friends/Friends";
import Boards from "../components/Homepage/Boards/Boards";
import { useMobileView } from "../hooks/useMobileView";
import { useChannelsV2 } from "../hooks/useChannelsV2";
import { messaging } from "linda-protocol";

export default function Homepage() {
  const { appState, currentView, setCurrentView, updateAppState } =
    useAppState();
  const { isMobileView, showSidebar, setShowSidebar } = useMobileView();
  const channelService = useChannelsV2();

  if (!appState.isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Accesso richiesto</h1>
          <p>Per favore, effettua l'accesso per visualizzare questa pagina.</p>
        </div>
      </div>
    );
  }

  const handleBack = () => {
    setShowSidebar(true);
    updateAppState({
      ...appState,
      selected: null,
    });
  };

  const handleSelect = (item) => {
    const type =
      currentView === "chats"
        ? "friend"
        : currentView === "channels"
        ? "channel"
        : "board";

    const roomId =
      type === "friend"
        ? [item.pub, appState.user.is.pub].sort().join("_")
        : item.id || item.roomId;

    const updatedItem = {
      ...item,
      type,
      roomId,
    };

    if (type === "friend") {
      updateAppState({
        ...appState,
        selected: updatedItem,
        currentChat: {
          ...updatedItem,
          roomId,
        },
        currentChannel: null,
        currentBoard: null,
      });
    } else if (type === "channel") {
      updateAppState({
        ...appState,
        selected: updatedItem,
        currentChat: null,
        currentChannel: updatedItem,
        currentBoard: null,
      });
    } else {
      updateAppState({
        ...appState,
        selected: updatedItem,
        currentChat: null,
        currentChannel: null,
        currentBoard: updatedItem,
      });
    }

    if (isMobileView) {
      setShowSidebar(false);
    }
  };

  // Determina se mostrare l'header
  const shouldShowHeader =
    !isMobileView || (isMobileView && (!appState.selected || showSidebar));

  const renderMainContent = () => {
    if (!appState.selected) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400">
          Seleziona una conversazione
        </div>
      );
    }

    const isChannel = appState.selected.type !== "friend";
    const messageHandler = isChannel ? channelService : messaging;

    return (
      <Messages
        isMobileView={isMobileView}
        onBack={handleBack}
        isChannel={isChannel}
        selectedChannel={isChannel ? appState.selected : null}
        currentChat={appState.currentChat}
        currentChannel={appState.currentChannel}
        messageService={messageHandler}
      />
    );
  };

  return (
    <div className="flex flex-col h-screen bg-[#1E2142]">
      {shouldShowHeader && (
        <div className="sticky top-0 z-50">
          <Header />
        </div>
      )}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <div
          className={`${
            isMobileView
              ? showSidebar
                ? "w-full absolute inset-0 z-30"
                : "hidden"
              : "w-80"
          } flex flex-col bg-[#1E2142] border-r border-[#4A4F76]`}
        >
          {/* Navigation Buttons */}
          <div className="p-2 flex space-x-2 bg-[#1E2142] sticky top-0 z-10">
            <button
              onClick={() => {
                setCurrentView("chats");
                updateAppState({ ...appState, selected: null });
              }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                currentView === "chats"
                  ? "bg-blue-600 text-white"
                  : "bg-[#2D325A] text-gray-300 hover:bg-[#4A4F76]"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => {
                setCurrentView("channels");
                updateAppState({ ...appState, selected: null });
              }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                currentView === "channels"
                  ? "bg-blue-600 text-white"
                  : "bg-[#2D325A] text-gray-300 hover:bg-[#4A4F76]"
              }`}
            >
              Canali
            </button>
            <button
              onClick={() => {
                setCurrentView("boards");
                updateAppState({ ...appState, selected: null });
              }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                currentView === "boards"
                  ? "bg-blue-600 text-white"
                  : "bg-[#2D325A] text-gray-300 hover:bg-[#4A4F76]"
              }`}
            >
              Board
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {currentView === "chats" && <Friends onSelect={handleSelect} />}
            {currentView === "channels" && <Channels onSelect={handleSelect} />}
            {currentView === "boards" && <Boards onSelect={handleSelect} />}
          </div>
        </div>

        {/* Main Content */}
        <div
          className={`${
            isMobileView ? (showSidebar ? "hidden" : "w-full") : "flex-1"
          } flex flex-col`}
        >
          {renderMainContent()}
        </div>
      </div>
    </div>
  );
}
