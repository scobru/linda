import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";

import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { GroupSettingsPage } from "./pages/GroupSettingsPage";
import { GroupCreationPage } from "./pages/GroupCreationPage";
import { DataBase, ShogunCore, Zen } from "shogun-core";

// --- Zen User Compatibility Shim ---
// This shims the legacy GunDB .user() method onto the Zen instance,
// which is required by ShogunCore's DataBase class.
const setupZenUserShim = (GunConstructor: any) => {
  if (!GunConstructor || GunConstructor.prototype.user) return;

  GunConstructor.prototype.user = function (pub?: string) {
    const zen = this;
    if (pub) {
      return zen.get("~" + pub);
    }

    if (!zen._user) {
      const userNode = zen.get("~");
      userNode.is = null;
      userNode._ = {};

      userNode.auth = function (pair: any, cb?: (ack: any) => void) {
        userNode.is = { pub: pair.pub, alias: pair.alias || "user" };
        userNode._ = { sea: pair };
        if (cb) {
          setTimeout(() => cb({ err: undefined, ok: 1, pub: pair.pub }), 0);
        }
        return userNode;
      };

      userNode.recall = function (opt?: { sessionStorage: boolean }) {
        // ShogunCore calls this. Its internal logic handles the actual recall,
        // but it expects the user object to exist.
        return userNode;
      };

      userNode.leave = function () {
        userNode.is = null;
        userNode._ = {};
        return userNode;
      };

      zen._user = userNode;
    }
    return zen._user;
  };
};

// Apply the shim immediately
setupZenUserShim(Zen);
import type { IZenInstance as IGunInstance } from "shogun-core";
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
import { useCommunicationInit } from "./hooks/useCommunicationInit";
import { useMessaging } from "./hooks/useMessaging";
import { GroupService, type Role } from "./GroupService";
import { CommunicationService } from "./CommunicationService";
import { WormholeService } from "./WormholeService";
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

