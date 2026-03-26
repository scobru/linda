import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { GroupSettings } from "./components/GroupSettings";
import { GroupCreationModal } from "./components/GroupCreationModal";
import Gun from "gun";
import type { IGunInstance } from "gun";
import "gun/sea";
import { DataBase, ShogunCore } from "shogun-core";
import {
  shogunConnector,
  ShogunButtonProvider,
  ShogunButton,
  useShogun,
} from "shogun-button-react";
import { UserProfile } from "./pages/UserProfile";
import { Settings } from "./pages/Settings";
import { ChatView } from "./components/ChatView";
import { Layout } from "./components/Layout";
import { useParams } from "react-router-dom";
import { useSignalInit } from "./hooks/useSignalInit";
import { useSignalMessaging } from "./hooks/useSignalMessaging";
import { type Role } from "./GroupService";

// Extend window interface
declare global {
  interface Window {
    shogunDebug?: {
      clearAllData: () => void;
      sdk: ShogunCore;
      gun: IGunInstance;
      relays: string[];
    };
    gun?: IGunInstance;
    shogun?: ShogunCore;
  }
}





const AppContent: React.FC<{ db: DataBase }> = ({ db }) => {
  const { isLoggedIn, userPub, logout, username } = useShogun();
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [notification, setNotification] = useState<{ msg: string; type: "info" | "error" } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const showNotification = useCallback((msg: string, type: "info" | "error" = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // ── Hooks ──
  const { signalService, groupService, isLoading, userUniqueUsername } = useSignalInit(db, showNotification);
  
  const {
    messages,
    setMessages,
    contacts,
    setContacts,
    typingStatuses,
    contactErrors,
    setContactErrors,
    pinnedMessages,
    unreadCounts,
    handleTyping,
    handleSendMessage: baseSendMessage,
    saveContact,
    removeContact,
    saveMessages
  } = useSignalMessaging(db, userPub || null, signalService, groupService, recipient, setRecipient);

  // ── Sync Route & Recipient ──
  useEffect(() => {
    const chatMatch = location.pathname.match(/\/chat\/([^\/]+)/);
    const idFromRoute = chatMatch ? chatMatch[1] : "";
    if (idFromRoute !== recipient) setRecipient(idFromRoute);
  }, [location.pathname, recipient]);

  const [myRole, setMyRole] = useState<Role | null>(null);
  useEffect(() => {
    if (recipient && groupService && recipient.length === 36 && recipient.includes("-")) {
      groupService.getMemberRole(recipient, userPub || "").then(setMyRole);
    } else {
      setMyRole(null);
    }
  }, [recipient, groupService, userPub]);

  // ── Profile Logic ──
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userNick, setUserNick] = useState<string>("");
  const [contactProfiles, setContactProfiles] = useState<Record<string, { avatar?: string; nickname?: string; uniqueUsername?: string }>>({});

  useEffect(() => {
    if (!isLoggedIn) return;
    const pub = db.getUserPub();
    if (pub) {
      db.On(`~${pub}/profile/avatar`, (data: any) => typeof data === "string" && setUserAvatar(data), "avatar_self");
      db.On(`~${pub}/profile/nickname`, (data: any) => typeof data === "string" && setUserNick(data), "nick_self");
      return () => {
        db.Off("avatar_self");
        db.Off("nick_self");
      };
    }
  }, [isLoggedIn, db]);

  useEffect(() => {
    if (!signalService || contacts.length === 0) return;
    contacts.forEach(async (contactId) => {
      try {
        const isGroup = contactId.length === 36 && contactId.includes("-");
        if (isGroup) {
          db.On(`signal_rooms/${contactId}/meta`, (data: any) => {
            if (data && typeof data === "object") {
              setContactProfiles(prev => ({ ...prev, [contactId]: { ...prev[contactId], nickname: data.name, avatar: data.avatar } }));
            }
          }, `group_meta_${contactId}`);
        } else {
          let cPub = contactId;
          if (contactId.length < 43 || contactId.startsWith("@")) {
            cPub = await signalService.getPubKeyFromUsername(contactId);
          }
          if (cPub) {
            db.On(`~${cPub}/profile/avatar`, (data: any) => typeof data === "string" && setContactProfiles(prev => ({ ...prev, [contactId]: { ...prev[contactId], avatar: data } })), `avatar_${cPub}`);
            db.On(`~${cPub}/profile/nickname`, (data: any) => typeof data === "string" && setContactProfiles(prev => ({ ...prev, [contactId]: { ...prev[contactId], nickname: data } })), `nick_${cPub}`);
          }
        }
      } catch (e) {}
    });
  }, [contacts, signalService, db]);

  const requestNotifications = () => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(console.warn);
    }
  };

  const handleLogout = async () => {
    if (typeof localStorage !== "undefined") {
      if (signalService && (signalService as any).store) {
        try { await (signalService as any).store.clearAll(); } catch (e) {}
      }
      localStorage.clear();
    }
    logout();
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    try {
      await baseSendMessage(message);
      setMessage("");
    } catch (err: any) {
      showNotification("Send failed: " + (err.message || "Unknown error"), "error");
    }
  };

  const handleDeleteContact = (contactKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this contact and all history?")) return;
    setContacts(prev => prev.filter(c => c !== contactKey));
    removeContact(contactKey);
    if (recipient === contactKey) setRecipient("");
    setMessages(prev => {
      const next = { ...prev };
      delete next[contactKey];
      if (userPub) saveMessages(userPub, next);
      return next;
    });
    setContactErrors(prev => {
      const next = { ...prev };
      delete next[contactKey];
      return next;
    });
    showNotification("Contact deleted", "info");
  };

  const handleManualReset = async () => {
    if (!recipient || !signalService || !userPub) return;
    if (!window.confirm("Force-recreate secure session?")) return;
    try {
      await signalService.resetSession(recipient);
      setContactErrors(prev => ({ ...prev, [recipient]: false }));
      showNotification("Session reset triggered.", "info");
      const pub = await signalService.getPubKeyFromUsername(recipient);
      const ping = await signalService.encryptMessage(recipient, "PING_HEAL");
      db.Set(`signal_v3_inbox_${pub}`, { sender: userPub, type: ping.type, body: ping.body, timestamp: new Date().toISOString() } as any);
    } catch (err) {
      showNotification("Reset failed.", "error");
    }
  };

  const [showGroupSettings, setShowGroupSettings] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Helper functions for ChatView
  const handleDeleteMessage = async (msgId: string, senderPub?: string) => {
    if (!recipient || !groupService) return;
    try {
      await groupService.deleteMessage(recipient, msgId, senderPub || "");
      showNotification("Message deleted", "info");
    } catch (e: any) {
      showNotification(e.message || "Failed to delete message", "error");
    }
  };

  const handlePinMessage = async (msgId: string, isPinned: boolean) => {
    if (!recipient || !groupService) return;
    try {
      await groupService.pinMessage(recipient, msgId, isPinned);
      showNotification(isPinned ? "Message pinned" : "Message unpinned", "info");
    } catch (e: any) {
      showNotification(e.message || "Failed to pin message", "error");
    }
  };

  const handleReportMessage = async (msgId: string) => {
    if (!recipient || !groupService || !signalService) return;
    const isGroup = recipient.length === 36 && recipient.includes("-");
    
    const reason = window.prompt("Reason for reporting:");
    if (!reason) return;
    
    try {
      if (isGroup) {
        await groupService.reportContent(recipient, msgId, reason);
        showNotification("Message reported to group moderators", "info");
      } else {
        // For 1:1, we can't report to a group moderator. 
        // We could implement a global report or just block the user locally.
        showNotification("Reported (local only for 1:1 chats)", "info");
      }
    } catch (e: any) {
      showNotification(e.message || "Failed to report message", "error");
    }
  };

  // ── Loading screen ─────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="hero min-h-screen bg-base-100">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <div className="avatar mb-8">
              <div className="w-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2 shadow-xl">
                <img src="/logo.svg" alt="Linda Logo" />
              </div>
            </div>
            <h1 className="text-5xl font-bold text-primary mb-4">Linda</h1>
            <div className="flex flex-col items-center gap-4">
              <span className="loading loading-spinner loading-lg text-primary"></span>
              <p className="text-lg opacity-70">Initializing secure session</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Login screen ──────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="hero min-h-screen bg-base-100">
        <div className="hero-content flex-col lg:flex-row-reverse gap-12">
          <div className="text-center lg:text-left max-w-lg">
            <h1 className="text-6xl font-black text-primary mb-6">Linda</h1>
            <p className="py-6 text-xl opacity-80 leading-relaxed">
              The next generation of private messaging.<br />
              Secure. Decentralized. Premium.
            </p>
            <div className="stats shadow bg-base-200 mt-4">
              <div className="stat">
                <div className="stat-title">Privacy</div>
                <div className="stat-value text-primary text-2xl">End-to-End</div>
              </div>
              <div className="stat">
                <div className="stat-title">Storage</div>
                <div className="stat-value text-secondary text-2xl">Local-First</div>
              </div>
            </div>
          </div>
          
          <div className="card shrink-0 w-full max-w-sm shadow-2xl bg-base-200 border border-white/5">
            <div className="card-body gap-8">
              <div className="flex justify-center">
                <div className="avatar">
                  <div className="w-20 rounded-full bg-base-300 p-4 border-2 border-primary/20">
                    <img src="/logo.svg" alt="Logo" />
                  </div>
                </div>
              </div>
              
              <div className="card-actions justify-center">
                <ShogunButton />
              </div>
              
              <div className="divider opacity-50 text-xs">COMMUNITY</div>
              
              <div className="grid grid-cols-3 gap-2">
                <a href="https://github.com/scobru/shogun-linda" target="_blank" className="btn btn-ghost btn-xs">GitHub</a>
                <a href="https://shogun-eco.xyz" target="_blank" className="btn btn-ghost btn-xs">Web</a>
                <a href="https://t.me/shogun_eco" target="_blank" className="btn btn-ghost btn-xs">TG</a>
              </div>
            </div>
          </div>
        </div>
        
        <div className="absolute bottom-4 text-xs opacity-30">
          Built with ❤️ by Scobru
        </div>

        {notification && (
          <div className="toast toast-top toast-end">
            <div className={`alert ${notification.type === "error" ? "alert-error" : "alert-success"} shadow-lg`}>
              <span>{notification.msg}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-base-100 relative">
      <Routes>
        <Route element={
          <Layout sidebarProps={{
            userNick, username: username || "", userAvatar, contacts, recipient,
            setRecipient: (id: string) => { setRecipient(id); if (id) navigate(`/chat/${id}`); else navigate("/"); },
            contactProfiles, unreadCounts, handleDeleteContact, setShowCreateGroup,
            signalService, groupService, showNotification, saveContact, requestNotifications,
          }} />
        }>
          <Route path="/" element={
            <ChatView
              recipient=""
              setRecipient={(id) => { setRecipient(id); if (id) navigate(`/chat/${id}`); }}
              contactProfiles={contactProfiles} typingStatuses={typingStatuses} contactErrors={contactErrors}
              pinnedMessages={pinnedMessages} messages={messages} myRole={myRole} userAvatar={userAvatar}
              userNick={userNick} username={username || ""} message={message} setMessage={setMessage}
              handleSendMessage={handleSendMessage} handleTyping={handleTyping} handleManualReset={handleManualReset}
              handlePinMessage={handlePinMessage} handleReportMessage={handleReportMessage} handleDeleteMessage={handleDeleteMessage}
              setShowGroupSettings={setShowGroupSettings}
            />
          } />
          <Route path="/chat/:id" element={
            <ChatWrapper
              recipient={recipient}
              setRecipient={(id) => {
                setRecipient(id);
                if (id) navigate(`/chat/${id}`);
                else navigate("/");
              }}
              contactProfiles={contactProfiles}
              typingStatuses={typingStatuses}
              contactErrors={contactErrors}
              pinnedMessages={pinnedMessages}
              messages={messages}
              myRole={myRole}
              userAvatar={userAvatar}
              userNick={userNick}
              username={username || ""}
              message={message}
              setMessage={setMessage}
              handleSendMessage={handleSendMessage}
              handleTyping={handleTyping}
              handleManualReset={handleManualReset}
              handlePinMessage={handlePinMessage}
              handleReportMessage={handleReportMessage}
              handleDeleteMessage={handleDeleteMessage}
              setShowGroupSettings={setShowGroupSettings}
            />
          } />
          <Route path="/profile" element={
            <UserProfile
              db={db} username={username || ""} currentNick={userNick || username || ""}
              currentUniqueUsername={userUniqueUsername} currentAvatar={userAvatar}
              handleLogout={handleLogout} showNotification={showNotification}
            />
          } />
          <Route path="/settings" element={<Settings showNotification={showNotification} />} />
        </Route>
      </Routes>
      
      {notification && (
        <div className="toast toast-top toast-end z-max">
          <div className={`alert ${notification.type === "error" ? "alert-error" : "alert-success"} shadow-xl border border-white/5`}>
            <span>{notification.msg}</span>
          </div>
        </div>
      )}

      {showGroupSettings && groupService && <GroupSettings groupId={showGroupSettings} groupService={groupService} db={db} onClose={() => setShowGroupSettings(null)} showNotification={showNotification} />}
      {showCreateGroup && groupService && (
        <GroupCreationModal
          groupService={groupService} onClose={() => setShowCreateGroup(false)}
          onCreated={(groupId) => {
            setContacts((prev) => !prev.includes(groupId) ? [...prev, groupId] : prev);
            saveContact(groupId);
            setRecipient(groupId);
            navigate(`/chat/${groupId}`);
          }}
          showNotification={showNotification}
        />
      )}
    </div>
  );
};

