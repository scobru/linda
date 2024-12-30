import React from "react";
import { useAppState } from "../context/AppContext";
import Channels from "../components/Homepage/Channels/Channels";
import Messages from "../components/Homepage/Messages/Messages";
import Header from "../components/Header";
import Friends from "../components/Homepage/Friends/Friends";
import Boards from "../components/Homepage/Boards/Boards";
import { useMobileView } from "../hooks/useMobileView";
import { useChannelsV2 } from "../hooks/useChannelsV2";
import { messaging } from "#protocol";

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
      avatar: item.avatar || null,
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
              <div className="flex items-center justify-center space-x-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z"
                  />
                </svg>
              </div>
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
              <div className="flex items-center justify-center space-x-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z"
                  />
                </svg>
              </div>
            </button>
            <button
              onClick={() => {
                setCurrentView("boards");
                updateAppState({ ...appState, selected: null });
                window.dispatchEvent(new CustomEvent("tabChanged"));
              }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                currentView === "boards"
                  ? "bg-blue-600 text-white"
                  : "bg-[#2D325A] text-gray-300 hover:bg-[#4A4F76]"
              }`}
            >
              <div className="flex items-center justify-center space-x-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                  />
                </svg>
              </div>
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
