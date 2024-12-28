import React from "react";
import { useAppState } from "../context/AppContext";
import Channels from "../components/Homepage/Channels";
import Messages from "../components/Homepage/Messages/Messages";
import Header from "../components/Header";
import Friends from "../components/Homepage/Friends/Friends";
import BoardList from "../components/Homepage/Boards/BoardList";

export default function Homepage() {
  const { appState, currentView, setCurrentView } = useAppState();

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

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex flex-1 bg-[#1E2142] overflow-hidden">
        <div className="w-1/4 border-r border-[#4A4F76] flex flex-col">
          {/* Navigation Buttons */}
          <div className="p-4 flex space-x-2">
            <button
              onClick={() => setCurrentView("chats")}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                currentView === "chats"
                  ? "bg-blue-600 text-white"
                  : "bg-[#2D325A] text-gray-300 hover:bg-[#4A4F76]"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setCurrentView("channels")}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                currentView === "channels"
                  ? "bg-blue-600 text-white"
                  : "bg-[#2D325A] text-gray-300 hover:bg-[#4A4F76]"
              }`}
            >
              Canali
            </button>
            <button
              onClick={() => setCurrentView("boards")}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                currentView === "boards"
                  ? "bg-blue-600 text-white"
                  : "bg-[#2D325A] text-gray-300 hover:bg-[#4A4F76]"
              }`}
            >
              Board
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            {currentView === "chats" && (
              <Friends
                selectedUser={appState.selected}
                pendingRequests={[]}
                loading={false}
              />
            )}
            {currentView === "channels" && <Channels />}
            {currentView === "boards" && <BoardList />}
          </div>
        </div>
        <div className="flex-1">
          <Messages />
        </div>
      </div>
    </div>
  );
}