const ChatWrapper: React.FC<{
  recipient: string;
  setRecipient: (id: string) => void;
  contactProfiles: Record<string, { avatar?: string; nickname?: string; uniqueUsername?: string }>;
  typingStatuses: Record<string, number>;
  contactErrors: Record<string, boolean>;
  pinnedMessages: Record<string, Set<string>>;
  messages: Record<string, any[]>;
  myRole: string | null;
  userAvatar: string | null;
  userNick: string;
  username: string;
  message: string;
  setMessage: (msg: string) => void;
  handleSendMessage: () => void;
  handleTyping: () => void;
  handleManualReset: () => void;
  handlePinMessage: (msgId: string, pin: boolean) => void;
  handleReportMessage: (msgId: string) => void;
  handleDeleteMessage: (msgId: string, senderPub?: string) => void;
  setShowGroupSettings: (id: string | null) => void;
}> = (props) => {
  const { id } = useParams();
  useEffect(() => {
    if (id && id !== props.recipient) props.setRecipient(id);
  }, [id, props.recipient, props.setRecipient]);

  return <ChatView {...props} />;
};

const App: React.FC = () => {
  const [coreContext, setCoreContext] = useState<any>(null);
  const [dbInstance, setDbInstance] = useState<DataBase | null>(null);

  const relays = [
    "https://gun.defucc.me/gun",
    "https://gun.o8.is/gun",
    "https://shogun-relay.scobrudot.dev/gun",
    "https://relay.peer.ooo/gun",
  ];

  // Initialize ShogunCore with hardcoded relays
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Initialize Gun and DataBase with the dynamic peer list
        const gunInstance = new Gun({
          peers: relays,
          localStorage: false,
          radisk: false,
        });

        window.gun = gunInstance;

        // @ts-ignore - DataBase handles IGunInstance correctly internally
        const db = new DataBase(gunInstance);

        const result = await shogunConnector({
          appName: "Shogun Linda",
          gunInstance: gunInstance as any,
          webauthn: { enabled: true },
          web3: { enabled: true },
          nostr: { enabled: true },
          showWebauthn: true,
          showMetamask: true,
          showNostr: true,
          showSeedLogin: true,
        });

        if (mounted) {
          setDbInstance(result.core.db);
          setCoreContext(result);

          // Add debug methods to window for testing
          if (import.meta.env.DEV && typeof window !== "undefined") {
            setTimeout(() => {
              window.shogunDebug = {
                clearAllData: () => {
                  if (result.core.storage) {
                    result.core.storage.clearAll();
                  }
                  if (typeof sessionStorage !== "undefined") {
                    sessionStorage.removeItem("gunSessionData");
                  }
                },
                sdk: result.core,
                gun: result.core.gun,
                relays: relays,
              };
              window.gun = result.core.gun;
              window.shogun = result.core;
            }, 1000);
          }

          // Auto-restore session from db/store when core initializes
          setTimeout(() => {
            if (
              result.core &&
              typeof result.core.db?.restoreSession === "function"
            ) {
              (async () => {
                const res = await result.core.db.restoreSession();
                if (res && res.error)
                  console.error("Session restore failed:", res.error);
              })();
            }
          }, 300);
        }
      } catch (err) {
        console.error("Failed to init shogunConnector:", err);
      }
    };
    init();

    return () => {
      mounted = false;
    };
  }, []);

  if (!coreContext || !dbInstance) {
    return (
      <div className="hero min-h-screen bg-base-100">
        <div className="hero-content text-center">
          <div className="max-w-md flex flex-col items-center gap-8">
            <div className="avatar">
              <div className="w-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2 shadow-2xl animate-pulse">
                <img src="/logo.svg" alt="Linda Logo" />
              </div>
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-black tracking-tighter text-primary">Linda</h1>
              <div className="flex items-center gap-3 justify-center">
                <span className="loading loading-infinity loading-md text-primary"></span>
                <p className="text-lg font-bold opacity-50 uppercase tracking-widest">Bootstrapping SDK</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ShogunButtonProvider
        core={coreContext.core}
        options={coreContext.options}
        onLoginSuccess={(data) => {
          console.log("Logged in!", data);
        }}
        onSignupSuccess={(data) => {
          console.log("Signed up!", data);
        }}
        onError={(err) => {
          console.error("Auth error", err);
        }}
      >
        <AppContent db={dbInstance} />
      </ShogunButtonProvider>
    </BrowserRouter>
  );
};

export default App;
