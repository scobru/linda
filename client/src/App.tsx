import "./App.css";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { SignalService } from "./SignalService";
import { GroupService, type GroupInfo, type Role } from "./GroupService";
import { GroupSettings } from "./components/GroupSettings";
import { GroupCreationModal } from "./components/GroupCreationModal";
import Gun from "gun";
import type { IGunInstance } from "gun";
import "gun/sea";
import { DataBase, ShogunCore } from "shogun-core";
import { generateSecureRandomString } from "./utils/crypto";
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

interface Message {
  id: string;
  sender: string;
  senderPub?: string; // Original pubkey for group messages
  text: string;
  timestamp: Date;
  status: "sending" | "sent" | "delivered" | "read";
}



const AppContent: React.FC<{ db: DataBase }> = ({ db }) => {
  const { isLoggedIn, username, userPub, logout } = useShogun();
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [contacts, setContacts] = useState<string[]>([]);
  const [signalService, setSignalService] = useState<SignalService | null>(
    null,
  );
  const [groupService, setGroupService] = useState<GroupService | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [notification, setNotification] = useState<{
    msg: string;
    type: "info" | "error";
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userNick, setUserNick] = useState<string>("");
  const [userUniqueUsername, setUserUniqueUsername] = useState<string>("");
  const [contactProfiles, setContactProfiles] = useState<
    Record<string, { avatar?: string; nickname?: string; uniqueUsername?: string }>
  >({});
  const [contactErrors, setContactErrors] = useState<Record<string, boolean>>(
    {},
  );
  const [typingStatuses, setTypingStatuses] = useState<Record<string, number>>(
    {},
  );
  const [deletedMessages, setDeletedMessages] = useState<Record<string, Set<string>>>({});
  const [pinnedMessages, setPinnedMessages] = useState<Record<string, Set<string>>>({});
  const [myRole, setMyRole] = useState<Role | null>(null);

  // Keep track of current recipient for notifications
  const recipientRef = useRef(recipient);
  useEffect(() => {
    recipientRef.current = recipient;
    if (recipient && groupService && recipient.length === 36 && recipient.includes("-")) {
       groupService.getMemberRole(recipient, userPub || "").then(setMyRole);
    } else {
       setMyRole(null);
    }
  }, [recipient, groupService, userPub]);

  const contactProfilesRef = useRef(contactProfiles);
  useEffect(() => {
    contactProfilesRef.current = contactProfiles;
  }, [contactProfiles]);

  const requestNotifications = () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(console.warn);
      }
    }
  };

  // Request notification permission when logged in
  useEffect(() => {
    if (isLoggedIn) {
      requestNotifications();
    }
  }, [isLoggedIn]);

  // Track which contacts we already reset in this session to avoid infinite loops
  const resetsRef = useRef<Set<string>>(new Set());

  // Track which GunDB message keys we already processed so we never
  // feed the same ciphertext to the Signal ratchet twice (Bad MAC).
  const processedRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastTypingSentRef = useRef<number>(0);

  const showNotification = (msg: string, type: "info" | "error" = "info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleLogout = async () => {
    if (typeof localStorage !== "undefined") {
      // Clear all Signal Protocol data from the vault and legacy keys
      if (signalService && (signalService as any).store) {
        try {
          await (signalService as any).store.clearAll();
        } catch (e) {
          console.warn("Failed to clear SignalStore vault", e);
        }
      }

      localStorage.clear();
    }
    logout();
  };

  // ── Typing Listeners ──────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn || !userPub) return;

    try {
      db.gun
        .get(`signal_v2_typing_${userPub}`)
        .map()
        .on((data: any, senderPubKey: string) => {
          // Robust check for GunDB node structure
          if (!data || typeof data !== "object" || Array.isArray(data)) return;

          if (data.typing && data.ts) {
            // Guard against future timestamps that break GunDB HAM
            const now = Date.now();
            const parsedTs =
              typeof data.ts === "string"
                ? parseInt(data.ts, 10)
                : Number(data.ts);

            if (isNaN(parsedTs) || parsedTs > now + 3600000) return; // Ignore timestamps > 1hr in future

            setTypingStatuses((prev) => ({
              ...prev,
              [senderPubKey]: parsedTs,
            }));
          }
        });
    } catch (e) {
      console.warn(
        "[App] Typing listener failed (potential GunDB graph corruption):",
        e,
      );
    }

    // Cleanup old typing statuses
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingStatuses((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [pub, ts] of Object.entries(next)) {
          if (now - ts > 4000) {
            delete next[pub];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [isLoggedIn, userPub, db]);

  // ── Profile Listeners ─────────────────────────────────────────

  useEffect(() => {
    if (!isLoggedIn || !username) return;

    // Listen to our own profile changes
    const pub = db.getUserPub();
    if (pub) {
      db.On(
        `~${pub}/profile/avatar`,
        (data: any) => {
          if (typeof data === "string") setUserAvatar(data);
        },
        "avatar_self",
      );

      db.On(
        `~${pub}/profile/nickname`,
        (data: any) => {
          if (typeof data === "string") setUserNick(data);
        },
        "nick_self",
      );

      db.On(
        `~${pub}/profile/uniqueUsername`,
        (data: any) => {
          if (typeof data === "string") setUserUniqueUsername(data);
        },
        "unique_self",
      );

      return () => {
        db.Off("avatar_self");
        db.Off("nick_self");
        db.Off("unique_self");
      };
    }
  }, [isLoggedIn, username, db]);

  useEffect(() => {
    if (!signalService || contacts.length === 0) return;

    contacts.forEach(async (contactId) => {
      try {
        const isGroup = contactId.length === 36 && contactId.includes("-");
        
        if (isGroup) {
          // Listen to group metadata
          db.On(
            `signal_rooms/${contactId}/meta`,
            (data: any) => {
              if (data && typeof data === "object") {
                setContactProfiles((prev) => ({
                  ...prev,
                  [contactId]: { 
                    ...prev[contactId], 
                    nickname: data.name, 
                    avatar: data.avatar 
                  },
                }));
              }
            },
            `group_meta_${contactId}`
          );
        } else {
          // Regular user profile listeners
          let cPub = contactId;
          if (contactId.length < 43 || contactId.startsWith("@")) {
            cPub = await signalService.getPubKeyFromUsername(contactId);
          }

          if (cPub) {
            db.On(`~${cPub}/profile/avatar`, (data: any) => {
              if (typeof data === "string") {
                setContactProfiles((prev) => ({
                  ...prev,
                  [contactId]: { ...prev[contactId], avatar: data },
                }));
              }
            }, `avatar_${cPub}`);

            db.On(`~${cPub}/profile/nickname`, (data: any) => {
              if (typeof data === "string") {
                setContactProfiles((prev) => ({
                  ...prev,
                  [contactId]: { ...prev[contactId], nickname: data },
                }));
              }
            }, `nick_${cPub}`);

            db.On(`~${cPub}/profile/uniqueUsername`, (data: any) => {
              if (typeof data === "string") {
                setContactProfiles((prev) => ({
                  ...prev,
                  [contactId]: { ...prev[contactId], uniqueUsername: data },
                }));
              }
            }, `unique_${cPub}`);
          }
        }
      } catch (e) {
        // ignore
      }
    });

    return () => {
      contacts.forEach(c => {
        if (c.includes("-")) db.Off(`group_meta_${c}`);
      });
    }
  }, [contacts, signalService, db.gun]);

  // ── Session Initialization ──────────────────────────────────────

  useEffect(() => {
    const initSignalSession = async () => {
      if (isLoggedIn && username) {
        setIsLoading(true);
        try {
          // 1. Fetch or generate uniqueUsername
          let uniqueName: string | undefined;
          try {
            uniqueName = (await db.userGet("profile/uniqueUsername")) as string;
          } catch (e: any) {
            if (e && e.err !== "notfound") {
              throw e;
            }
          }

          if (!uniqueName) {
            // Generate a default one: @name + 4 random digits
            const digits = Math.floor(1000 + Math.random() * 9000);
            uniqueName = `@${username}${digits}`;
            
            // Try to save it, but don't block if it fails (uniqueness check will happen in Profile)
            await db.userPut("profile/uniqueUsername", uniqueName);
            const pub = db.getUserPub();
            if (pub) {
              await db.Put(`signal_unique_usernames/${uniqueName}`, pub);
            }
          }
          setUserUniqueUsername(uniqueName);

          const service = new SignalService(db);
          await service.initSession(username, uniqueName);
          setSignalService(service);
          
          const gService = new GroupService(db);
          setGroupService(gService);
          showNotification(`Welcome, ${username}! Signal session ready.`);
        } catch (e) {
          console.error("[App] Signal session initialization failed:", e);
          showNotification("Failed to initialize Signal keys", "error");
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
        setSignalService(null);
      }
    };
    initSignalSession();
  }, [isLoggedIn, username, db]);

  // Auto-scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, recipient]);

  // ── Load saved state from localStorage ────────────────────────

  const loadSavedMessages = (user: string) => {
    try {
      const raw = localStorage.getItem(`chat_messages_${user}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const contact in parsed) {
          parsed[contact] = parsed[contact].map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }));
        }
        setMessages(parsed);
        setContacts(Object.keys(parsed));
      }
    } catch (e) {
      console.error("Failed to load saved messages", e);
    }
  };

  const loadProcessedKeys = (user: string) => {
    try {
      const raw = localStorage.getItem(`processed_keys_${user}`);
      if (raw) {
        processedRef.current = new Set(JSON.parse(raw));
      }
    } catch (e) {
      processedRef.current = new Set();
    }
  };

  const saveMessages = (user: string, msgs: Record<string, Message[]>) => {
    localStorage.setItem(`chat_messages_${user}`, JSON.stringify(msgs));
  };

  const saveProcessedKey = (user: string, key: string) => {
    processedRef.current.add(key);
    localStorage.setItem(
      `processed_keys_${user}`,
      JSON.stringify(Array.from(processedRef.current)),
    );
  };

  // ── GunDB inbox listener ──────────────────────────────────────

  const saveContact = (contactId: string) => {
    if (!userPub || !db.gun) return;
    db.gun.get(`signal_v3_contacts_${userPub}`).get(contactId).put(true);
  };

  const removeContact = (contactId: string) => {
    if (!userPub || !db.gun) return;
    db.gun.get(`signal_v3_contacts_${userPub}`).get(contactId).put(null as any);
  };

  useEffect(() => {
    if (!isLoggedIn || !userPub) return;

    // Load saved chat history and processed keys
    loadSavedMessages(userPub);
    loadProcessedKeys(userPub);

    // Listen for contacts and groups from GunDB
    db.gun
      .get(`signal_v3_contacts_${userPub}`)
      .map()
      .on((data: any, contactId: string) => {
        if (data === true) {
          setContacts((prev) => (prev.includes(contactId) ? prev : [...prev, contactId]));
        } else if (data === null) {
          setContacts((prev) => prev.filter(c => c !== contactId));
        }
      });
  }, [isLoggedIn, userPub]);

  // ── Group message listeners ───────────────────────────────────
  const groupSubscriptionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isLoggedIn || !groupService || contacts.length === 0) return;

    contacts.forEach(async (contactId) => {
      // Simple heuristic for group UUIDs
      if (contactId.length !== 36 || !contactId.includes("-") || groupSubscriptionsRef.current.has(contactId)) return;
      
      groupSubscriptionsRef.current.add(contactId);
      
      try {
        const meta = await (db.Get as any)(`signal_rooms/${contactId}/meta`) as GroupInfo;
        if (!meta || !meta.secret) return;

        // Listen for messages
        db.gun
          .get(`signal_rooms/${contactId}/messages`)
          .map()
          .on(async (data: any, gunKey: string) => {
            if (!data || typeof data !== "object" || !data.body || !data.sender) return;
            if (processedRef.current.has(gunKey)) return;
            if (userPub) saveProcessedKey(userPub, gunKey);

            try {
              const plaintext = await groupService.decryptGroupMessage(meta.secret, data.body);
              const isMe = data.sender === userPub;
              const remoteMsgId = data.msgId || gunKey;

              setMessages((prev) => {
                const groupMsgs = prev[contactId] || [];
                // Check if message already exists by ID
                if (groupMsgs.some(m => m.id === remoteMsgId)) return prev;

                const updatedMessages = [
                  ...groupMsgs,
                  {
                    id: remoteMsgId,
                    sender: isMe ? "Me" : data.sender,
                    senderPub: data.sender,
                    text: plaintext,
                    timestamp: new Date(data.timestamp || Date.now()),
                    status: "delivered" as const,
                  },
                ];

                const updated = {
                  ...prev,
                  [contactId]: updatedMessages,
                };
                if (userPub) saveMessages(userPub, updated);
                return updated;
              });

              // Add to contacts if not already there
              setContacts((prev) => {
                const exists = prev.includes(contactId);
                if (!exists) {
                   saveContact(contactId);
                   return [...prev, contactId];
                }
                return prev;
              });
              
              // Notification for group message
              if (!isMe && (recipientRef.current !== contactId || document.visibilityState !== "visible")) {
                new Notification(`New message in ${meta.name}`, {
                  body: plaintext.substring(0, 50),
                  icon: meta.avatar || "/logo.svg"
                });
              }
            } catch (e) {
              console.warn(`[Groups] Failed to decrypt message in ${contactId}:`, e);
            }
          });

        // Listen for deletions
        db.gun.get(`signal_rooms/${contactId}/deleted_messages`).map().on((data: any, msgId: string) => {
          if (data) {
             setDeletedMessages(prev => {
               const groupDeletions = new Set(prev[contactId] || []);
               groupDeletions.add(msgId);
               return { ...prev, [contactId]: groupDeletions };
             });
          }
        });

        // Listen for pins
        db.gun.get(`signal_rooms/${contactId}/pins`).map().on((ts: any, msgId: string) => {
          setPinnedMessages(prev => {
            const groupPins = new Set(prev[contactId] || []);
            if (ts) groupPins.add(msgId);
            else groupPins.delete(msgId);
            return { ...prev, [contactId]: groupPins };
          });
        });

      } catch (err) {
        console.warn(`[Groups] Failed to start listener for ${contactId}:`, err);
      }
    });
  }, [contacts, isLoggedIn, groupService, db.gun]);

  // ── GunDB inbox listener ──────────────────────────────────────

  useEffect(() => {
    if (!isLoggedIn || !username || !signalService || !userPub) return;

    // Record the time the app started listening to avoid healing for old history
    const sessionStartTime = Date.now();
    // Synchronous set to prevent multiple resets during the initial map() blast
    const pendingResets = new Set<string>();

    // Using userPub derived from ShogunCore instead of an async call for performance
    db.gun
      .get(`signal_v3_inbox_${userPub}`)
      .map()
      .on(async (data: any, gunKey: string) => {
        // Filter out Gun metadata and invalid payloads
        if (!data || typeof data !== "object") return;
        if (!data.sender || !data.body || !data.type) return;

        // CRITICAL: skip already-processed messages to avoid Bad MAC
        if (processedRef.current.has(gunKey)) return;

        // WAIT for Signal initialization to finish before processing
        try {
          await signalService.waitReady();
        } catch (e) {
          return; // Still initializing or failed
        }

        if (userPub) saveProcessedKey(userPub, gunKey);

        const msgTime = data.timestamp ? new Date(data.timestamp).getTime() : 0;
        const isFreshMessage = msgTime > sessionStartTime - 30000;

        // Identify sender pubkey for consistent state management
        let senderPubKey = data.sender;
        if (senderPubKey.length < 30) {
          try {
            senderPubKey = await signalService.getPubKeyFromUsername(
              data.sender,
            );
          } catch (err) {
            console.warn("Could not resolve sender pubkey:", data.sender);
          }
        }

        try {
          const plaintext = await signalService.decryptMessage(senderPubKey, {
            type: data.type,
            body: data.body,
          });

          // SUCCESS: Clear any persistent session error for this contact
          setContactErrors((prev) => ({ ...prev, [senderPubKey]: false }));

          if (plaintext === "PING_HEAL") {
            console.log(
              `[Inbox] Received background auto-heal ping from ${senderPubKey}. Session is fully synchronized!`,
            );
            return;
          }

          if (plaintext.startsWith("RECEIPT_")) {
            const parts = plaintext.split("_");
            if (parts.length >= 3) {
              const status = parts[1] as "delivered" | "read";
              const msgId = parts.slice(2).join("_");

              setMessages((prev) => {
                const userMsgs = prev[senderPubKey] || [];
                const updated = userMsgs.map((m) =>
                  m.id === msgId &&
                  (m.status === "sent" ||
                    (m.status === "delivered" && status === "read"))
                    ? { ...m, status }
                    : m,
                );
                const state = { ...prev, [senderPubKey]: updated };
                if (userPub) saveMessages(userPub, state);
                return state;
              });
            }
            return;
          }

          // It's a real message. Send back a 'delivered' receipt.
          const msgId = data.msgId || gunKey; // Fallback to gunKey if sender didn't provide msgId

          if (isFreshMessage) {
            // Play sound for all fresh messages
            if (typeof window !== "undefined") {
              try {
                const audio = new Audio("/notification.mp3");
                audio.play().catch(() => {});
              } catch (e) {}
            }

            // Show OS notification only if chat is not focused or window is hidden
            if (
              (recipientRef.current !== senderPubKey ||
                document.visibilityState !== "visible") &&
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              try {
                const profile = contactProfilesRef.current[senderPubKey];
                const senderName =
                  profile?.nickname ||
                  (senderPubKey.length > 15
                    ? `${senderPubKey.slice(0, 8)}...${senderPubKey.slice(-4)}`
                    : senderPubKey);

                const title = `New message from ${senderName}`;
                const notifyText =
                  plaintext.length > 50
                    ? plaintext.substring(0, 50) + "..."
                    : plaintext;
                const notification = new Notification(title, {
                  body: notifyText,
                  icon: profile?.avatar || "/logo.svg",
                });

                notification.onclick = () => {
                  window.focus();
                  setRecipient(senderPubKey);
                  notification.close();
                };
              } catch (err) {
                console.warn("Failed to show notification:", err);
              }
            }
          }
          try {
            const receiptCiphertext = await signalService.encryptMessage(
              senderPubKey,
              `RECEIPT_delivered_${msgId}`,
            );
            await db.Set(`signal_v3_inbox_${senderPubKey}`, {
              sender: userPub,
              type: receiptCiphertext.type,
              body: receiptCiphertext.body,
              timestamp: new Date().toISOString(),
            } as any);
          } catch (e) {
            // Ignore receipt failure
          }

          setMessages((prev) => {
            const updated = {
              ...prev,
              [senderPubKey]: [
                ...(prev[senderPubKey] || []),
                {
                  id: msgId,
                  sender: senderPubKey,
                  text: plaintext,
                  timestamp: new Date(data.timestamp || Date.now()),
                  status: "delivered",
                },
              ],
            };
            if (userPub) saveMessages(userPub, updated);
            return updated;
          });

          setContacts((prev) => {
            if (!prev.includes(senderPubKey)) {
               saveContact(senderPubKey);
               return [...prev, senderPubKey];
            }
            return prev;
          });
        } catch (e: any) {
          if (!isFreshMessage) {
            // Silently log decryption failure for old messages without triggering recovery
            // console.log(`[Inbox] Historical message from ${senderPubKey} couldn't be decrypted (likely old session). Skipping.`);
            return;
          }

          console.error(`Decryption failed for ${senderPubKey}:`, e.message);

          const senderIdForReset = senderPubKey;

          if (
            !resetsRef.current.has(senderIdForReset) &&
            !pendingResets.has(senderIdForReset) &&
            (e.message.indexOf("MAC") !== -1 ||
              e.message.indexOf("Session") !== -1 ||
              e.message.indexOf("decrypt") !== -1 ||
              e.message.indexOf("Identity") !== -1)
          ) {
            // Lock synchronously
            pendingResets.add(senderIdForReset);
            resetsRef.current.add(senderIdForReset);

            console.warn(
              `Attempting to auto-heal session for ${senderPubKey} (${senderIdForReset})`,
            );
            try {
              await signalService.resetSession(senderIdForReset);
              showNotification(
                `Re-initialized session with ${senderPubKey}.`,
                "info",
              );

              try {
                console.log(
                  `[Inbox] Sending auto-heal ping to ${senderPubKey}...`,
                );
                const pingCiphertext = await signalService.encryptMessage(
                  senderIdForReset,
                  "PING_HEAL",
                );
                // Address resolution is natively anchored to pubkeys
                db.Set(`signal_v3_inbox_${senderIdForReset}`, {
                  sender: userPub,
                  type: pingCiphertext.type,
                  body: pingCiphertext.body,
                  timestamp: new Date().toISOString(),
                } as any);
              } catch (pingErr) {
                console.warn(
                  `[Inbox] Failed to send auto-heal ping to ${senderPubKey}:`,
                  pingErr,
                );
              }

              // IMMEDIATE RETRY only for handshakes (Type 3)
              if (data.type === 3) {
                try {
                  const plaintextRetry = await signalService.decryptMessage(
                    senderPubKey,
                    {
                      type: data.type,
                      body: data.body,
                    },
                  );
                  console.log(
                    `[Inbox] Successfully recovered message from ${senderPubKey} after reset!`,
                  );
                  setMessages((prev) => {
                    const updated = {
                      ...prev,
                      [senderPubKey]: [
                        ...(prev[senderPubKey] || []),
                        {
                          sender: senderPubKey,
                          text: plaintextRetry,
                          timestamp: new Date(data.timestamp || Date.now()),
                        },
                      ],
                    };
                    if (userPub) saveMessages(userPub, updated);
                    return updated;
                  });
                } catch (retryErr) {
                  console.warn(
                    `[Inbox] Even after reset, handshake message from ${senderPubKey} could not be decrypted. It might be too old or double-encrypted.`,
                  );
                }
              } else {
                console.log(
                  `[Inbox] Skipping decryption retry for type ${data.type} message from ${senderPubKey} after reset (not a handshake). Wait for next incoming message.`,
                );
              }
            } catch (resetErr) {
              console.error("Failed to reset session:", resetErr);
              setContactErrors((prev) => ({ ...prev, [senderPubKey]: true }));
            }
          } else if (
            e.message.indexOf("MAC") !== -1 ||
            e.message.indexOf("Session") !== -1 ||
            e.message.indexOf("decrypt") !== -1
          ) {
            // Not healing automatically because of rate limits or recent heal, mark as error
            setContactErrors((prev) => ({ ...prev, [senderPubKey]: true }));
          }
        }
      });
  }, [isLoggedIn, username, userPub, signalService]);

  // ── Send message & typing ─────────────────────────────────────

  const handleTyping = async () => {
    if (!recipient || !userPub || !signalService || !groupService) return;
    const now = Date.now();

    // Throttle typing updates to once every 3 seconds to prevent HAM flooding
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      try {
        const isGroup = recipient.length === 36 && recipient.includes("-");
        let path = `signal_v2_typing_${recipient}`;
        
        if (!isGroup) {
          const recipientPub = recipient.length < 30 || recipient.startsWith("@")
            ? await signalService.getPubKeyFromUsername(recipient)
            : recipient;
          path = `signal_v2_typing_${recipientPub}`;
        }

        // Ensure we are putting an object, never a primitive, to avoid graph corruption
        db.gun
          .get(path)
          .get(userPub)
          .put({
            typing: true,
            ts: now.toString(),
            // Adding a random salt to ensure unique state for each update if timestamps collide
            s: generateSecureRandomString(4),
          });
      } catch (e) {
        console.warn("[App] Failed to send typing status:", e);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!recipient || !message || !signalService || !userPub || !groupService) return;

    try {
      const isGroup = recipient.length === 36 && recipient.includes("-");
      let ciphertext: any;
      let msgId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + generateSecureRandomString(10);

      if (isGroup) {
        // Membership check
        const myRole = await groupService.getMemberRole(recipient, userPub);
        if (!myRole) {
           showNotification("You are no longer a member of this group", "error");
           // Remove from contacts if we're not a member anymore
           removeContact(recipient);
           setRecipient("");
           return;
        }

        const isMuted = await groupService.isMuted(recipient, userPub);
        if (isMuted) {
          showNotification("You are muted in this group", "error");
          return;
        }

        // Group Encryption
        const meta = await (db.Get as any)(`signal_rooms/${recipient}/meta`) as GroupInfo;
        if (!meta) throw new Error("Group meta not found");
        
        ciphertext = await groupService.encryptGroupMessage(meta.secret, message);

        await db.Set(`signal_rooms/${recipient}/messages`, {
          msgId,
          sender: userPub,
          body: ciphertext,
          timestamp: new Date().toISOString(),
          type: 'group'
        } as any);
      } else {
        // Signal 1:1 Encryption
        try {
          ciphertext = await signalService.encryptMessage(recipient, message);
        } catch (encryptErr: any) {
          if (!resetsRef.current.has(recipient)) {
            resetsRef.current.add(recipient);
            console.warn(
              "Encrypt failed, attempting session auto-heal...",
              encryptErr,
            );
            await signalService.resetSession(recipient);
            // Retry encrypt with fresh session
            ciphertext = await signalService.encryptMessage(recipient, message);
          } else {
            throw encryptErr;
          }
        }

        const recipientPubKey = recipient.length < 30 || recipient.startsWith("@")
          ? await signalService.getPubKeyFromUsername(recipient)
          : recipient;

        await db.Set(`signal_v3_inbox_${recipientPubKey}`, {
          msgId,
          sender: userPub,
          type: ciphertext.type,
          body: ciphertext.body,
          timestamp: new Date().toISOString(),
        } as any);
      }

      // SUCCESS: Clear any persistent session error for this contact
      setContactErrors((prev) => ({ ...prev, [recipient]: false }));

      setMessages((prev) => {
        const groupMsgs = prev[recipient] || [];
        if (groupMsgs.some((m) => m.id === msgId)) return prev;

        const updated = {
          ...prev,
          [recipient]: [
            ...groupMsgs,
            {
              id: msgId,
              sender: "Me",
              senderPub: userPub,
              text: message,
              timestamp: new Date(),
              status: "sent" as const,
            },
          ],
        };
        if (userPub) saveMessages(userPub, updated);
        return updated;
      });

      setContacts((prev) => {
        if (!prev.includes(recipient)) {
          saveContact(recipient);
          return [...prev, recipient];
        }
        return prev;
      });
      setMessage("");
    } catch (err: any) {
      console.error("Send failed:", err);
      showNotification(
        "Failed to send message: " + (err.message || "Unknown error"),
        "error",
      );
    }
  };

  const currentMessages = useMemo(() => {
    const msgs = messages[recipient] || [];
    const groupDeletions = deletedMessages[recipient] || new Set();
    return msgs.filter(m => !groupDeletions.has(m.id));
  }, [messages, recipient, deletedMessages]);

  // Mark unread messages as read when the chat is open
  useEffect(() => {
    if (!recipient || !signalService || !userPub) return;

    const unreadMessages = currentMessages.filter(
      (m) => m.sender === recipient && m.status !== "read",
    );

    if (unreadMessages.length > 0) {
      const markAsRead = async () => {
        const updatedMessages = [...(messages[recipient] || [])];
        let stateChanged = false;
        let recipientPub = recipient;

        try {
          if (recipient.length < 30) {
            recipientPub = await signalService.getPubKeyFromUsername(recipient);
          }

          for (const msg of unreadMessages) {
            try {
              const receiptCipher = await signalService.encryptMessage(
                recipientPub,
                `RECEIPT_read_${msg.id || Date.now()}`,
              );
              await db.Set(`signal_v3_inbox_${recipientPub}`, {
                sender: userPub,
                type: receiptCipher.type,
                body: receiptCipher.body,
                timestamp: new Date().toISOString(),
              } as any);

              const msgIndex = updatedMessages.findIndex(
                (m) => m.id === msg.id,
              );
              if (msgIndex !== -1) {
                updatedMessages[msgIndex] = {
                  ...msg,
                  status: "read" as const,
                };
                stateChanged = true;
              }
            } catch (e) {
              console.warn("[App] Failed to send read receipt:", e);
            }
          }

          if (stateChanged) {
            setMessages((prev) => {
              const state = { ...prev, [recipientPub]: updatedMessages };
              if (userPub) saveMessages(userPub, state);
              return state;
            });
          }
        } catch (e) {
          console.error("[App] markAsRead resolution failed:", e);
        }
      };

      markAsRead();
    }
  }, [
    recipient,
    currentMessages.length,
    signalService,
    userPub,
    db,
  ]);

  const unreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of contacts) {
      counts[c] = (messages[c] || []).filter(
        (m) => m.sender === c && m.status !== "read",
      ).length;
    }
    return counts;
  }, [messages, contacts]);

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
    if (!recipient || !groupService) return;
    const reason = window.prompt("Reason for reporting:");
    if (!reason) return;
    try {
      await groupService.reportContent(recipient, msgId, reason);
      showNotification("Message reported", "info");
    } catch (e: any) {
      showNotification(e.message || "Failed to report message", "error");
    }
  };

  // ── Loading screen ─────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="login-container">
        <div
          className="login-card"
          style={{ alignItems: "center", gap: "16px" }}
        >
          <img
            src="/logo.svg"
            alt="Linda Logo"
            style={{ width: "64px", height: "64px" }}
          />
          <h2 className="login-title">Linda</h2>
          <p className="login-subtitle">Loading keys...</p>
        </div>
      </div>
    );
  }

  // ── Login screen ──────────────────────────────────────────────

  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-orb orb-1"></div>
        <div className="login-orb orb-2"></div>
        <div className="login-orb orb-3"></div>

        {notification && (
          <div
            className={`notification ${
              notification.type === "error"
                ? "notification--error"
                : "notification--success"
            }`}
          >
            {notification.msg}
          </div>
        )}

        <div className="login-card">
          <div
            style={{
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div className="login-logo-wrap">
              <img
                src="/logo.svg"
                alt="Linda Logo"
                style={{
                  width: "64px",
                  height: "64px",
                  filter: "drop-shadow(0 0 20px rgba(99, 102, 241, 0.4))",
                }}
              />
            </div>
            <h2 className="login-title">Linda</h2>
            <p className="login-subtitle">
              The next generation of private messaging.
              <br />
              Secure. Decentralized. Premium.
            </p>
          </div>
          <div
            style={{
              padding: "8px",
              background: "rgba(255, 255, 255, 0.03)",
              borderRadius: "16px",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <ShogunButton />
          </div>
        </div>

        <footer className="login-footer">
          <div>Built with ❤️ by Scobru</div>
          <div className="login-footer-links">
            <a
              href="https://github.com/scobru/shogun-linda"
              target="_blank"
              rel="noopener noreferrer"
              className="login-footer-link"
            >
              GitHub
            </a>
            <a
              href="https://shogun-eco.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="login-footer-link"
            >
              Website
            </a>
            <a
              href="https://t.me/shogun_eco"
              target="_blank"
              rel="noopener noreferrer"
              className="login-footer-link"
            >
              Telegram
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                showNotification("All data is stored locally", "info");
              }}
              className="login-footer-link"
            >
              Privacy
            </a>
          </div>
        </footer>
      </div>
    );
  }

  // ── Contact Deletion ──────────────────────────────────────────

  const handleDeleteContact = (contactKey: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent setting the recipient when clicking delete

    // Ask for confirmation
    if (
      !window.confirm(
        "Are you sure you want to delete this contact and all local message history?",
      )
    ) {
      return;
    }

    // Remove from UI
    setContacts((prev) => {
       const next = prev.filter((c) => c !== contactKey);
       removeContact(contactKey);
       return next;
    });
    if (recipient === contactKey) {
      setRecipient("");
    }

    // Remove from messages state
    setMessages((prev) => {
      const updatedMessages = { ...prev };
      delete updatedMessages[contactKey];
      if (userPub) saveMessages(userPub, updatedMessages);
      return updatedMessages;
    });

    setContactErrors((prev) => {
      const updatedErrors = { ...prev };
      delete updatedErrors[contactKey];
      return updatedErrors;
    });

    showNotification("Contact and chat history deleted", "info");
  };

  const handleManualReset = async () => {
    if (!recipient || !signalService || !userPub) return;
    if (!window.confirm("This will force-recreate the secure session with this contact. Use this only if messages are failing to decrypt. Continue?")) return;
    try {
      await signalService.resetSession(recipient);
      setContactErrors((prev) => ({ ...prev, [recipient]: false }));
      showNotification("Secure session reset triggered.", "info");

      const recipientPubKey = await signalService.getPubKeyFromUsername(recipient);
      const pingCiphertext = await signalService.encryptMessage(recipient, "PING_HEAL");
      await db.Set(`signal_v3_inbox_${recipientPubKey}`, {
        sender: userPub,
        type: pingCiphertext.type,
        body: pingCiphertext.body,
        timestamp: new Date().toISOString(),
      } as any);
    } catch (err) {
      console.error("Manual reset failed:", err);
      showNotification("Failed to reset session manually.", "error");
    }
  };

  const ChatWrapper = () => {
    const { id } = useParams();
    useEffect(() => {
      if (id && id !== recipient) {
        setRecipient(id);
      }
    }, [id]);

    return (
      <ChatView
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
    );
  };

  return (
    <div className={`app-shell ${recipient ? "mobile-chat-active" : "mobile-sidebar-active"}`}>
      {notification && (
        <div className={`notification ${notification.type === "error" ? "notification--error" : "notification--success"}`}>
          {notification.msg}
        </div>
      )}

      <Routes>
        <Route element={
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
              setShowCreateGroup,
              signalService,
              groupService,
              showNotification,
              saveContact,
              requestNotifications,
            }}
          />
        }>
          <Route path="/" element={
            <ChatView
              recipient=""
              setRecipient={(id) => {
                setRecipient(id);
                if (id) navigate(`/chat/${id}`);
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
          
          <Route path="/chat/:id" element={<ChatWrapper />} />

          <Route path="/profile" element={
            <UserProfile
              db={db}
              username={username || ""}
              currentNick={userNick || username || ""}
              currentUniqueUsername={userUniqueUsername}
              currentAvatar={userAvatar}
              handleLogout={handleLogout}
              showNotification={showNotification}
            />
          } />
          
          <Route path="/settings" element={
            <Settings showNotification={showNotification} />
          } />
        </Route>
      </Routes>

      {/* Modals that stay on top of any route */}
      {showGroupSettings && groupService && (
        <GroupSettings
          groupId={showGroupSettings}
          groupService={groupService}
          db={db}
          onClose={() => setShowGroupSettings(null)}
          showNotification={showNotification}
        />
      )}

      {showCreateGroup && groupService && (
        <GroupCreationModal
          groupService={groupService}
          onClose={() => setShowCreateGroup(false)}
          onCreated={(groupId) => {
            setContacts((prev) => {
              if (!prev.includes(groupId)) {
                saveContact(groupId);
                return [...prev, groupId];
              }
              return prev;
            });
            setRecipient(groupId);
            navigate(`/chat/${groupId}`);
          }}
          showNotification={showNotification}
        />
      )}
    </div>
  );
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
      <div className="login-container">
        <div className="login-card" style={{ alignItems: "center" }}>
          <div
            style={{
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <img
              src="/logo.svg"
              alt="Linda Logo"
              style={{ width: "48px", height: "48px" }}
            />
            <p>Bootstrapping SDK...</p>
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
