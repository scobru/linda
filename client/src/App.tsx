import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { GroupSettingsPage } from "./pages/GroupSettingsPage";
import { GroupCreationPage } from "./pages/GroupCreationPage";
import Gun from "gun";
import type { IGunInstance } from "gun";
import "gun/sea";
import "gun/lib/yson";
import "gun/lib/rindexed";
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
import { useSignalInit } from "./hooks/useSignalInit";
import { useSignalMessaging } from "./hooks/useSignalMessaging";
import { GroupService, type Role } from "./GroupService";
import { CallingService } from "./CallingService";
import type { CallStatus } from "./CallingService";
import { CallingOverlay } from "./components/CallingOverlay";
import { FileTransferService } from "./FileTransferService";
import type { TransferStatus } from "./FileTransferService";

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
  
  // ── Call State ──
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callData, setCallData] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const callingServiceRef = useRef<CallingService | null>(null);

  // ── File Transfer State ──
  const fileTransferServiceRef = useRef<FileTransferService | null>(null);
  const [transferStatus, setTransferStatus] = useState<Record<string, TransferStatus>>({});
  const [transferProgress, setTransferProgress] = useState<Record<string, number>>({});
  const [transferBlobs, setTransferBlobs] = useState<Record<string, Blob>>({});
  const [transferOffers, setTransferOffers] = useState<Record<string, any>>({});

  const [notification, setNotification] = useState<{
    msg: string;
    type: "info" | "error";
  } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const showNotification = useCallback(
    (msg: string, type: "info" | "error" = "info") => {
      setNotification({ msg, type });
      setTimeout(() => setNotification(null), 3000);
    },
    [],
  );

  // ── Hooks ──
  const { signalService, groupService, isLoading, userUniqueUsername } =
    useSignalInit(db, showNotification);

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
    handleFixSync: _unused,
    handleClearChat,
    saveContact,
    removeContact,
    saveMessages,
  } = useSignalMessaging(
    db,
    userPub || null,
    signalService,
    groupService,
    recipient,
    setRecipient,
  );

  // ── Sync Route & Recipient ──
  useEffect(() => {
    const chatMatch = location.pathname.match(/\/chat\/([^\/]+)/);
    const idFromRoute = chatMatch ? chatMatch[1] : "";
    if (idFromRoute !== recipient) setRecipient(idFromRoute);
  }, [location.pathname]);

  const [myRole, setMyRole] = useState<Role | null>(null);
  useEffect(() => {
    if (
      recipient &&
      groupService &&
      recipient.length === 36 &&
      recipient.includes("-")
    ) {
      groupService.getMemberRole(recipient, userPub || "").then(setMyRole);
    } else {
      setMyRole(null);
    }
  }, [recipient, groupService, userPub]);

  // ── Profile Logic ──
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userNick, setUserNick] = useState<string>("");
  const [contactProfiles, setContactProfiles] = useState<
    Record<
      string,
      { avatar?: string; nickname?: string; uniqueUsername?: string }
    >
  >({});

  useEffect(() => {
    if (isLoggedIn && db && userPub) {
      const callingService = new CallingService(window.gun as any, userPub);
      
      callingService.onStatusChange = (status: CallStatus, data?: any) => {
        setCallStatus(status);
        if (data) setCallData(data);
        if (status === 'idle') {
          setRemoteStream(null);
          setCallData(null);
        }
      };

      callingService.onRemoteStream = (stream: MediaStream) => {
        setRemoteStream(stream);
      };

      callingServiceRef.current = callingService;

      // Initialize FileTransferService
      const fileTransferService = new FileTransferService(window.gun as any, userPub);
      
      fileTransferService.onStatusChange = (status, progress, data) => {
        if (data?.metaId) {
          setTransferStatus(prev => ({ ...prev, [data.metaId]: status }));
          if (progress !== undefined) setTransferProgress(prev => ({ ...prev, [data.metaId]: progress }));
          if (status === 'incoming' && data?.sdp) {
            setTransferOffers(prev => ({ ...prev, [data.metaId]: data.sdp }));
          }
        }
      };

      fileTransferService.onFileReceived = (blob, _name, _mimeType) => {
        // We might want to correlate this with a metaId later, 
        // for now we'll store it by a generic key or handle it via metaId if provided.
        // For simplicity in this iteration, we use the last active download or a map.
        setTransferBlobs(prev => ({ ...prev, last: blob })); 
      };

      fileTransferServiceRef.current = fileTransferService;

      return () => {
        callingService.endCall(false);
      };
    }
  }, [isLoggedIn, db, userPub]);

  useEffect(() => {
    if (!isLoggedIn) return;
    const pub = db.getUserPub();
    if (pub) {
      db.On(
        `~${pub}/profile/avatar`,
        (data: any) => typeof data === "string" && setUserAvatar(data),
        "avatar_self",
      );
      db.On(
        `~${pub}/profile/nickname`,
        (data: any) => typeof data === "string" && setUserNick(data),
        "nick_self",
      );
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
          db.On(
            `signal_rooms/${contactId}/meta`,
            (data: any) => {
              if (data && typeof data === "object") {
                setContactProfiles((prev) => ({
                  ...prev,
                  [contactId]: {
                    ...prev[contactId],
                    nickname: data.name,
                    avatar: data.avatar,
                  },
                }));
              }
            },
            `group_meta_${contactId}`,
          );
        } else {
          let cPub = contactId;
          if (contactId.length < 43 || contactId.startsWith("@")) {
            cPub = await signalService.getPubKeyFromUsername(contactId);
          }
          if (cPub) {
            // Priority 1: User's profile graph (most accurate if synced)
            db.On(
              `~${cPub}/profile/avatar`,
              (data: any) =>
                typeof data === "string" &&
                setContactProfiles((prev) => ({
                  ...prev,
                  [contactId]: { ...prev[contactId], avatar: data },
                })),
              `avatar_${cPub}`,
            );
            db.On(
              `~${cPub}/profile/nickname`,
              (data: any) =>
                typeof data === "string" &&
                setContactProfiles((prev) => ({
                  ...prev,
                  [contactId]: { ...prev[contactId], nickname: data },
                })),
              `nick_${cPub}`,
            );

            // Priority 2: Public alias registry (fallback/faster sync)
            db.On(
              `signal_aliases/${cPub}`,
              (data: any) => {
                if (data && typeof data === "object") {
                  setContactProfiles((prev) => {
                    const existing = prev[contactId] || {};
                    return {
                      ...prev,
                      [contactId]: {
                        ...existing,
                        nickname: existing.nickname || data.alias,
                        uniqueUsername:
                          existing.uniqueUsername || data.uniqueUsername,
                      },
                    };
                  });
                }
              },
              `alias_fallback_${cPub}`,
            );
          }
        }
      } catch (e) {}
    });
  }, [contacts, signalService, db]);

  const requestNotifications = () => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(console.warn);
    }
  };

  const handleLogout = async () => {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
    logout();
  };

  const handleSendMessage = async (msg?: string, audio?: string, fileMetadata?: any) => {
    if (!recipient || (!msg && !message && !audio && !fileMetadata)) return;
    try {
      await baseSendMessage(msg || message, audio, fileMetadata);
      if (!audio && !fileMetadata) setMessage("");
    } catch (err: any) {
      showNotification(
        "Send failed: " + (err.message || "Unknown error"),
        "error",
      );
    }
  };

  const handleDeleteContact = async (
    contactKey: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Delete this conversation and all history?")) return;

    // If it's a group, we should leave it in GunDB too
    const isGroup = contactKey.length === 36 && contactKey.includes("-");
    if (isGroup && groupService) {
      try {
        await groupService.leaveGroup(contactKey);
      } catch (err) {
        console.warn("Failed to leave group during deletion:", err);
      }
    }

    setContacts((prev) => prev.filter((c) => c !== contactKey));
    removeContact(contactKey);
    if (recipient === contactKey) {
      setRecipient("");
      navigate("/");
    }
    setMessages((prev) => {
      const next = { ...prev };
      delete next[contactKey];
      if (userPub) saveMessages(userPub, next);
      return next;
    });
    setContactErrors((prev) => {
      const next = { ...prev };
      delete next[contactKey];
      return next;
    });
    showNotification(
      isGroup ? "Group removed" : "Conversation deleted",
      "info",
    );
  };

  const handleInitiateCall = async (video: boolean) => {
    if (!recipient || !callingServiceRef.current) return;
    setIsVideoCall(video);
    
    // Resolve recipient pubkey if it's a username
    let pub = recipient;
    if (recipient.length < 30 || recipient.startsWith("@")) {
      pub = await signalService?.getPubKeyFromUsername(recipient) || recipient;
    }
    
    callingServiceRef.current.initiateCall(pub, video);
  };

  const handleFixSync = async () => {
    if (!recipient || !signalService || !userPub) return;
    if (!window.confirm("Force-recreate secure session?")) return;
    try {
      await signalService.resetSession(recipient);
      // Re-publish our own bundle to fix potential outgoing sync issues
      await signalService.republishBundle().catch(() => {});
      setContactErrors((prev) => ({ ...prev, [recipient]: false }));
      showNotification("Sincronizzazione avviata.", "info");
      const pub = await signalService.getPubKeyFromUsername(recipient);
      const ping = await signalService.encryptMessage(recipient, "PING_HEAL");
      db.Set(`signal_v3_inbox_${pub}`, {
        sender: userPub,
        type: ping.type,
        body: ping.body,
        timestamp: new Date().toISOString(),
      } as any);
    } catch (err) {
      showNotification("Reset failed.", "error");
    }
  };

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
      showNotification(
        isPinned ? "Message pinned" : "Message unpinned",
        "info",
      );
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
      <div className="hero min-h-dvh bg-base-100 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-secondary/5 opacity-50"></div>
        <div className="hero-content text-center z-10">
          <div className="max-w-md flex flex-col items-center">
            <div className="avatar mb-10">
              <div className="w-28 rounded-full ring ring-primary/20 ring-offset-base-100 ring-offset-4 shadow-2xl shadow-primary/20 bg-base-200/50 backdrop-blur-md p-6">
                <img
                  src="/logo.svg"
                  alt="Linda Logo"
                  className="animate-pulse"
                />
              </div>
            </div>
            <h1 className="text-5xl font-black text-primary mb-6 tracking-tighter">
              Linda
            </h1>
            <div className="flex flex-col items-center gap-6 p-8 bg-base-200/40 backdrop-blur-xl rounded-[2rem] border border-white/5 shadow-2xl">
              <span className="loading loading-spinner loading-lg text-primary"></span>
              <p className="text-sm font-black uppercase tracking-[0.3em] opacity-40">
                Initializing secure session
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Login screen ──────────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <div className="hero min-h-dvh bg-base-100 relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--color-primary),_transparent_25%)] opacity-[0.03]"></div>
        <div className="hero-content flex-col lg:flex-row-reverse gap-12 lg:gap-24 z-10 px-6">
          <div className="text-center lg:text-left max-w-lg">
            <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black text-primary mb-8 tracking-tightest">
              Linda
            </h1>
            <p className="py-6 text-xl sm:text-2xl opacity-80 leading-relaxed font-medium">
              The next generation of private messaging.
              <br />
              <span className="text-primary font-bold">
                Secure. Decentralized. Premium.
              </span>
            </p>
            <div className="grid grid-cols-2 gap-4 mt-8">
              <div className="p-6 bg-base-200/40 backdrop-blur-xl rounded-2xl border border-white/5 shadow-xl">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1 text-primary">
                  Privacy
                </div>
                <div className="text-xl font-bold">End-to-End</div>
              </div>
              <div className="p-6 bg-base-200/40 backdrop-blur-xl rounded-2xl border border-white/5 shadow-xl">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1 text-secondary">
                  Storage
                </div>
                <div className="text-xl font-bold">Local-First</div>
              </div>
            </div>
          </div>

          <div className="card shrink-0 w-full max-w-sm shadow-3xl bg-base-200/40 backdrop-blur-2xl border border-white/10 rounded-[2.5rem]">
            <div className="card-body p-10 pb-16 gap-10">
              <div className="flex justify-center">
                <div className="avatar">
                  <div className="w-24 rounded-full bg-base-300/50 p-6 border-2 border-primary/20 shadow-inner">
                    <img src="/logo.svg" alt="Logo" />
                  </div>
                </div>
              </div>

              <div className="card-actions justify-center">
                <ShogunButton />
              </div>

              <div className="divider opacity-30 text-[10px] font-black tracking-[0.2em] font-mono">
                ECOSYSTEM
              </div>

              <div className="grid grid-cols-3 gap-2">
                <a
                  href="https://github.com/scobru/shogun-linda"
                  target="_blank"
                  className="btn btn-ghost btn-xs rounded-lg hover:bg-primary/10 transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="https://shogun-eco.xyz"
                  target="_blank"
                  className="btn btn-ghost btn-xs rounded-lg hover:bg-primary/10 transition-colors"
                >
                  Web
                </a>
                <a
                  href="https://t.me/shogun_eco"
                  target="_blank"
                  className="btn btn-ghost btn-xs rounded-lg hover:bg-primary/10 transition-colors"
                >
                  Telegram
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-black tracking-widest opacity-20 uppercase">
          Crafted by Scobru &copy; 2026
        </div>

        {notification && (
          <div className="toast toast-top toast-end z-[100]">
            <div
              className={`alert ${notification.type === "error" ? "alert-error" : "alert-success"} shadow-lg`}
            >
              <span>{notification.msg}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-dvh w-screen overflow-hidden bg-base-100 relative">
      <Routes>
        <Route
          element={
            <Layout
              sidebarProps={{
                userNick,
                username: username || "",
                userAvatar,
                contacts,
                recipient,
                setRecipient: (id: string) => {
                  setRecipient(id);
                  if (id) navigate(`/chat/${id}`);
                  else navigate("/");
                },
                contactProfiles,
                unreadCounts,
                handleDeleteContact,
                signalService,
                groupService,
                showNotification,
                saveContact,
                requestNotifications,
              }}
            />
          }
        >
          <Route
            path="/"
            element={
              <ChatView
                recipient=""
                setRecipient={(id) => {
                  setRecipient(id);
                  if (id) navigate(`/chat/${id}`);
                }}
                groupService={groupService}
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
                handleFixSync={handleFixSync}
                handlePinMessage={handlePinMessage}
                handleReportMessage={handleReportMessage}
                handleDeleteMessage={handleDeleteMessage}
                setShowGroupSettings={(id) =>
                  id ? navigate(`/chat/${id}/settings`) : null
                }
                onInitiateCall={handleInitiateCall}
                fileTransferService={fileTransferServiceRef.current}
                transferStatuses={transferStatus}
                transferProgress={transferProgress}
                                transferBlobs={transferBlobs}
                transferOffers={transferOffers}
                handleClearChat={handleClearChat}
              />
            }
          />
          <Route
            path="/chat/:id"
            element={
              <ChatWrapper
                recipient={recipient}
                setRecipient={(id) => {
                  setRecipient(id);
                  if (id) navigate(`/chat/${id}`);
                  else navigate("/");
                }}
                groupService={groupService}
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
                handleFixSync={handleFixSync}
                handlePinMessage={handlePinMessage}
                handleReportMessage={handleReportMessage}
                handleDeleteMessage={handleDeleteMessage}
                setShowGroupSettings={(id) =>
                  id ? navigate(`/chat/${id}/settings`) : null
                }
                                onInitiateCall={handleInitiateCall}
                fileTransferService={fileTransferServiceRef.current}
                transferStatuses={transferStatus}
                transferProgress={transferProgress}
                                transferBlobs={transferBlobs}
                transferOffers={transferOffers}
                handleClearChat={handleClearChat}
              />
            }
          />
          <Route
            path="/profile"
            element={
              <UserProfile
                db={db}
                username={username || ""}
                currentNick={userNick || username || ""}
                currentUniqueUsername={userUniqueUsername}
                currentAvatar={userAvatar}
                handleLogout={handleLogout}
                showNotification={showNotification}
              />
            }
          />
          <Route
            path="/settings"
            element={<Settings showNotification={showNotification} />}
          />
          <Route
            path="/chat/:id/settings"
            element={
              <GroupSettingsPage
                groupService={groupService!}
                db={db}
                showNotification={showNotification}
              />
            }
          />
          <Route
            path="/create-group"
            element={
              <GroupCreationPage
                groupService={groupService!}
                onCreated={(groupId) => {
                  setContacts((prev) =>
                    !prev.includes(groupId) ? [...prev, groupId] : prev,
                  );
                  saveContact(groupId);
                  setRecipient(groupId);
                  navigate(`/chat/${groupId}`);
                }}
                showNotification={showNotification}
              />
            }
          />
        </Route>
      </Routes>

      {notification && (
        <div className="toast toast-top toast-end z-[100]">
          <div
            className={`alert ${notification.type === "error" ? "alert-error" : "alert-success"} shadow-xl border border-white/5`}
          >
            <span>{notification.msg}</span>
          </div>
        </div>
      )}

      <CallingOverlay
        status={callStatus}
        localStream={callingServiceRef.current?.getLocalStream() || null}
        remoteStream={remoteStream}
        recipientProfile={callData?.from ? contactProfiles[callData.from] || { nickname: callData.from } : (recipient ? contactProfiles[recipient] : null)}
        onAccept={() => callingServiceRef.current?.acceptCall(callData?.signal)}
        onReject={() => callingServiceRef.current?.rejectCall()}
        onEnd={() => callingServiceRef.current?.endCall()}
        video={isVideoCall}
      />
    </div>
  );
};

