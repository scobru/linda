import React, { useState, useEffect, useRef, useMemo } from "react";
import { SignalService } from "./SignalService";
import Gun from "gun";
import "gun/sea";
import { DataBase, ShogunCore } from "shogun-core";
import { generateSecureRandomString } from "./utils/crypto";
import {
  shogunConnector,
  ShogunButtonProvider,
  ShogunButton,
  useShogun,
} from "shogun-button-react";
import "./App.css";
import type { IGunInstance } from "gun";

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
  text: string;
  timestamp: Date;
  status: "sending" | "sent" | "delivered" | "read";
}

const ProfileSettings: React.FC<{
  db: DataBase ;
  username: string;
  onClose: () => void;
  showNotification: (msg: string, type?: "info" | "error") => void;
  currentNick: string;
  currentAvatar: string | null;
}> = ({
  db,
  username,
  onClose,
  showNotification,
  currentNick,
  currentAvatar,
}) => {
  const [nick, setNick] = useState(currentNick);
  const [keys, setKeys] = useState("");
  const [showKeys, setShowKeys] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    // Extract SEA keys
    const pair = (db.getCurrentUser()?.user as any)?._?.sea;
    if (pair) {
      setKeys(JSON.stringify(pair, null, 2));
    }
  }, [db]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_WIDTH = 200;
        const MAX_HEIGHT = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        // Compress as JPEG
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        db.userPut("profile/avatar", dataUrl)
          .then(() => showNotification("Avatar updated!", "info"))
          .catch(() => showNotification("Failed to save avatar", "error"));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleCopyKeys = () => {
    if (!keys) return;
    navigator.clipboard
      .writeText(keys)
      .then(() => {
        setCopyStatus("Copied!");
        setTimeout(() => setCopyStatus(""), 2000);
      })
      .catch(() => {
        setCopyStatus("Failed");
        setTimeout(() => setCopyStatus(""), 2000);
      });
  };

  const handleSaveNick = async () => {
    if (!nick || nick === currentNick) return;
    const pub = db.getUserPub();
    if (!pub) return;

    // Check uniqueness
    try {
      let takenPub: any = undefined;
      try {
        takenPub = await db.Get(`signal_global_nicknames/${nick}`);
      } catch (e: any) {
        // Not found
      }

      if (takenPub && typeof takenPub === "string" && takenPub !== pub) {
        showNotification("Nickname already taken", "error");
      } else {
        await db.Put(`signal_global_nicknames/${nick}`, pub);
        await db.userPut("profile/nickname", nick);
        showNotification("Nickname updated", "info");
        onClose();
      }
    } catch (e) {
      showNotification("Failed to save nickname", "error");
    }
  };

  return (
    <div className="profile-modal-overlay">
      <div className="profile-modal">
        <div className="profile-header">
          <h2>Profile Settings</h2>
          <button onClick={onClose} className="btn-close">
            ×
          </button>
        </div>

        <div className="profile-section">
          <label>Avatar</label>
          <div className="avatar-preview-wrap">
            <div className="avatar-preview">
              {currentAvatar ? (
                <img src={currentAvatar} alt="Avatar" />
              ) : (
                <span>?</span>
              )}
            </div>
            <input type="file" accept="image/*" onChange={handleAvatarSelect} />
          </div>
        </div>

        <div className="profile-section">
          <label>Display Nickname</label>
          <div className="profile-input-group">
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder={username}
              className="login-input profile-input"
            />
            <button
              onClick={handleSaveNick}
              className="btn btn--primary profile-btn"
            >
              Update Nickname
            </button>
          </div>
        </div>

        <div className="profile-section">
          <label>Clear Cache & Storage</label>
          <div className="profile-input-group">
            <button
              onClick={() => {
                if (typeof window !== "undefined" && "Notification" in window) {
                  Notification.requestPermission().then((permission) => {
                    showNotification(
                      `Notifications are now ${permission}`,
                      permission === "granted" ? "info" : "error",
                    );
                  });
                }
              }}
              className="btn btn--secondary profile-btn-full"
            >
              Enable Notifications
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Are you sure you want to clear all cache, localStorage, and sessionStorage? This will log you out.",
                  )
                ) {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.reload();
                }
              }}
              className="btn btn--primary btn-danger profile-btn-full"
            >
              Reset Everything
            </button>
          </div>
        </div>

        <div className="profile-section">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <label style={{ marginBottom: 0 }}>
              Export GunDB Keys (Dangerous)
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setShowKeys(!showKeys)}
                className="btn btn--secondary"
                style={{
                  padding: "4px 12px",
                  fontSize: "0.75rem",
                  height: "auto",
                  flex: "none",
                }}
              >
                {showKeys ? "Hide" : "Show"}
              </button>
              <button
                onClick={handleCopyKeys}
                className="btn btn--secondary"
                style={{
                  padding: "4px 12px",
                  fontSize: "0.75rem",
                  height: "auto",
                  flex: "none",
                }}
              >
                {copyStatus || "Copy"}
              </button>
            </div>
          </div>
          <textarea
            readOnly
            value={showKeys ? keys : "••••••••••••••••••••••••••••••••"}
            className="login-input profile-textarea"
          />
        </div>
      </div>
    </div>
  );
};

