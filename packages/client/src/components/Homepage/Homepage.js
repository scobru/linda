import React, { useEffect, useCallback, useState } from "react";
import { useAppState } from "../../contexts/AppStateContext";
import { useFriendRequestNotifications } from "../../hooks/useFriendRequestNotifications";
import Friends from "./Friends";
import Sidebar from "./Sidebar";

const Homepage = () => {
  const { appState } = useAppState();
  const [selectedView, setSelectedView] = useState("chats");
  const [selectedUser, setSelectedUser] = useState(null);
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);
  const [showMobileMessages, setShowMobileMessages] = useState(false);
  const {
    pendingRequests,
    loading: requestsLoading,
    removeRequest,
  } = useFriendRequestNotifications();

  const handleRequestProcessed = useCallback(
    (requestId, action) => {
      console.log(
        `Richiesta ${requestId} ${
          action === "accept" ? "accettata" : "rifiutata"
        }`
      );
      removeRequest(requestId);
    },
    [removeRequest]
  );

  // Gestione cambio vista
  const handleViewChange = useCallback((view) => {
    setSelectedView(view);
    setSelectedUser(null);
    setShowMobileMessages(false);
  }, []);

  return (
    <div className="flex h-screen bg-[#1E2140]">
      <Sidebar selectedView={selectedView} onViewChange={handleViewChange} />
      <div className="flex flex-1 overflow-hidden">
        {selectedView === "friends" && (
          <Friends
            onSelect={handleSelectUser}
            selectedUser={selectedUser}
            pendingRequests={pendingRequests}
            loading={requestsLoading}
            onRequestProcessed={handleRequestProcessed}
          />
        )}
        {/* ... rest of the code ... */}
      </div>
    </div>
  );
};

export default Homepage;