const ChatWrapper: React.FC<{
  recipient: string;
  setRecipient: (id: string) => void;
  groupService: GroupService | null;
  contactProfiles: Record<
    string,
    { avatar?: string; nickname?: string; uniqueUsername?: string }
  >;
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
  handleSendMessage: (msg?: string, audio?: string, fileMetadata?: any) => void;
  handleTyping: () => void;
  handleFixSync: () => void;
  handlePinMessage: (msgId: string, pin: boolean) => void;
  handleReportMessage: (msgId: string) => void;
  handleDeleteMessage: (msgId: string, senderPub?: string) => void;
  setShowGroupSettings: (id: string | null) => void;
  onInitiateCall: (video: boolean) => void;
  fileTransferService: FileTransferService | null;
  transferStatuses: Record<string, TransferStatus>;
  transferProgress: Record<string, number>;
  transferBlobs: Record<string, Blob>;
  transferOffers: Record<string, any>;
  handleClearChat: (id: string) => void;
}> = (props) => {
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
        console.log("Relays: ", relays);
        // Initialize Gun and DataBase with the dynamic peer list
        const gunInstance = Gun({
          peers: relays,
          localStorage: false,
          radisk:true,
          file: "radata",
        });

        window.gun = gunInstance;

        console.log("Gun instance: ", gunInstance);

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
      <div className="hero min-h-dvh bg-base-100 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"></div>
        <div className="hero-content text-center z-10">
          <div className="max-w-md flex flex-col items-center gap-10">
            <div className="avatar">
              <div className="w-28 rounded-full ring ring-primary ring-offset-base-100 ring-offset-4 shadow-3xl shadow-primary/20 bg-base-200/40 backdrop-blur-md p-6">
                <img
                  src="/logo.svg"
                  alt="Linda Logo"
                  className="animate-pulse"
                />
              </div>
            </div>
            <div className="space-y-6 p-10 bg-base-200/40 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 shadow-2xl">
              <h1 className="text-4xl font-black tracking-tighter text-primary">
                Linda
              </h1>
              <div className="flex flex-col items-center gap-4 py-2">
                <span className="loading loading-infinity loading-lg text-primary"></span>
                <p className="text-xs font-black uppercase tracking-[0.4em] opacity-40">
                  Bootstrapping SDK
                </p>
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
