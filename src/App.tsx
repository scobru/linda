import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import ZEN from "zen";

// Services & DB
import { DataBase } from "./zen/db";
import { GroupService, type Role } from "./services/GroupService";
import { CommunicationService } from "./services/CommunicationService";

// Pages & Components
import { GroupSettingsPage } from "./pages/GroupSettingsPage";
import { GroupCreationPage } from "./pages/GroupCreationPage";
import { UserProfile } from "./pages/UserProfile";
import { Settings } from "./pages/Settings";
import AuthPage from "./pages/AuthPage";
import { ChatView } from "./components/ChatView";
import { Layout } from "./components/Layout";
import { LoadingScreen } from "./components/LoadingScreen";

// Hooks
import { useCommunicationInit } from "./hooks/useCommunicationInit";
import { useMessaging } from "./hooks/useMessaging";
import { useAuthManager } from "./hooks/useAuthManager";
import { useSignalingListener } from "./hooks/useSignalingListener";
import { useFileTransfer } from "./hooks/useFileTransfer";
import { useWormhole } from "./hooks/useWormhole";
import { useProfile } from "./hooks/useProfile";

// ── App Content Component ──
const AppContent: React.FC<{
  db: DataBase;
  isLoggedIn: boolean;
  userPub: string | null;
  username: string;
  onLogout: () => void;
}> = ({ db, isLoggedIn, userPub, username, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");

  // 1. Auth & Notifications
  const { isProcessingMagicLink, notification, showNotification } = useAuthManager(db, isLoggedIn, userPub);

  // 2. Base Services Initialization
  const { communicationService, groupService, isLoading, userUniqueUsername } = useCommunicationInit(db, isLoggedIn, userPub, showNotification);

  // 3. P2P Signal & File Transfer
  const { fileTransferServiceInst, transferProgress, transferBlobs } = useFileTransfer(db, isLoggedIn, userPub, communicationService);
  const { wormholeServiceInst, wormholeStatuses } = useWormhole(db, isLoggedIn);

  // 4. Signaling Listener
  useSignalingListener(db, isLoggedIn, userPub, communicationService, fileTransferServiceInst);

  // 5. Messaging Core
  const messaging = useMessaging(db, userPub, communicationService, groupService, recipient, setRecipient, "http://localhost:8765");

  // 6. Profiles
  const { userNick, contactProfiles } = useProfile(db, isLoggedIn, messaging.contacts, communicationService);

  // 7. Role Sync
  const [myRole, setMyRole] = useState<Role | null>(null);
  useEffect(() => {
    if (recipient && groupService && recipient.length === 36 && recipient.includes("-")) {
      groupService.getMemberRole(recipient, userPub || "").then(setMyRole);
      return groupService.onMemberRoleChange(recipient, userPub || "", (role) => setMyRole(role));
    }
    setMyRole(null);
  }, [recipient, groupService, userPub]);

  // Route Sync
  useEffect(() => {
    const chatMatch = location.pathname.match(/\/chat\/([^\/]+)/);
    const idFromRoute = chatMatch ? chatMatch[1] : "";
    if (idFromRoute !== recipient) setRecipient(idFromRoute);
  }, [location.pathname, recipient]);

  // Handlers
  const handleLogout = async () => {
    localStorage.clear();
    onLogout();
  };

  const handleSendMessage = async (msg?: string, audio?: string, fileMetadata?: any) => {
    if (!recipient) return;
    try {
      await messaging.handleSendMessage(msg || message, audio, fileMetadata);
      if (!audio && !fileMetadata) setMessage("");
    } catch (err: any) {
      showNotification("Send failed: " + (err.message || "Unknown error"), "error");
    }
  };

  const handleDeleteContact = async (contactKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Delete conversation?")) return;
    try {
      if (contactKey.length === 36 && contactKey.includes("-")) {
        if (groupService) await groupService.leaveGroup(contactKey);
      } else {
        await messaging.blockContact(contactKey);
      }
      messaging.removeContact(contactKey);
      if (recipient === contactKey) {
        setRecipient("");
        navigate("/");
      }
      showNotification("Contact removed", "info");
    } catch (err) {
      showNotification("Failed to remove contact", "error");
    }
  };

  if (isLoading || isProcessingMagicLink) {
    return <LoadingScreen message={isLoading ? "Initializing session" : "Authenticating Link"} submessage="Verifying identity on decentralized web" />;
  }

  return (
    <div className="h-dvh w-screen overflow-hidden bg-base-100 relative">
      <Routes>
        <Route
          element={
            <Layout
              sidebarProps={{
                db,
                userPub,
                userNick,
                username: username || "",
                contacts: messaging.contacts,
                setRecipient: (id: string) => {
                  setRecipient(id);
                  navigate(id ? `/chat/${id}` : "/");
                },
                contactProfiles,
                unreadCounts: messaging.unreadCounts,
                handleDeleteContact,
                communicationService,
                groupService,
                showNotification,
                saveContact: messaging.saveContact,
                requestNotifications: () => Notification.requestPermission(),
              }}
            />
          }
        >
          <Route path="/" element={<ChatView recipient="" {...messaging} db={db} userPub={userPub || ""} userNick={userNick} username={username} message={message} setMessage={setMessage} handleSendMessage={handleSendMessage} contactProfiles={contactProfiles} myRole={myRole} transferProgress={transferProgress} transferBlobs={transferBlobs} wormholeService={wormholeServiceInst} wormholeStatuses={wormholeStatuses} showNotification={showNotification} setShowGroupSettings={(id) => navigate(`/chat/${id}/settings`)} />} />
          <Route path="/chat/:id" element={<ChatView recipient={recipient} {...messaging} db={db} userPub={userPub || ""} userNick={userNick} username={username} message={message} setMessage={setMessage} handleSendMessage={handleSendMessage} contactProfiles={contactProfiles} myRole={myRole} transferProgress={transferProgress} transferBlobs={transferBlobs} wormholeService={wormholeServiceInst} wormholeStatuses={wormholeStatuses} showNotification={showNotification} setShowGroupSettings={(id) => navigate(`/chat/${id}/settings`)} />} />
          <Route path="/profile" element={<UserProfile db={db} username={username} currentNick={userNick} currentUniqueUsername={userUniqueUsername} handleLogout={handleLogout} showNotification={showNotification} />} />
          <Route path="/settings" element={<Settings showNotification={showNotification} />} />
          <Route path="/chat/:id/settings" element={<GroupSettingsPage groupService={groupService!} db={db} showNotification={showNotification} />} />
          <Route path="/create-group" element={<GroupCreationPage groupService={groupService!} onCreated={(id) => { messaging.saveContact(id); setRecipient(id); navigate(`/chat/${id}`); }} showNotification={showNotification} />} />
        </Route>
      </Routes>

      {notification && (
        <div className="toast toast-top toast-end z-[100]">
          <div className={`alert ${notification.type === "error" ? "alert-error" : "alert-success"} shadow-xl border border-base-content/5`}>
            <span>{notification.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Root App Component ──
const App: React.FC = () => {
  const [initializing, setInitializing] = useState(true);
  const [dbInstance, setDbInstance] = useState<DataBase | null>(null);
  const [authState, setAuthState] = useState({ isLoggedIn: false, userPub: null as string | null, username: "" });

  useEffect(() => {
    const savedTheme = localStorage.getItem("linda-theme") || "linda";
    document.documentElement.dataset.theme = savedTheme;

    const initZen = async () => {
      try {
        const relays = ["http://localhost:8765/zen"];
        const zen = new ZEN({ peers: relays, localStorage: false, radisk: false });
        const db = new DataBase(zen);
        setDbInstance(db);

        const restored = await db.restoreSession();
        if (restored.success) {
          setAuthState({ isLoggedIn: true, userPub: db.getUserPub(), username: restored.username || "" });
        }
      } catch (err) {
        console.error("Zen Init Failed", err);
      } finally {
        setInitializing(false);
      }
    };
    initZen();
  }, []);

  if (initializing || !dbInstance) return <LoadingScreen message="Bootstrapping Zen" submessage="Connecting to P2P decentralized graph" type="infinity" />;

  return (
    <BrowserRouter>
      {!authState.isLoggedIn ? (
        <AuthPage db={dbInstance} onAuth={(user) => setAuthState({ isLoggedIn: true, userPub: dbInstance.getUserPub(), username: user })} />
      ) : (
        <AppContent db={dbInstance} {...authState} onLogout={() => setAuthState({ isLoggedIn: false, userPub: null, username: "" })} />
      )}
    </BrowserRouter>
  );
};

export default App;