// ── Unified Loading Component ──
const LoadingScreen: React.FC<{
  message: string;
  submessage?: string;
  type?: "infinity" | "spinner";
}> = ({ message, submessage, type = "spinner" }) => (
  <div className="min-h-dvh bg-base-100 flex flex-col items-center justify-center relative px-6 py-12 overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-secondary/10 opacity-30 pointer-events-none"></div>
    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse"></div>
    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[120px] animate-pulse delay-700"></div>

    <div className="z-10 flex flex-col items-center animate-slide-up">
      <div className="loader-glow mb-12">
        <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-3xl glass-panel flex items-center justify-center p-6 sm:p-8 transform hover:scale-105 transition-transform duration-500">
          <img
            src="/logo.svg"
            alt="Linda Logo"
            className="w-full h-full object-contain drop-shadow-2xl"
          />
        </div>
      </div>

      <div className="text-center space-y-6">
        <h1 className="text-4xl sm:text-5xl font-black text-primary tracking-tightest drop-shadow-sm">
          Linda
        </h1>

        <div className="flex flex-col items-center gap-6 px-10 py-8 glass-panel rounded-[2.5rem] border border-white/5 shadow-2xl min-w-[280px]">
          {type === "infinity" ? (
            <span className="loading loading-infinity loading-lg text-primary scale-150"></span>
          ) : (
            <span className="loading loading-spinner loading-lg text-primary scale-125"></span>
          )}
          <div className="space-y-1">
            <p className="text-xs font-black uppercase tracking-[0.4em] text-primary/80">
              {message}
            </p>
            {submessage && (
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">
                {submessage}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const AppContent: React.FC<{ db: DataBase; sdkInstance: ShogunCore }> = ({
  db,
  sdkInstance,
}) => {
  const { isLoggedIn, userPub, logout } = useShogun() as any;
  const sdk = sdkInstance; // Use the provided instance directly to avoid context delay
  const username = (db.getCurrentUser()?.user as any)?._?.sea?.pub
    ? (db.getCurrentUser()?.user as any)?.username
    : "";
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");

  // ── Wormhole State ──

  // ── Wormhole State ──
  const wormholeServiceRef = useRef<WormholeService | null>(null);
  const [wormholeStatuses, setWormholeStatuses] = useState<
    Record<string, string>
  >({});

  // ── File Transfer State ──
  const fileTransferServiceRef = useRef<FileTransferService | null>(null);
  const [transferProgress, setTransferProgress] = useState<
    Record<string, number>
  >({});
  const [transferBlobs, setTransferBlobs] = useState<Record<string, Blob>>({});
  const processedSignalsRef = useRef<Set<string>>(new Set());

  const [searchParams] = useSearchParams();
  const magicLoginAttempted = useRef(false);
  const [isProcessingMagicLink, setIsProcessingMagicLink] = useState(false);
  const [notification, setNotification] = useState<{
    msg: string;
    type: "info" | "error";
  } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Initial state logging for troubleshooting
  useEffect(() => {
    console.log(
      `[AppContent] Mounted. isLoggedIn: ${isLoggedIn}, userPub: ${userPub ? userPub.substring(0, 8) : "none"}, sdkReady: ${!!sdk}, URL: ${window.location.href}`,
    );
  }, []);

  useEffect(() => {
    console.log(
      `[AppContent] State change - isLoggedIn: ${isLoggedIn}, userPub: ${userPub ? userPub.substring(0, 8) : "none"}`,
    );
  }, [isLoggedIn, userPub]);

  const showNotification = useCallback(
    (msg: string, type: "info" | "error" = "info") => {
      setNotification({ msg, type });
      setTimeout(() => setNotification(null), 3000);
    },
    [],
  );

  const processUniversalLogin = useCallback(
    async (data: string, context: string = "Login") => {
      if (!data) return;
      try {
        // 0. Ensure SDK is ready (Retry loop for slow bootstrap on mobile)
        let activeSdk = sdk || window.shogun;
        if (!activeSdk) {
          console.log(
            `[Login] SDK not detected in context, waiting for initialization...`,
          );
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 500));
            activeSdk = sdk || window.shogun;
            if (activeSdk) {
              console.log(`[Login] SDK became ready after ${(i + 1) * 0.5}s`);
              break;
            }
          }
        }

        if (!activeSdk) {
          throw new Error("SDK not ready. Please try again in a moment.");
        }

        console.log(`[Login] ${context} context, processing data...`);

        let payload = data.trim();

        // Sanitization: Remove potential trailing slashes added by camera apps
        if (payload.endsWith("/")) payload = payload.slice(0, -1);

        // 1. Extract payload from URL if present
        if (
          payload.includes("?session=") ||
          payload.includes("?magic_login=")
        ) {
          try {
            const url = new URL(
              payload.startsWith("http")
                ? payload
                : `https://dummy.com/${payload}`,
            );
            payload =
              url.searchParams.get("session") ||
              url.searchParams.get("magic_login") ||
              payload;
          } catch (e) {
            // Fallback if URL parsing fails but strings are present
            if (payload.includes("?session="))
              payload = payload.split("?session=")[1].split("&")[0];
            else if (payload.includes("?magic_login="))
              payload = payload.split("?magic_login=")[1].split("&")[0];
          }
        }

        // 2. Decode Base64 payload
        let jsonStr = "";

        // FIX: Handle '+' chars being converted to ' ' by URL search params or copy-paste
        let cleanPayload = payload.trim().replace(/ /g, "+");

        try {
          // Try UTF-8 safe decoding first (Modern & Linda Standard)
          jsonStr = decodeURIComponent(escape(window.atob(cleanPayload)));
        } catch (e) {
          try {
            // Fallback to plain base64 (For older links or pure ASCII)
            jsonStr = window.atob(cleanPayload);
          } catch (e2) {
            // If not base64, assume it might be a direct JSON string (pure QR pairs)
            jsonStr = payload;
          }
        }

        // 3. Parse JSON
        let parsed;
        try {
          console.log(
            `[Login] Decoding successful, parsing JSON... (length: ${jsonStr.length})`,
          );
          parsed = JSON.parse(jsonStr);
        } catch (e) {
          console.error(
            `[Login] JSON Parse Error. First 20 chars: ${jsonStr.substring(0, 20)}`,
          );
          throw new Error(`Invalid data format (JSON parse error)`);
        }
        let pair = parsed;
        let usernameToUse = "";

        // 4. Handle Shogun Standard Wrapper
        if (parsed.type === "shogun-auth-pair" && parsed.pair) {
          console.log(
            `[Login] Standard Shogun wrapper detected for user: ${parsed.username}`,
          );
          pair = parsed.pair;
          usernameToUse = parsed.username || "";
        }

        // 5. Validate and Login
        if (pair.pub && pair.priv) {
          let finalUsername = usernameToUse || pair.username || pair.pub;
          // Fix: Gun usernames must be 64 chars or less for alias indexing.
          // Public keys used as fallbacks are 87 chars, which triggers an error.
          if (finalUsername && finalUsername.length > 64) {
            finalUsername = finalUsername.slice(0, 64);
          }

          const displayName =
            finalUsername.length > 20
              ? `${finalUsername.slice(0, 8)}...${finalUsername.slice(-4)}`
              : finalUsername;

          console.log(`[Login] Attempting Gun auth for: ${displayName}`);
          showNotification("Authenticating...", "info");

          // Reset state before login to avoid conflicts with old sessions
          if (typeof activeSdk.logout === "function") {
            activeSdk.logout();
          }

          const result = await activeSdk.loginWithPair(finalUsername, pair);

          console.log(
            `[Login] loginWithPair call completed. Result:`,
            result?.success,
          );
          if (!result?.success) {
            console.error(
              `[Login] loginWithPair failed with error:`,
              result?.error,
            );
          }
          // Verify Gun state immediately
          const gun = activeSdk.gun || (window as any).gun;

          // Wait up to 3 seconds for Gun to confirm auth
          let authenticated = false;
          for (let i = 0; i < 30; i++) {
            if (gun && gun.user().is) {
              console.log(
                `[Login] Gun verified authentication for: ${gun.user().is?.pub.substring(0, 8)} after ${i * 100}ms`,
              );
              authenticated = true;
              break;
            }
            await new Promise((r) => setTimeout(r, 100));
          }

          if (!authenticated) {
            console.warn(
              `[Login] Warning: Gun session not detected after 3s wait. loginWithPair might have succeeded but Gun state is not updated yet.`,
            );
          }

          showNotification(`Welcome back, ${displayName}!`, "info");
          return true;
        } else {
          console.error(`[Login] Invalid pair structure:`, Object.keys(pair));
          throw new Error("Invalid key pair structure");
        }
      } catch (err: any) {
        console.error(`[Login] ${context} error:`, err);
        showNotification(
          `Login failed: ${err.message || "Invalid or expired link"}`,
          "error",
        );
        return false;
      }
    },
    [sdk, showNotification],
  );

  // ── Hooks ──
  const { communicationService, groupService, isLoading, userUniqueUsername } =
    useCommunicationInit(db, showNotification);

  // Sync ref for async listeners
  const communicationServiceRef = useRef<CommunicationService | null>(null);
  useEffect(() => {
    communicationServiceRef.current = communicationService;
  }, [communicationService]);

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
    const relays = ["http://localhost:8765"] as string[];
    const authToken = import.meta.env.VITE_AUTH_TOKEN || "shogun2025";

    (async () => {
      for (const relayUrl of relays) {
        try {
          await service.cleanupStaleTransfers(relayUrl, authToken, 3600000);
          console.log(`[App] Wormhole cleanup success via: ${relayUrl}`);
          break;
        } catch (e) {}
      }
    })();

    return service;
  }, [isLoggedIn, db.gun]);

  // Update signal sender whenever communicationService becomes available
  useEffect(() => {
    if (fileTransferServiceInst && communicationService) {
      const sendUnifiedSignal = async (
        toPub: string,
        signal: any,
        prefix: string,
      ) => {
        try {
          db.gun.get(`~${toPub}`).once(() => {});
          let cert;
          for (let i = 0; i < 3; i++) {
            try {
              cert = await communicationService.getInboxCertificate(toPub);
              if (cert) break;
            } catch (e) {
              if (i === 2) throw e;
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
          const payload = prefix + JSON.stringify(signal);
          const cipher = await communicationService.encryptMessage(
            toPub,
            payload,
          );
          const signalKey = `${userPub!.substring(0, 8)}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

          // Secure SEA-compliant inbox soul (~toPub/signal_inbox_v13)
          const targetInbox = db.gun.user(toPub).get(`signal_inbox_v13`);

          const doSend = (
            sendCert: string | null,
            retryLabel: string,
          ): Promise<boolean> => {
            return new Promise((resolve) => {
              const putOptions =
                toPub === userPub ? {} : { opt: { cert: sendCert } };
              const timeout = setTimeout(() => {
                console.warn(
                  `[App] ${retryLabel} signal ${signal.type} put timeout (15s) for ${toPub.substring(0, 8)}`,
                );
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
                  if (ack.err && typeof ack.err === "string") {
                    if (ack.err.includes("Certificate")) {
                      resolve(false);
                    } else {
                      resolve(true);
                    }
                  } else {
                    console.log(
                      `[App] ${retryLabel} signal delivered to ${toPub.substring(0, 8)}`,
                    );
                    resolve(true);
                  }
                },
                putOptions as any,
              );
            });
          };

          const delivered = await doSend(cert ?? null, "[1st]");
          if (!delivered && toPub !== userPub) {
            communicationService.clearCertCache(toPub);
            const freshCert = await communicationService
              .getInboxCertificate(toPub)
              .catch(() => null);
            if (freshCert) {
              const retryDelivered = await doSend(freshCert, "[Retry]");
              if (!retryDelivered) {
                // If even retry fails with certificate error, surface it to the UI
                console.error(
                  `[App] Persistent certificate failure for ${toPub.substring(0, 8)}.`,
                );
              }
            } else {
              console.error(
                `[App] Failed to fetch valid certificate for ${toPub.substring(0, 8)} after 1st attempt failure.`,
              );
            }
          }
        } catch (e: any) {
          console.warn("[App] Failed to send secure P2P signal:", e.message);
        }
      };

      fileTransferServiceInst.setSignalSender((toPub: string, signal: any) =>
        sendUnifiedSignal(toPub, signal, " Linda:SIGNAL:"),
      );
    }
  }, [fileTransferServiceInst, communicationService, db, userPub]);

  // ── Signaling Listener ──
  useEffect(() => {
    if (!isLoggedIn || !userPub || !fileTransferServiceInst) return;

    const inboxSoul = `~${userPub}/signal_inbox_v13`;
    console.log(
      `[App] Starting securely authorized signaling listener on ${inboxSoul}`,
    );

    db.gun
      .get(inboxSoul)
      .map()
      .on(async (data: any, gunKey: string) => {
        if (
          !data ||
          typeof data !== "object" ||
          processedSignalsRef.current.has(gunKey)
        )
          return;
        if (!data.sender || !data.body || data.type === undefined) return;

        processedSignalsRef.current.add(gunKey);

        try {
          let currentService = communicationServiceRef.current;
          if (!currentService) {
            for (let i = 0; i < 10; i++) {
              await new Promise((r) => setTimeout(r, 500));
              if (communicationServiceRef.current) {
                currentService = communicationServiceRef.current;
                break;
              }
            }
          }
          if (!currentService) return;

          await Promise.race([
            currentService.waitReady(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("CommunicationService timeout")),
                5000,
              ),
            ),
          ]);

          const plaintext = await currentService.decryptMessage(data.sender, {
            type: data.type,
            body: data.body,
          });
          if (!plaintext || typeof plaintext !== "string") return;

          const trimmed = plaintext.trim();
          if (trimmed === "PING_HEAL") {
            currentService.republishBundle().catch(() => {});
            return;
          }

          if (trimmed.startsWith(" Linda:SIGNAL:")) {
            const signal = JSON.parse(
              trimmed.substring(" Linda:SIGNAL:".length),
            );
            if (signal) {
              const isSameInstance =
                signal.clientId === fileTransferServiceInst.getClientId();
              if (data.sender === userPub && isSameInstance) return;
              fileTransferServiceInst.handleIncomingSignal(data.sender, signal);
            }
          } else if (trimmed.startsWith("{")) {
            // Legacy support or fallback - handle signals without prefix
            try {
              const signal = JSON.parse(trimmed);
              if (signal) {
                // File transfer signals use prefixed types: file_offer, file_answer, etc.
                fileTransferServiceInst.handleIncomingSignal(
                  data.sender,
                  signal,
                );
              }
            } catch (e) {}
          }

          // Cleanup signal node from GunDB after processing
          // We use a longer timeout (60s) for file transfer signals to ensure reliability on slow mobile networks
          const cleanupDelay = trimmed.startsWith(" Linda:SIGNAL:")
            ? 60000
            : 20000;
          setTimeout(() => {
            if (userPub)
              db.gun
                .user(userPub)
                .get("signal_inbox_v13")
                .get(gunKey)
                .put(null as any);
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
      db.gun
        .user(userPub)
        .get("signal_inbox_v13")
        .get("_poke")
        .put(Date.now().toString());
    }, 45000);

    return () => clearInterval(kickInterval);
  }, [isLoggedIn, userPub, db]);

  const {
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
    handleDeleteMessage: baseDeleteMessage,
    currentMessages,
    saveContact,
    removeContact,
    saveMessages,
    trustedContacts,
    isContactsLoading,
    acceptContact,
    blockContact,
  } = useMessaging(
    db,
    userPub || null,
    communicationService,
    groupService,
    recipient,
    setRecipient,
    "http://localhost:8765",
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
      // Initial fetch
      groupService.getMemberRole(recipient, userPub || "").then(setMyRole);

      // Subscribe to changes
      const unsub = groupService.onMemberRoleChange(
        recipient,
        userPub || "",
        (role) => {
          setMyRole(role);
        },
      );

      return unsub;
    } else {
      setMyRole(null);
    }
  }, [recipient, groupService, userPub]);

  // 1. Start Magic Link Login
  useEffect(() => {
    const magic_login = searchParams.get("magic_login");
    const session = searchParams.get("session");

    const activeSdk = sdkInstance || (window as any).shogun || sdk;

    if (
      (magic_login || session) &&
      !isLoggedIn &&
      !magicLoginAttempted.current &&
      activeSdk
    ) {
      magicLoginAttempted.current = true;
      setIsProcessingMagicLink(true);
      console.log("[MagicLink] CONDITION MET. Starting authentication...");

      processUniversalLogin(magic_login || session!, "Magic Link").then(
        (success) => {
          if (!success) {
            console.error("[MagicLink] Authentication failed");
            setIsProcessingMagicLink(false);
            magicLoginAttempted.current = false;
          } else {
            console.log("[MagicLink] Authentication successful. Finalizing...");
            // Proactive cleanup if context update is slow
            setTimeout(() => {
              setIsProcessingMagicLink(false);
              const nextUrl = new URL(window.location.href);
              nextUrl.searchParams.delete("magic_login");
              nextUrl.searchParams.delete("session");
              window.history.replaceState(
                {},
                document.title,
                nextUrl.toString(),
              );
            }, 1500);
          }
        },
      );
    }
  }, [isLoggedIn, sdk, searchParams, processUniversalLogin]);

  // 2. Complete Magic Link Login state sync
  useEffect(() => {
    if (isLoggedIn && isProcessingMagicLink) {
      console.log("[MagicLink] Login confirmed via context! Cleaning up...");
      setIsProcessingMagicLink(false);

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("magic_login");
      nextUrl.searchParams.delete("session");
      window.history.replaceState({}, document.title, nextUrl.toString());
    }
  }, [isLoggedIn, isProcessingMagicLink]);

  // 3. Handle Auto-Restore Session if NOT processing magic login
  useEffect(() => {
    if (
      !isLoggedIn &&
      !magicLoginAttempted.current &&
      !isProcessingMagicLink &&
      sdk &&
      !sessionStorage.getItem("restored_tried")
    ) {
      sessionStorage.setItem("restored_tried", "true");
      if (typeof sdk.db?.restoreSession === "function") {
        sdk.db
          .restoreSession()
          .catch((e: any) => console.error("Restore failed:", e));
      }
    }
  }, [isLoggedIn, sdk, isProcessingMagicLink]);

  // 4. Handle Add Friend Link
  useEffect(() => {
    const add = searchParams.get("add");
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
  }, [
    db,
    isLoggedIn,
    userPub,
    saveContact,
    setRecipient,
    navigate,
    showNotification,
    searchParams,
  ]);

  // ── Profile Logic ──
  const [userNick, setUserNick] = useState<string>(
    localStorage.getItem("linda_user_nick") || "",
  );
  const [contactProfiles, setContactProfiles] = useState<
    Record<
      string,
      { avatar?: string; nickname?: string; uniqueUsername?: string }
    >
  >({});

  useEffect(() => {
    if (!isLoggedIn) {
      // Clear cache on logout
      localStorage.removeItem("linda_user_nick");
      localStorage.removeItem("linda_user_unique_username");
      return;
    }
    const pub = db.getUserPub();
    if (pub) {
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
        db.Off("nick_self");
      };
    }
  }, [isLoggedIn, db]);

  const subscribedProfilesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!communicationService || contacts.length === 0) return;
    contacts.forEach(async (contactId) => {
      if (subscribedProfilesRef.current.has(contactId)) return;
      subscribedProfilesRef.current.add(contactId);

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
            cPub = await communicationService.getPubKeyFromUsername(contactId);
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
  }, [contacts, communicationService, db]);

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
    if (!recipient || !communicationService || !userPub) return;
    if (
      !window.confirm(
        "Force-recreate secure session and regenerate your certificate?",
      )
    )
      return;
    try {
      // 1. Reset the Waku/Signal Session
      await communicationService.resetSession(recipient);

      // 2. Regenerate our own local certificate (fixes incoming writes from others)
      await communicationService.regenerateCertificate(true);

      // 3. Re-publish our own bundle to fix potential discovery issues
      await communicationService.republishBundle().catch(() => {});

      showNotification("Sincronizzazione e rigenerazione completate.", "info");

      const pub = await communicationService.getPubKeyFromUsername(recipient);
      const ping = await communicationService.encryptMessage(
        recipient,
        "PING_HEAL",
      );

      const cert = await communicationService.getInboxCertificate(pub);
      db.gun
        .get(`signal_v3_inbox_${pub}`)
        .get("ping_heal_" + Date.now())
        .put(
          {
            sender: userPub,
            type: ping.type,
            body: ping.body,
            timestamp: new Date().toISOString(),
          } as any,
          undefined,
          { opt: { cert } } as any,
        );
    } catch (err) {
      showNotification("Reset failed.", "error");
    }
  };

  const handleRegenerateCertificate = async () => {
    if (!communicationService) return;
    try {
      await communicationService.regenerateCertificate(true);
      await communicationService.republishBundle().catch(() => {});
      showNotification("Certificato rigenerato con successo.", "info");
    } catch (err) {
      showNotification("Rigenerazione certificato fallita.", "error");
    }
  };

  // Helper functions for ChatView
  const handleDeleteMessage = async (msgId: string, senderPub?: string) => {
    if (!recipient) return;
    const isGroup = recipient.length === 36 && recipient.includes("-");

    try {
      if (isGroup && groupService) {
        await groupService.deleteMessage(recipient, msgId, senderPub || "");
      } else {
        await baseDeleteMessage(msgId, senderPub);
      }
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
    if (!recipient || !groupService || !communicationService) return;
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
      <LoadingScreen
        message="Initializing session"
        submessage="Establishing secure handshake"
      />
    );
  }

  // ── Magic Link Progress Overlay ───────────────────────────────
  // We show a full-screen loader for magic link if it's already detected
  if (isProcessingMagicLink) {
    return (
      <LoadingScreen
        message="Authenticating Link"
        submessage="Verifying identity on decentralized web"
      />
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

              {/* Note: the full page loader above takes precedence when isProcessingMagicLink is true */}
              <div className="card-actions flex flex-col gap-3 w-full">
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
                db,
                userPub,
                userNick,
                username: username || "",
                contacts,
                setRecipient: (id: string) => {
                  setRecipient(id);
                  if (id) navigate(`/chat/${id}`);
                  else navigate("/");
                },
                contactProfiles,
                unreadCounts,
                handleDeleteContact,
                communicationService,
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
                db={db}
                setRecipient={(id) => {
                  setRecipient(id);
                  if (id) navigate(`/chat/${id}`);
                }}
                communicationService={communicationService}
                groupService={groupService}
                contactProfiles={contactProfiles}
                typingStatuses={typingStatuses}
                pinnedMessages={pinnedMessages}
                currentMessages={currentMessages}
                myRole={myRole}
                userPub={userPub || ""}
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
                db={db}
                setRecipient={(id) => {
                  setRecipient(id);
                  if (id) navigate(`/chat/${id}`);
                  else navigate("/");
                }}
                communicationService={communicationService}
                groupService={groupService}
                contactProfiles={contactProfiles}
                typingStatuses={typingStatuses}
                pinnedMessages={pinnedMessages}
                currentMessages={currentMessages}
                myRole={myRole}
                userPub={userPub || ""}
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
  db: DataBase;
  setRecipient: (id: string) => void;
  communicationService: CommunicationService | null;
  groupService: GroupService | null;
  contactProfiles: Record<
    string,
    { avatar?: string; nickname?: string; uniqueUsername?: string }
  >;
  typingStatuses: Record<string, number>;
  pinnedMessages: Record<string, Set<string>>;
  currentMessages: any[];
  myRole: string | null;
  userPub: string;
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

// ── SDK Singleton Initializer ──
// We initialize outside the component to handle React.StrictMode double-mounting properly.
let sdkInitPromise: Promise<any> | null = null;

const initSdk = async (relays: string[]) => {
  console.log("[App] Initializing SDK singleton with relays:", relays);

  const gunInstance = new Zen({
    peers: ["http://localhost:8765/zen"],
    localStorage: false,
    radisk: true,
    wire: true,
    webrtc: true,
  });

  window.gun = gunInstance;
  console.log("[App] Gun instance created:", gunInstance);

  const result = await (shogunConnector as any)({
    appName: "Shogun Linda",
    zenInstance: gunInstance as any,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    webauthn: { enabled: true },
    web3: { enabled: true },
    nostr: { enabled: true },
    showWebauthn: true,
    showMetamask: true,
    showNostr: true,
    showSeedLogin: true,
    deterministicAuth: {
      enabled: true,
      skipValidation: false,
      debug: true,
    },
  });

  // Global debug access
  if (typeof window !== "undefined") {
    window.shogun = result.core;
    window.gun = result.core.gun;
  }

  return result;
};

const App: React.FC = () => {
  const [coreContext, setCoreContext] = useState<any>(null);
  const [dbInstance, setDbInstance] = useState<DataBase | null>(null);

  // ── Theme Initialization ──
  useEffect(() => {
    const savedTheme = localStorage.getItem("linda-theme") || "linda";
    document.documentElement.dataset.theme = savedTheme;
  }, []);

  const relays = useMemo(() => ["http://localhost:8765/zen"], []);

  // Initialize ShogunCore with hardcoded relays
  useEffect(() => {
    let mounted = true;

    if (!sdkInitPromise) {
      sdkInitPromise = initSdk(relays);
    }

    sdkInitPromise
      .then((result) => {
        if (!mounted) return;

        console.log("[App] SDK initialized, updating state...");
        setDbInstance(result.core.db);
        setCoreContext(result);

        // Add debug methods to window for testing (only in DEV)
        if (import.meta.env.DEV && typeof window !== "undefined") {
          setTimeout(() => {
            window.shogunDebug = {
              clearAllData: () => {
                if (result.core.storage) result.core.storage.clearAll();
                if (typeof sessionStorage !== "undefined")
                  sessionStorage.removeItem("gunSessionData");
              },
              sdk: result.core,
              gun: result.core.gun,
              relays: relays,
            };
          }, 1000);
        }
      })
      .catch((err) => {
        console.error("[App] Failed to initialize Shogun SDK:", err);
      });

    return () => {
      mounted = false;
    };
  }, [relays]);

  if (!coreContext || !dbInstance) {
    return (
      <LoadingScreen
        message="Bootstrapping SDK"
        submessage="Connecting to P2P decentralized relays"
        type="infinity"
      />
    );
  }
  console.log(
    `[App] Rendering with coreContext: ${!!coreContext}, dbInstance: ${!!dbInstance}, coreReady: ${!!coreContext?.core}`,
  );

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
        <AppContent db={dbInstance} sdkInstance={coreContext.core} />
      </ShogunButtonProvider>
    </BrowserRouter>
  );
};

export default App;
