import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";

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
import "gun/lib/webrtc";
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
import { SignalService } from "./SignalService";
import { WormholeService } from "./WormholeService";
import { QrScannerModal } from "./components/QrScannerModal";
import { FileTransferService } from "./FileTransferService";

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
  const { isLoggedIn, userPub, logout } = useShogun();
  const username = (db.getCurrentUser()?.user as any)?._?.sea?.pub ? (db.getCurrentUser()?.user as any)?.username : "";
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");

  // ── Wormhole State ──

  // ── Wormhole State ──
  const wormholeServiceRef = useRef<WormholeService | null>(null);
  const [wormholeStatuses, setWormholeStatuses] = useState<Record<string, string>>({});

  // ── File Transfer State ──
  const fileTransferServiceRef = useRef<FileTransferService | null>(null);
  const [transferProgress, setTransferProgress] = useState<
    Record<string, number>
  >({});
  const [transferBlobs, setTransferBlobs] = useState<Record<string, Blob>>({});
  const processedSignalsRef = useRef<Set<string>>(new Set());

  const [notification, setNotification] = useState<{ msg: string; type: "info" | "error" } | null>(null);
  const [showLoginScanner, setShowLoginScanner] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const showNotification = useCallback((msg: string, type: "info" | "error" = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);



  const handleLoginQrScan = async (data: string) => {
    setShowLoginScanner(false);
    if (!data) return;

    try {
      console.log("Scanned Data:", data);
      showNotification("Processing scan...", "info");

      // Data might be a pure JSON string or a Magic Link URL
      let jsonStr = data.trim();
      if (jsonStr.includes("?session=")) {
        const urlSplit = jsonStr.split("?session=");
        const session = urlSplit[1]?.split("&")[0];
        if (session) jsonStr = decodeURIComponent(escape(window.atob(session)));
      }

      const pair = JSON.parse(jsonStr);
      if (pair.pub && pair.priv) {
        const username = pair.username || pair.pub;
        await db.loginWithPair(username, pair);
        showNotification("Logged in via QR Scan!", "info");
      } else {
        throw new Error("Invalid key pair structure");
      }
    } catch (err: any) {
      console.error("Scan Error:", err);
      showNotification(`Invalid QR: ${err.message || "Unknown error"}`, "error");
    }
  };

  // ── Hooks ──
  const { signalService, groupService, isLoading, userUniqueUsername } =
    useSignalInit(db, showNotification);

  // Sync ref for async listeners
  const signalServiceRef = useRef<SignalService | null>(null);
  useEffect(() => {
    signalServiceRef.current = signalService;
  }, [signalService]);

  const fileTransferServiceInst = useMemo(() => {
    if (!isLoggedIn || !userPub) return null;
    const service = new FileTransferService(window.gun as any, userPub);

    service.onFileReceived = (blob, _name, _mimeType, metaId) => {
      if (metaId) {
        setTransferBlobs((prev) => ({ ...prev, [metaId]: blob }));
      } else {
        setTransferBlobs((prev) => ({ ...prev, last: blob }));
      }
    };
    service.onStats = (stats) => {
      console.log(`[FileTransfer] Stats:`, stats);
    };
    fileTransferServiceRef.current = service;
    return service;
  }, [isLoggedIn, userPub]);

  const wormholeServiceInst = useMemo(() => {
    if (!isLoggedIn || !db.gun) return null;
    const service = new WormholeService(db.gun);
    service.onStatusChange = ({ code, status, message, fileData }) => {
      console.log(`[Wormhole] ${code} status: ${status} - ${message}`);
      setWormholeStatuses((prev) => ({ ...prev, [code]: status }));
      if (fileData?.blob) {
        setTransferBlobs((prev) => ({ ...prev, [code]: fileData.blob }));
      }
    };
    service.onProgress = ({ progress, code }: any) => {
      if (code) {
        setTransferProgress((prev) => ({ ...prev, [code]: progress }));
      }
    };
    wormholeServiceRef.current = service;

    // Auto-cleanup stale transfers on initialization (older than 1h)
    const relays = [
      import.meta.env.VITE_RELAY_URL,
      'https://shogun-relay.scobrudot.dev',
      'https://relay.peer.ooo'
    ].filter(Boolean) as string[];
    const authToken = import.meta.env.VITE_AUTH_TOKEN || 'shogun2025';

    (async () => {
      for (const relayUrl of relays) {
        try {
          await service.cleanupStaleTransfers(relayUrl, authToken, 3600000);
          console.log(`[App] Wormhole cleanup success via: ${relayUrl}`);
          break;
        } catch (e) { }
      }
    })();

    return service;
  }, [isLoggedIn, db.gun]);

  // Update signal sender whenever signalService becomes available
  useEffect(() => {
    if (fileTransferServiceInst && signalService) {
      const sendUnifiedSignal = async (toPub: string, signal: any, prefix: string) => {
        try {
          db.gun.get(`~${toPub}`).once(() => { });
          let cert;
          for (let i = 0; i < 3; i++) {
            try {
              cert = await signalService.getInboxCertificate(toPub);
              if (cert) break;
            } catch (e) {
              if (i === 2) throw e;
              await new Promise(r => setTimeout(r, 1000));
            }
          }
          const payload = prefix + JSON.stringify(signal);
          const cipher = await signalService.encryptMessage(toPub, payload);
          const signalKey = `${userPub!.substring(0, 8)}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

          // Secure SEA-compliant inbox soul (~toPub/signal_inbox_v13)
          const targetInbox = db.gun.user(toPub).get(`signal_inbox_v13`);

          const doSend = (sendCert: string | null, retryLabel: string): Promise<boolean> => {
            return new Promise((resolve) => {
              const putOptions = (toPub === userPub) ? {} : { opt: { cert: sendCert } };
              const timeout = setTimeout(() => {
                console.warn(`[App] ${retryLabel} signal ${signal.type} put timeout (15s) for ${toPub.substring(0, 8)}`);
                resolve(true);
              }, 15000);

              targetInbox.get(signalKey).put(
                {
                  sender: userPub,
                  type: cipher.type,
                  body: cipher.body,
                  timestamp: new Date().toISOString(),
                } as any,
                (ack: any) => {
                  clearTimeout(timeout);
                  if (ack.err && typeof ack.err === 'string') {
                    if (ack.err.includes('Certificate')) {
                      resolve(false);
                    } else {
                      resolve(true);
                    }
                  } else {
                    console.log(`[App] ${retryLabel} signal delivered to ${toPub.substring(0, 8)}`);
                    resolve(true);
                  }
                },
                putOptions as any
              );
            });
          };

          const delivered = await doSend(cert ?? null, '[1st]');
          if (!delivered && toPub !== userPub) {
            signalService.clearCertCache(toPub);
            const freshCert = await signalService.getInboxCertificate(toPub).catch(() => null);
            if (freshCert) {
              const retryDelivered = await doSend(freshCert, '[Retry]');
              if (!retryDelivered) {
                // If even retry fails with certificate error, surface it to the UI
                console.error(`[App] Persistent certificate failure for ${toPub.substring(0, 8)}.`);
              }
            } else {
              console.error(`[App] Failed to fetch valid certificate for ${toPub.substring(0, 8)} after 1st attempt failure.`);
            }
          }
        } catch (e: any) {
          console.warn("[App] Failed to send secure P2P signal:", e.message);
        }
      };

      fileTransferServiceInst.setSignalSender((toPub: string, signal: any) => sendUnifiedSignal(toPub, signal, " Linda:SIGNAL:"));
    }
  }, [fileTransferServiceInst, signalService, db, userPub]);

  // ── Signaling Listener ──
  useEffect(() => {
    if (!isLoggedIn || !userPub || !fileTransferServiceInst) return;

    const inboxSoul = `~${userPub}/signal_inbox_v13`;
    console.log(`[App] Starting securely authorized signaling listener on ${inboxSoul}`);

    db.gun.get(inboxSoul).map().on(async (data: any, gunKey: string) => {
      if (!data || typeof data !== 'object' || processedSignalsRef.current.has(gunKey)) return;
      if (!data.sender || !data.body || data.type === undefined) return;

      processedSignalsRef.current.add(gunKey);

      try {
        let currentService = signalServiceRef.current;
        if (!currentService) {
          for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (signalServiceRef.current) {
              currentService = signalServiceRef.current;
              break;
            }
          }
        }
        if (!currentService) return;

        await Promise.race([
          currentService.waitReady(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SignalService timeout')), 5000))
        ]);

        const plaintext = await currentService.decryptMessage(data.sender, { type: data.type, body: data.body });
        if (!plaintext || typeof plaintext !== 'string') return;

        const trimmed = plaintext.trim();
        if (trimmed === "PING_HEAL") {
          currentService.republishBundle().catch(() => { });
          return;
        }

        if (trimmed.startsWith(" Linda:SIGNAL:")) {
          const signal = JSON.parse(trimmed.substring(" Linda:SIGNAL:".length));
          if (signal) {
            const isSameInstance = signal.clientId === fileTransferServiceInst.getClientId();
            if (data.sender === userPub && isSameInstance) return;
            fileTransferServiceInst.handleIncomingSignal(data.sender, signal);
          }
        } else if (trimmed.startsWith("{")) {
          // Legacy support or fallback - handle signals without prefix
          try {
            const signal = JSON.parse(trimmed);
            if (signal) {
              // File transfer signals use prefixed types: file_offer, file_answer, etc.
              fileTransferServiceInst.handleIncomingSignal(data.sender, signal);
            }
          } catch (e) { }
        }

        // Cleanup signal node from GunDB after processing
        // We use a longer timeout (60s) for file transfer signals to ensure reliability on slow mobile networks
        const cleanupDelay = trimmed.startsWith(" Linda:SIGNAL:") ? 60000 : 20000;
        setTimeout(() => {
          if (userPub) db.gun.user(userPub).get('signal_inbox_v13').get(gunKey).put(null as any);
        }, cleanupDelay);
      } catch (e) {
        console.warn(`[App] Failed to process signal on ${gunKey}:`, e);
      }
    });

  }, [isLoggedIn, userPub, db, fileTransferServiceInst]);

  // ── GunDB Sync Kick (Mobile Reliability) ──
  useEffect(() => {
    if (!isLoggedIn || !userPub) return;

    // Periodically poke the inbox to ensure the Gun graph subscription remains active on mobile
    const kickInterval = setInterval(() => {
      console.log("[App] Sync Kick: Poking GunDB inbox...");
      db.gun.user(userPub).get('signal_inbox_v13').get('_poke').put(Date.now());
    }, 45000);

    return () => clearInterval(kickInterval);
  }, [isLoggedIn, userPub, db]);

  const {
    messages,
    setMessages,
    contacts,
    setContacts,
    typingStatuses,
    pinnedMessages,
    unreadCounts,
    handleTyping,
    handleSendMessage: baseSendMessage,
    handleFixSync: _unused,
    handleClearChat,
    saveContact,
    removeContact,
    saveMessages,
    trustedContacts,
    isContactsLoading,
    acceptContact,
    blockContact,
  } = useSignalMessaging(
    db,
    userPub || null,
    signalService,
    groupService,
    recipient,
    setRecipient
  );

  // ── Sync Route & Recipient ──
  useEffect(() => {
    const chatMatch = location.pathname.match(/\/chat\/([^\/]+)/);
    const idFromRoute = chatMatch ? chatMatch[1] : "";
    if (idFromRoute !== recipient) setRecipient(idFromRoute);
  }, [location.pathname, recipient]);

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

  // ── Universal Link Entry (Login & Add Friend) ──
  useEffect(() => {
    const url = new URL(window.location.href);
    const magic_login = url.searchParams.get("magic_login");
    const session = url.searchParams.get("session");
    const add = url.searchParams.get("add");

    const handleMagicLogin = async (data: string) => {
      try {
        showNotification("Authenticating via Magic Link...", "info");
        
        let jsonStr = "";
        try {
          // Attempt standard Base64 first
          jsonStr = window.atob(data);
        } catch (e) {
          // Fallback to UTF-8 safe Base64 (Linda legacy)
          jsonStr = decodeURIComponent(escape(window.atob(data)));
        }

        const payload = JSON.parse(jsonStr);
        let pair = payload;
        let usernameToUse = "";

        // Handle Shogun Standard Wrapper
        if (payload.type === "shogun-auth-pair" && payload.pair) {
          pair = payload.pair;
          usernameToUse = payload.username || "";
        }

        if (pair.pub && pair.priv) {
          const finalUsername = usernameToUse || pair.username || pair.pub;
          await db.loginWithPair(finalUsername, pair);
          showNotification(`Welcome back, ${finalUsername}!`, "info");
          
          // Clean the URL
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete("magic_login");
          nextUrl.searchParams.delete("session");
          window.history.replaceState({}, document.title, nextUrl.toString());
        }
      } catch (err) {
        console.error("Magic Link Login failed:", err);
        showNotification("Magic Link is invalid or expired", "error");
      }
    };

    if (magic_login && db && !isLoggedIn) {
      handleMagicLogin(magic_login);
    } else if (session && db && !isLoggedIn) {
      handleMagicLogin(session);
    }

    // 2. Handle Add Friend Link
    if (add && isLoggedIn && db) {
      if (add !== userPub) {
        saveContact(add);
        setRecipient(add);
        navigate(`/chat/${add}`);
        showNotification("Contact added via link!", "info");
      }
      // Clean the URL
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("add");
      window.history.replaceState({}, document.title, nextUrl.toString());
    }
  }, [db, isLoggedIn, userPub, saveContact, setRecipient, navigate, showNotification]);

  // ── Profile Logic ──
  const [userAvatar, setUserAvatar] = useState<string | null>(localStorage.getItem("linda_user_avatar"));
  const [userNick, setUserNick] = useState<string>(localStorage.getItem("linda_user_nick") || "");
  const [contactProfiles, setContactProfiles] = useState<
    Record<
      string,
      { avatar?: string; nickname?: string; uniqueUsername?: string }
    >
  >({});

  useEffect(() => {
    if (!isLoggedIn) {
      // Clear cache on logout
      localStorage.removeItem("linda_user_avatar");
      localStorage.removeItem("linda_user_nick");
      localStorage.removeItem("linda_user_unique_username");
      return;
    }
    const pub = db.getUserPub();
    if (pub) {
      db.On(
        `~${pub}/profile/avatar`,
        (data: any) => {
          if (typeof data === "string") {
            setUserAvatar(data);
            localStorage.setItem("linda_user_avatar", data);
          }
        },
        "avatar_self",
      );
      db.On(
        `~${pub}/profile/nickname`,
        (data: any) => {
          if (typeof data === "string") {
            setUserNick(data);
            localStorage.setItem("linda_user_nick", data);
          }
        },
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
      } catch (e) { }
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

  const handleSendMessage = async (
    msg?: string,
    audio?: string,
    fileMetadata?: any,
  ) => {
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

    const isGroup = contactKey.length === 36 && contactKey.includes("-");
    const confirmMsg = isGroup
      ? "Vuoi davvero lasciare questo gruppo ed eliminare la cronologia?"
      : "Vuoi eliminare questa conversazione e BLOCCARE l'utente sul tuo grafo? Non potrà più scriverti finché non lo riaggiungerai.";

    if (!window.confirm(confirmMsg)) return;

    if (isGroup) {
      if (groupService) {
        try {
          await groupService.leaveGroup(contactKey);
        } catch (err) {
          console.warn("Failed to leave group during deletion:", err);
        }
      }
      removeContact(contactKey);
    } else {
      // 1:1 Chat - Block on graph (revokes certificate)
      try {
        await blockContact(contactKey);
      } catch (err) {
        console.warn("Failed to block contact on graph:", err);
        removeContact(contactKey); // Fallback to local removal
      }
    }

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
    showNotification(
      isGroup ? "Group removed" : "User blocked and chat deleted",
      "info",
    );
  };


  const handleFixSync = async () => {
    if (!recipient || !signalService || !userPub) return;
    if (!window.confirm("Force-recreate secure session and regenerate your certificate?")) return;
    try {
      // 1. Reset the Waku/Signal Session
      await signalService.resetSession(recipient);

      // 2. Regenerate our own local certificate (fixes incoming writes from others)
      await signalService.regenerateCertificate(true);

      // 3. Re-publish our own bundle to fix potential discovery issues
      await signalService.republishBundle().catch(() => { });

      showNotification("Sincronizzazione e rigenerazione completate.", "info");

      const pub = await signalService.getPubKeyFromUsername(recipient);
      const ping = await signalService.encryptMessage(recipient, "PING_HEAL");

      const cert = await signalService.getInboxCertificate(pub);
      db.gun.get(`signal_v3_inbox_${pub}`).get('ping_heal_' + Date.now()).put({
        sender: userPub,
        type: ping.type,
        body: ping.body,
        timestamp: new Date().toISOString(),
      } as any, undefined, { opt: { cert } } as any);
    } catch (err) {
      showNotification("Reset failed.", "error");
    }
  };

  const handleRegenerateCertificate = async () => {
    if (!signalService) return;
    try {
      await signalService.regenerateCertificate(true);
      await signalService.republishBundle().catch(() => { });
      showNotification("Certificato rigenerato con successo.", "info");
    } catch (err) {
      showNotification("Rigenerazione certificato fallita.", "error");
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
      <div className="min-h-dvh bg-base-100 flex flex-col items-center justify-center relative px-6 py-12">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-secondary/5 opacity-50"></div>
        <div className="hero-content text-center z-10 py-12">
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
            <div className="flex flex-col items-center gap-6 p-8 bg-base-200/40 backdrop-blur-xl rounded-[2rem] border border-base-content/5 shadow-2xl">
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
      <div className="min-h-dvh w-full bg-base-100 relative flex flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--color-primary),_transparent_25%)] opacity-[0.03] pointer-events-none"></div>

        <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-24 z-10 px-6 py-12 lg:py-20 max-w-7xl mx-auto w-full">
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
              <div className="p-6 bg-base-200/40 backdrop-blur-xl rounded-2xl border border-base-content/5 shadow-xl">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1 text-primary">
                  Privacy
                </div>
                <div className="text-xl font-bold">End-to-End</div>
              </div>
              <div className="p-6 bg-base-200/40 backdrop-blur-xl rounded-2xl border border-base-content/5 shadow-xl">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1 text-secondary">
                  Storage
                </div>
                <div className="text-xl font-bold">Local-First</div>
              </div>
            </div>
          </div>

          <div className="card shrink-0 w-full max-w-sm shadow-3xl bg-base-200/40 backdrop-blur-2xl border border-base-content/10 rounded-[2.5rem]">
            <div className="card-body p-10 pb-16 gap-10">
              <div className="flex justify-center">
                <div className="avatar">
                  <div className="w-24 rounded-full bg-base-300/50 p-6 border-2 border-primary/20 shadow-inner">
                    <img src="/logo.svg" alt="Logo" />
                  </div>
                </div>
              </div>

              <div className="card-actions flex flex-col gap-3 w-full">
                <ShogunButton />
                <button
                  onClick={() => setShowLoginScanner(true)}
                  className="btn btn-ghost bg-base-content/5 border border-base-content/5 rounded-2xl h-12 w-full font-black text-xs uppercase tracking-widest hover:bg-base-content/10 transition-all flex gap-3"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 opacity-60">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
                  </svg>
                  Scan to Login
                </button>
              </div>

              {showLoginScanner && (
                <QrScannerModal
                  onScan={handleLoginQrScan}
                  onClose={() => setShowLoginScanner(false)}
                />
              )}

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

        <div className="w-full py-8 text-center text-[10px] font-black tracking-widest opacity-20 uppercase z-10 mt-auto">
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
                userPub,
                userNick,
                username: username || "",
                userAvatar,
                contacts,
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
                signalService={signalService}
                groupService={groupService}
                contactProfiles={contactProfiles}
                typingStatuses={typingStatuses}
                pinnedMessages={pinnedMessages}
                messages={messages}
                myRole={myRole}
                userPub={userPub || ""}
                userAvatar={userAvatar}
                userNick={userNick}
                username={username || ""}
                message={message}
                setMessage={setMessage}
                handleSendMessage={handleSendMessage}
                handleTyping={handleTyping}
                handleFixSync={handleFixSync}
                handleRegenerateCertificate={handleRegenerateCertificate}
                handlePinMessage={handlePinMessage}
                handleReportMessage={handleReportMessage}
                handleDeleteMessage={handleDeleteMessage}
                setShowGroupSettings={(id) =>
                  id ? navigate(`/chat/${id}/settings`) : null
                }
                transferProgress={transferProgress}
                transferBlobs={transferBlobs}
                handleClearChat={handleClearChat}
                trustedContacts={trustedContacts}
                isContactsLoading={isContactsLoading}
                acceptContact={acceptContact}
                blockContact={blockContact}
                wormholeService={wormholeServiceInst}
                wormholeStatuses={wormholeStatuses}
                showNotification={showNotification}
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
                signalService={signalService}
                groupService={groupService}
                contactProfiles={contactProfiles}
                typingStatuses={typingStatuses}
                pinnedMessages={pinnedMessages}
                messages={messages}
                myRole={myRole}
                userPub={userPub || ""}
                userAvatar={userAvatar}
                userNick={userNick}
                username={username || ""}
                message={message}
                setMessage={setMessage}
                handleSendMessage={handleSendMessage}
                handleTyping={handleTyping}
                handleFixSync={handleFixSync}
                handleRegenerateCertificate={handleRegenerateCertificate}
                handlePinMessage={handlePinMessage}
                handleReportMessage={handleReportMessage}
                handleDeleteMessage={handleDeleteMessage}
                setShowGroupSettings={(id) =>
                  id ? navigate(`/chat/${id}/settings`) : null
                }
                transferProgress={transferProgress}
                transferBlobs={transferBlobs}
                handleClearChat={handleClearChat}
                trustedContacts={trustedContacts}
                isContactsLoading={isContactsLoading}
                acceptContact={acceptContact}
                blockContact={blockContact}
                wormholeService={wormholeServiceInst}
                wormholeStatuses={wormholeStatuses}
                showNotification={showNotification}
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
            className={`alert ${notification.type === "error" ? "alert-error" : "alert-success"} shadow-xl border border-base-content/5`}
          >
            <span>{notification.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const ChatWrapper: React.FC<{
  recipient: string;
  setRecipient: (id: string) => void;
  signalService: SignalService | null;
  groupService: GroupService | null;
  contactProfiles: Record<
    string,
    { avatar?: string; nickname?: string; uniqueUsername?: string }
  >;
  typingStatuses: Record<string, number>;
  pinnedMessages: Record<string, Set<string>>;
  messages: Record<string, any[]>;
  myRole: string | null;
  userPub: string;
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
  handleRegenerateCertificate: () => void;
  setShowGroupSettings: (id: string | null) => void;
  transferProgress: Record<string, number>;
  transferBlobs: Record<string, Blob>;
  handleClearChat: (id: string) => void;
  trustedContacts: Set<string>;
  isContactsLoading: boolean;
  acceptContact: (id: string) => Promise<void>;
  blockContact: (id: string) => Promise<void>;
  wormholeService: WormholeService | null;
  wormholeStatuses: Record<string, string>;
  showNotification: (msg: string, type?: "info" | "error") => void;
}> = (props) => {
  return <ChatView {...props} />;
};

const App: React.FC = () => {
  const [coreContext, setCoreContext] = useState<any>(null);
  const [dbInstance, setDbInstance] = useState<DataBase | null>(null);

  // ── Theme Initialization ──
  useEffect(() => {
    const savedTheme = localStorage.getItem("linda-theme") || "linda";
    document.documentElement.dataset.theme = savedTheme;
  }, []);

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
          localStorage: true,
          radisk: true,
          file: "radata",
          wire: true,
          webrtc: true
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
            <div className="space-y-6 p-10 bg-base-200/40 backdrop-blur-2xl rounded-[2.5rem] border border-base-content/10 shadow-2xl">
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