const AppContent: React.FC<{ db: DataBase  }> = ({ db }) => {
  const { isLoggedIn, username, userPub, logout } = useShogun();
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [contacts, setContacts] = useState<string[]>([]);
  const [signalService, setSignalService] = useState<SignalService | null>(
    null,
  );
  const [notification, setNotification] = useState<{
    msg: string;
    type: "info" | "error";
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userNick, setUserNick] = useState<string>("");
  const [contactProfiles, setContactProfiles] = useState<
    Record<string, { avatar?: string; nickname?: string }>
  >({});
  const [contactErrors, setContactErrors] = useState<Record<string, boolean>>(
    {},
  );
  const [typingStatuses, setTypingStatuses] = useState<Record<string, number>>(
    {},
  );

  // Keep track of current recipient for notifications
  const recipientRef = useRef(recipient);
  useEffect(() => {
    recipientRef.current = recipient;
  }, [recipient]);

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

      return () => {
        db.Off("avatar_self");
        db.Off("nick_self");
      };
    }
  }, [isLoggedIn, username, db]);

  useEffect(() => {
    if (!signalService || contacts.length === 0) return;

    contacts.forEach(async (contactUser) => {
      try {
        let cPub = contactUser;
        // If it's a short string, it's an alias. Otherwise, it's a 88-char pubkey
        if (contactUser.length < 43) {
          cPub = await signalService.getPubKeyFromUsername(contactUser);
        }

        if (cPub) {
          db.On(
            `~${cPub}/profile/avatar`,
            (data: any) => {
              if (typeof data === "string") {
                setContactProfiles((prev) => ({
                  ...prev,
                  [contactUser]: { ...prev[contactUser], avatar: data },
                }));
              }
            },
            `avatar_${cPub}`,
          );

          db.On(
            `~${cPub}/profile/nickname`,
            (data: any) => {
              if (typeof data === "string") {
                setContactProfiles((prev) => ({
                  ...prev,
                  [contactUser]: { ...prev[contactUser], nickname: data },
                }));
              }
            },
            `nick_${cPub}`,
          );
        }
      } catch (e) {
        // ignore
      }
    });
  }, [contacts, signalService, db.gun]);

  // ── Session Initialization ──────────────────────────────────────

  useEffect(() => {
    const initSignalSession = async () => {
      if (isLoggedIn && username) {
        setIsLoading(true);
        try {
          const service = new SignalService(db);
          await service.initSession(username);
          setSignalService(service);
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
  }, [isLoggedIn, username]);

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

  useEffect(() => {
    if (!isLoggedIn || !username || !signalService || !userPub) return;

    // Load saved chat history and processed keys
    loadSavedMessages(userPub);
    loadProcessedKeys(userPub);

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
                  setShowProfile(false);
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

          setContacts((prev) =>
            prev.includes(senderPubKey) ? prev : [...prev, senderPubKey],
          );
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
    if (!recipient || !userPub || !signalService) return;
    const now = Date.now();

    // Throttle typing updates to once every 3 seconds to prevent HAM flooding
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      try {
        let recipientPub = recipient;
        if (recipient.length < 30) {
          recipientPub = await signalService.getPubKeyFromUsername(recipient);
        }

        // Ensure we are putting an object, never a primitive, to avoid graph corruption
        db.gun
          .get(`signal_v2_typing_${recipientPub}`)
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
    if (!recipient || !message || !signalService || !userPub) return;

    try {
      let ciphertext: any;
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

      // SUCCESS: Clear any persistent session error for this contact
      setContactErrors((prev) => ({ ...prev, [recipient]: false }));

      const recipientPubKey =
        await signalService.getPubKeyFromUsername(recipient);

      // Generate unique ID for message
      const msgId = crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString() + generateSecureRandomString(10);

      await db.Set(`signal_v3_inbox_${recipientPubKey}`, {
        msgId,
        sender: userPub,
        type: ciphertext.type,
        body: ciphertext.body,
        timestamp: new Date().toISOString(),
      } as any);

      setMessages((prev) => {
        const updated = {
          ...prev,
          [recipient]: [
            ...(prev[recipient] || []),
            {
              id: msgId,
              sender: "Me",
              text: message,
              timestamp: new Date(),
              status: "sent" as const,
            },
          ],
        };
        if (userPub) saveMessages(userPub, updated);
        return updated;
      });

      setContacts((prev) =>
        prev.includes(recipient) ? prev : [...prev, recipient],
      );
      setMessage("");
    } catch (e: any) {
      console.error("Send failed:", e);
      if (
        e.message.indexOf("MAC") !== -1 ||
        e.message.indexOf("Session") !== -1 ||
        e.message.indexOf("decrypt") !== -1 ||
        e.message.indexOf("Identity") !== -1
      ) {
        setContactErrors((prev) => ({ ...prev, [recipient]: true }));
      }
      showNotification(`Send failed: ${e.message}`, "error");
    }
  };

  // ── Helper: get initial letter for avatar ─────────────────────
  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  // ── Chat screen message processing ────────────────────────────
  const currentMessages = messages[recipient] || [];

  // Mark unread messages as read when the chat is open
  useEffect(() => {
    if (!recipient || !signalService || !userPub) return;

    const unreadMessages = currentMessages.filter(
      (m) => m.sender === recipient && m.status !== "read",
    );

    if (unreadMessages.length > 0) {
      const markAsRead = async () => {
        const updatedMessages = [...currentMessages];
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
    currentMessages,
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
    setContacts((prev) => prev.filter((c) => c !== contactKey));
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
    if (
      !window.confirm(
        "This will force-recreate the secure session with this contact. Use this only if messages are failing to decrypt. Continue?",
      )
    )
      return;
    try {
      await signalService.resetSession(recipient);
      setContactErrors((prev) => ({ ...prev, [recipient]: false }));
      showNotification("Secure session reset triggered.", "info");

      const recipientPubKey =
        await signalService.getPubKeyFromUsername(recipient);
      const pingCiphertext = await signalService.encryptMessage(
        recipient,
        "PING_HEAL",
      );
      await db.Set(`signal_inbox_${recipientPubKey}`, {
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

  // ── Chat screen ───────────────────────────────────────────────

  return (
    <div
      className={`app-layout ${recipient ? "mobile-chat-active" : "mobile-sidebar-active"}`}
    >
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

      {/* Sidebar */}
      <div className="sidebar">
        <div
          className="sidebar-user"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            cursor: "pointer",
          }}
          onClick={() => setShowProfile(true)}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="sidebar-user-avatar">
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt="Me"
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                getInitial(userNick || username || "?")
              )}
            </div>
            <div>
              <div className="sidebar-user-name">{userNick || username}</div>
              <div className="sidebar-user-status">Online</div>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleLogout();
            }}
            className="btn btn--secondary"
            style={{ padding: "4px 8px", fontSize: "0.8rem", height: "auto" }}
          >
            Logout
          </button>
        </div>

        <div className="sidebar-header">
          <span className="sidebar-title">Conversations</span>
        </div>

        <div className="contact-list">
          {contacts.map((c) => (
            <div
              key={c}
              className={`contact-item ${
                recipient === c ? "contact-item--active" : ""
              }`}
              onClick={() => {
                setRecipient(c);
                requestNotifications();
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    overflow: "hidden",
                  }}
                >
                  <div className="contact-avatar">
                    {contactProfiles[c]?.avatar ? (
                      <img
                        src={contactProfiles[c].avatar}
                        alt={c}
                        style={{
                          width: "100%",
                          height: "100%",
                          borderRadius: "50%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      getInitial(contactProfiles[c]?.nickname || c)
                    )}
                  </div>
                  <span className="contact-name" style={{ flex: 1 }}>
                    {contactProfiles[c]?.nickname ||
                      (c.length > 15 ? `${c.slice(0, 8)}...${c.slice(-4)}` : c)}
                  </span>
                  {unreadCounts[c] > 0 ? (
                    <span
                      className="unread-badge"
                      style={{
                        background: "var(--color-primary)",
                        color: "#000",
                        fontSize: "0.75rem",
                        fontWeight: "bold",
                        padding: "2px 8px",
                        borderRadius: "12px",
                      }}
                    >
                      {unreadCounts[c]}
                    </span>
                  ) : null}
                </div>
                <button
                  onClick={(e) => handleDeleteContact(c, e)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(255, 255, 255, 0.4)",
                    cursor: "pointer",
                    padding: "4px",
                    marginLeft: "8px",
                    fontSize: "12px",
                  }}
                  title="Delete contact"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="add-contact-wrapper">
          <input
            className="add-contact-input"
            placeholder="＋ Add contact..."
            onKeyDown={async (e: any) => {
              if (e.key === "Enter" && e.target.value.trim()) {
                if (!signalService) {
                  showNotification("Signal service not ready", "error");
                  return;
                }
                const name = e.target.value.trim();
                const target = e.target;

                target.disabled = true;
                const origPlaceholder = target.placeholder;
                target.placeholder = "Resolving...";
                target.value = "";

                try {
                  let pubKey = name;
                  if (name.length < 30) {
                    pubKey = await signalService.getPubKeyFromUsername(name);
                  }

                  // Always store contact by PubKey for internal consistency
                  setContacts((prev) =>
                    prev.includes(pubKey) ? prev : [...prev, pubKey],
                  );
                  setRecipient(pubKey);
                } catch (err: any) {
                  console.error(err);
                  showNotification(`User not found: ${name}`, "error");
                } finally {
                  target.disabled = false;
                  target.placeholder = origPlaceholder;
                  target.focus();
                }
              }
            }}
          />
        </div>
      </div>

      {showProfile && (
        <ProfileSettings
          db={db}
          username={username || ""}
          currentNick={userNick || username || ""}
          currentAvatar={userAvatar}
          showNotification={showNotification}
          onClose={() => setShowProfile(false)}
        />
      )}

      {/* Chat area */}
      <div className="chat-area">
        <div className="chat-header">
          {recipient ? (
            <>
              <button
                className="mobile-back-btn"
                onClick={() => setRecipient("")}
                aria-label="Back to contacts"
              >
                ←
              </button>
              <div className="chat-header-avatar">
                {contactProfiles[recipient]?.avatar ? (
                  <img
                    src={contactProfiles[recipient].avatar}
                    alt={recipient}
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  getInitial(contactProfiles[recipient]?.nickname || recipient)
                )}
              </div>
              <div className="chat-header-info">
                <h3 className="chat-header-name">
                  {contactProfiles[recipient]?.nickname ||
                    (recipient.length > 15
                      ? `${recipient.slice(0, 8)}...${recipient.slice(-4)}`
                      : recipient)}
                </h3>
                {typingStatuses[recipient] &&
                Date.now() - typingStatuses[recipient] <= 3000 ? (
                  <div className="typing-indicator">typing</div>
                ) : (
                  <div
                    className="chat-header-badge"
                    style={{
                      backgroundColor: contactErrors[recipient]
                        ? "var(--color-danger)"
                        : undefined,
                    }}
                  >
                    {contactErrors[recipient]
                      ? "⚠️ Session Error"
                      : "🔒 End-to-End Encrypted"}
                  </div>
                )}
              </div>
              {contactErrors[recipient] && (
                <button
                  onClick={handleManualReset}
                  className="btn btn--secondary"
                  style={{
                    marginLeft: "auto",
                    backgroundColor: "var(--color-danger)",
                    borderColor: "var(--color-danger)",
                    color: "white",
                    fontSize: "0.8rem",
                    padding: "4px 8px",
                  }}
                >
                  Reset Session
                </button>
              )}
            </>
          ) : (
            <h3 className="chat-header-placeholder">
              Select a conversation to start chatting
            </h3>
          )}
        </div>

        {recipient ? (
          <>
            <div className="message-box">
              {currentMessages.length === 0 && (
                <div className="chat-empty">
                  <div className="chat-empty-icon">💬</div>
                  <div className="chat-empty-text">No messages yet</div>
                  <div className="chat-empty-sub">
                    Send a secure message to{" "}
                    {contactProfiles[recipient]?.nickname ||
                      (recipient.length > 15
                        ? `${recipient.slice(0, 8)}...${recipient.slice(-4)}`
                        : recipient)}
                  </div>
                </div>
              )}
              {currentMessages.map((msg, i) => {
                const isMe = msg.sender === "Me";
                const msgAvatar = isMe
                  ? userAvatar
                  : contactProfiles[msg.sender]?.avatar;
                const msgNick = isMe
                  ? userNick || username || "?"
                  : contactProfiles[msg.sender]?.nickname || msg.sender;

                return (
                  <div
                    key={i}
                    className={`message-wrapper ${
                      isMe
                        ? "message-wrapper--sent"
                        : "message-wrapper--received"
                    }`}
                    style={{
                      display: "flex",
                      flexDirection: isMe ? "row-reverse" : "row",
                      alignItems: "flex-end",
                      gap: "8px",
                    }}
                  >
                    <div
                      className="message-avatar-small"
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: "var(--gradient-accent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.7em",
                        color: "white",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {msgAvatar ? (
                        <img
                          src={msgAvatar}
                          alt="avatar"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        getInitial(msgNick)
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        maxWidth: "80%",
                      }}
                    >
                      <div
                        className={`message-bubble ${
                          isMe
                            ? "message-bubble--sent"
                            : "message-bubble--received"
                        }`}
                      >
                        {msg.text}
                      </div>
                      <div
                        className="message-time"
                        style={{ textAlign: isMe ? "right" : "left" }}
                      >
                        {msg.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {isMe && msg.status && (
                          <span
                            className="message-status"
                            style={{ marginLeft: "4px", fontSize: "0.8em" }}
                          >
                            {msg.status === "sending" && "🕒"}
                            {msg.status === "sent" && "✓"}
                            {msg.status === "delivered" && "✓✓"}
                            {msg.status === "read" && (
                              <span style={{ color: "#34B7F1" }}>✓✓</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="input-area">
              <input
                className="chat-input"
                placeholder="Type your secure message..."
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  handleTyping();
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <button className="send-button" onClick={handleSendMessage}>
                ➤
              </button>
            </div>
          </>
        ) : (
          <div className="chat-empty">
            <div className="chat-empty-logo">
              <img
                src="/logo.svg"
                alt="Linda Logo"
                style={{
                  width: "120px",
                  height: "120px",
                  marginBottom: "24px",
                  filter: "drop-shadow(0 0 30px rgba(99, 102, 241, 0.3))",
                }}
              />
            </div>
            <div className="chat-empty-text">Linda Secure Messenger</div>
            <div className="chat-empty-sub">
              Select a contact or add a new one to start an encrypted
              conversation
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [coreContext, setCoreContext] = useState<any>(null);
  const [dbInstance, setDbInstance] = useState<DataBase  | null>(null);
  
  const relays = ["https://shogun-relay.scobrudot.dev/gun"];

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
            <p>
              Bootstrapping SDK...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
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
  );
};

export default App;
