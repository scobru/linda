import React, { useEffect, useRef, useMemo, useState } from "react";

import { AudioRecorder } from "./AudioRecorder";
import { AudioPlayer } from "./AudioPlayer";
import { FileBubble } from "./FileBubble";
import type { Message, FileMetadata } from "../hooks/useMessaging";
import { type CommunicationService } from "../services/CommunicationService";
import { type GroupService } from "../services/GroupService";
import { type WormholeService } from "../services/WormholeService";
import { shortenLink } from "../utils/ui";
import { UserAvatar } from "./UserAvatar";
import { DataBase } from "../zen/db";
import { getDisplayName, truncatePub } from "../utils/names";

interface ChatViewProps {
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
  currentMessages: Message[];
  myRole: string | null;
  userPub: string;
  userNick: string;
  username: string;
  message: string;
  setMessage: (msg: string) => void;
  handleSendMessage: (
    msg?: string,
    audio?: string,
    fileMetadata?: FileMetadata,
  ) => void;
  handleTyping: () => void;
  handleFixSync: () => void;
  handlePinMessage: (msgId: string, pin: boolean) => void;
  handleReportMessage: (msgId: string) => void;
  handleDeleteMessage: (msgId: string, senderPub?: string) => void;
  handleRegenerateCertificate: () => void;
  setShowGroupSettings: (id: string | null) => void;
  transferProgress: Record<string, number>;
  transferBlobs: Record<string, Blob>;
  wormholeService: WormholeService | null;
  wormholeStatuses: Record<string, string>;
  handleClearChat: (id: string) => void;
  trustedContacts: Set<string>;
  isContactsLoading: boolean;
  acceptContact: (id: string) => Promise<void>;
  blockContact: (id: string) => Promise<void>;
  showNotification: (msg: string, type?: "info" | "error") => void;
  blockedContacts: Set<string>;
}

const MessageText = React.memo(
  ({ text, isMe }: { text?: string; isMe?: boolean }) => {
    const urlRegex = useMemo(() => /(https?:\/\/[^\s]+|magnet:\?[^\s]+)/gi, []);
    const parts = useMemo(
      () => (text ? text.split(urlRegex) : []),
      [text, urlRegex],
    );

    if (!text) return null;

    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`hover:brightness-125 transition-all text-[14px] font-black underline ${isMe ? "text-primary-content" : "text-primary drop-shadow-md brightness-125"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {shortenLink(part)}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  },
);

export const ChatView: React.FC<ChatViewProps> = ({
  recipient,
  db,
  setRecipient,
  groupService,
  contactProfiles,
  typingStatuses,
  pinnedMessages,
  myRole,
  userPub,
  userNick,
  username,
  message,
  setMessage,
  handleSendMessage,
  handleTyping,
  handleFixSync,
  handlePinMessage,
  handleReportMessage,
  handleDeleteMessage,
  handleRegenerateCertificate,
  setShowGroupSettings,
  transferProgress,
  transferBlobs,
  wormholeService,
  wormholeStatuses,
  handleClearChat,
  trustedContacts,
  isContactsLoading,
  acceptContact,
  blockContact,
  showNotification,
  currentMessages,
  blockedContacts,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canSendMessage, setCanSendMessage] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);

  // ── Search & Tagging States ──
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );

  // Compute all unique tags in current chat
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    currentMessages.forEach((msg) => {
      msg.tags?.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [currentMessages]);

  // Filtering Logic
  const filteredMessages = useMemo(() => {
    return currentMessages.filter((msg) => {
      const matchesSearch =
        !searchQuery ||
        msg.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        msg.fileMetadata?.name
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase());

      const matchesTags =
        activeTags.size === 0 ||
        (msg.tags && msg.tags.some((tag) => activeTags.has(tag)));

      return matchesSearch && matchesTags;
    });
  }, [currentMessages, searchQuery, activeTags]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const isTrusted = useMemo(() => {
    if (isContactsLoading) return true;
    if (!recipient) return true;
    if (recipient.length === 36 && recipient.includes("-")) return true; // Groups are trusted by join
    return trustedContacts.has(recipient);
  }, [recipient, trustedContacts, isContactsLoading]);

  const isBlocked = useMemo(() => {
    if (!recipient) return false;
    return blockedContacts.has(recipient);
  }, [recipient, blockedContacts]);
  useEffect(() => {
    const checkPerms = async () => {
      // If looks like a group UUID
      if (groupService && recipient.length === 36 && recipient.includes("-")) {
        const can = await groupService.canPerform(recipient, "send_message");
        setCanSendMessage(can);
      } else {
        setCanSendMessage(true);
      }
    };
    checkPerms();
  }, [recipient, groupService, myRole]);

  // ── Prevent Tab Close During Transfer ──
  useEffect(() => {
    const isTransferring = Object.values(wormholeStatuses).some(
      (s) =>
        s === "uploading" ||
        s === "downloading" ||
        s === "encrypting" ||
        s === "decrypting",
    );

    if (isTransferring) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () =>
        window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  }, [wormholeStatuses]);

  const pinnedMsgList = useMemo(
    () => currentMessages.filter((m) => pinnedMessages[recipient]?.has(m.id)),
    [currentMessages, pinnedMessages, recipient],
  );

  // ── File Transfer Logic ──
  // ── Upload State ──
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMeta, setUploadMeta] = useState<{
    name: string;
    size: number;
  } | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!wormholeService) {
      console.error("Wormhole service not initialized");
      return;
    }

    const meta: FileMetadata = {
      name: file.name,
      size: file.size,
      mimeType: file.type,
      hash: "tbd",
      id: Math.random().toString(36).substring(7),
      status: "offered",
    };

    setIsUploading(true);
    setUploadMeta({ name: file.name, size: file.size });

    try {
      // Initiate Wormhole transfer with fallback logic
      if (wormholeService) {
        const relays = [
          import.meta.env.VITE_RELAY_URL,
          "https://delay.scobrudot.dev",
          "https://relay.peer.ooo",
        ].filter(Boolean) as string[];

        const authToken = import.meta.env.VITE_AUTH_TOKEN || "shogun2025";
        let code: string | undefined;
        let lastError: any;

        for (const relayUrl of relays) {
          try {
            console.log(`[ChatView] Attempting Wormhole send via: ${relayUrl}`);
            code = await wormholeService.send({
              file,
              filename: file.name,
              size: file.size,
              type: file.type,
              relayUrl,
              authToken,
            });
            if (code) {
              meta.wormholeCode = code;
              meta.method = "wormhole";
              meta.status = "offered";
              handleSendMessage(undefined, undefined, meta);
              break;
            }
          } catch (err: any) {
            console.warn(
              `[ChatView] Failed to send via ${relayUrl}:`,
              err.message,
            );
            lastError = err;
          }
        }

        if (!code) {
          console.error("All Wormhole relays failed:", lastError);
          // Fallback to error notification if all failed
          throw new Error(
            "Could not reach any file transfer relay. Please check your connection.",
          );
        }
      }
    } catch (err: any) {
      console.error("Failed to initiate file transfer:", err);
      showNotification(
        err.message || "Failed to initiate file transfer",
        "error",
      );
    } finally {
      setIsUploading(false);
      setUploadMeta(null);
      // Reset input value so same file can be selected again
      if (e.target) e.target.value = "";
    }
  };

  // Auto-accept images for Cloud Sync
  useEffect(() => {
    if (!wormholeService) return;

    const processMessages = async () => {
      for (const msg of currentMessages) {
        // Auto-accept if it's an image in Cloud/Self chat
        const isCloudChat = recipient === userPub;
        if (
          msg.type === "image" &&
          isCloudChat &&
          msg.fileMetadata?.wormholeCode
        ) {
          const code = msg.fileMetadata.wormholeCode;
          if (wormholeStatuses[code]) continue; // Already in progress or completed

          console.log(`[ChatView] Auto-accepting Cloud Sync image ${code}`);
          const relays = [
            import.meta.env.VITE_RELAY_URL,
            "https://delay.scobrudot.dev",
            "https://relay.peer.ooo",
          ].filter(Boolean) as string[];

          try {
            await Promise.any(
              relays.map((relayUrl) => wormholeService.receive(code, relayUrl)),
            );
          } catch (e) {}
        }
      }
    };
    processMessages();
  }, [currentMessages, wormholeStatuses, wormholeService, recipient, userPub]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages]);

  const handleContainerClick = (e: React.MouseEvent) => {
    // If we click exactly on the container or message list (not on a bubble)
    if (e.target === e.currentTarget) {
      setSelectedMessageId(null);
    }
  };

  const handleMessageClick = (e: React.MouseEvent, id: string) => {
    // Determine if it was a selection click or an action click
    // We check if the click was on the bubble itself
    const target = e.target as HTMLElement;
    if (target.closest("a") || target.closest("button")) return;

    setSelectedMessageId((prev) => (prev === id ? null : id));
  };

  const handleLongPress = (
    e: React.MouseEvent | React.TouchEvent,
    id: string,
  ) => {
    // onContextMenu handles long press on most mobile browsers
    if (e.type === "contextmenu") {
      e.preventDefault();
    }
    setSelectedMessageId(id);
  };

  if (!recipient) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-transparent bg-doodle text-center p-8 gap-6 animate-fadeIn font-narrow">
        <div className="avatar">
          <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center border border-primary/10 shadow-inner">
            <img
              src="/logo.svg"
              alt="Linda Logo"
              className="w-10 h-10 opacity-40 grayscale"
            />
          </div>
        </div>
        <div className="max-w-xs">
          <h2 className="text-2xl font-bold text-primary mb-2">
            Linda Messenger
          </h2>
          <p className="opacity-40 text-[13px] leading-relaxed">
            Select a contact to start an encrypted conversation. Your messages
            are stored locally.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full glass-panel overflow-hidden relative font-narrow">
      {/* Upload Overlay */}
      {isUploading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-base-200/80 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-base-content/10 shadow-2xl flex flex-col items-center gap-6 max-w-sm mx-4 text-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-8 h-8 text-primary animate-pulse"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black tracking-tight text-primary">
                Uploading...
              </h3>
              <p className="text-xs font-bold opacity-40 uppercase tracking-widest truncate max-w-[200px]">
                {uploadMeta?.name}
              </p>
              <p className="text-[10px] opacity-30 font-medium">
                {uploadMeta ? (uploadMeta.size / 1024 / 1024).toFixed(2) : 0} MB
                • Pre-flight sync...
              </p>
            </div>
            <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
              <div className="bg-primary h-full w-1/3 animate-shimmer"></div>
            </div>
          </div>
        </div>
      )}

      {/* Header - Signal Minimalism Style */}
      <div className="navbar bg-white/5 backdrop-blur-md border-b border-base-content/5 min-h-16 pt-safe shrink-0 px-6 gap-4 z-10 sticky top-0">
        <div className="flex-none lg:hidden">
          <button
            onClick={() => setRecipient("")}
            className="btn btn-ghost btn-circle btn-sm"
            aria-label="Torna ai contatti"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div className="relative">
            <UserAvatar
              pub={recipient}
              db={db}
              isGroup={recipient.length === 36 && recipient.includes("-")}
              className="w-12 h-12"
            />
            {typingStatuses[recipient] && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-base-200 animate-pulse" />
            )}
          </div>

          <div className="flex flex-col min-w-0">
            <h3 className="text-[16px] font-bold tracking-tight truncate leading-tight">
              {(() => {
                const isGroup =
                  recipient.length === 36 && recipient.includes("-");
                const cleanId = isGroup
                  ? recipient
                  : DataBase.cleanPub(recipient);
                const profile = contactProfiles[cleanId] || {};
                return getDisplayName(recipient, profile);
              })()}
            </h3>
            <span className="text-[13px] opacity-60">
              {typingStatuses[recipient]
                ? "sta scrivendo..."
                : "ultimo accesso di recente"}
            </span>
          </div>
        </div>

        <div className="flex-none flex items-center gap-1.5">
          <button
            onClick={() => {
              setIsSearchOpen(!isSearchOpen);
              if (isSearchOpen) setSearchQuery("");
            }}
            className={`btn btn-ghost btn-circle btn-sm ${isSearchOpen ? "text-primary" : "opacity-60"}`}
            aria-label={isSearchOpen ? "Chiudi ricerca" : "Cerca nei messaggi"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
          </button>

          {recipient.length === 36 && (
            <button
              onClick={() => setShowGroupSettings(recipient)}
              className="btn btn-ghost btn-circle btn-sm"
              aria-label="Impostazioni gruppo"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5 opacity-60"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                />
              </svg>
            </button>
          )}
          <div className="dropdown dropdown-end">
            <button
              tabIndex={0}
              className="btn btn-ghost btn-circle btn-sm"
              aria-label="Altre opzioni"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-5 h-5 opacity-60"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
                />
              </svg>
            </button>
            <ul
              tabIndex={0}
              className="dropdown-content mt-2 z-[50] menu p-2 shadow-2xl bg-base-300 border border-base-content/5 rounded-2xl w-56 font-bold"
            >
              <li>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Sei sicuro di voler eliminare tutta la cronologia di questa chat?",
                      )
                    )
                      handleClearChat(recipient);
                  }}
                  className="text-error py-3"
                >
                  Elimina cronologia
                </button>
              </li>

              <li>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Rigenerare il certificato di sicurezza? Potrebbe interrompere momentaneamente le sessioni attive.",
                      )
                    )
                      handleRegenerateCertificate();
                  }}
                  className="py-3"
                >
                  Rigenera certificato
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Search Input Area */}
      {isSearchOpen && (
        <div className="px-6 py-3 bg-base-200/80 backdrop-blur-md border-b border-base-content/5 sticky top-[calc(4rem+env(safe-area-inset-top))] z-[9]">
          <div className="relative group">
            <input
              type="text"
              placeholder="Cerca nei messaggi o file..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input input-sm w-full bg-base-300/50 border-base-content/10 focus:border-primary/50 focus:outline-none pl-10 rounded-xl font-medium"
              autoFocus
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-30 group-focus-within:opacity-100 group-focus-within:text-primary transition-all"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="btn btn-ghost btn-circle btn-xs absolute right-2 top-1/2 -translate-y-1/2"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tag Filter Bar */}
      {allTags.length > 0 && (
        <div className="px-6 py-2.5 bg-base-100 border-b border-base-content/5 overflow-x-auto flex items-center gap-2 scrollbar-hide sticky top-[calc(4rem+1px+env(safe-area-inset-top))] z-[8]">
          <div className="text-[10px] font-black uppercase tracking-widest opacity-30 mr-2 flex-none">
            Filtra per:
          </div>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`btn btn-xs rounded-full px-3 font-bold border-none transition-all ${activeTags.has(tag) ? "bg-primary text-primary-content hover:bg-primary/80 scale-105 shadow-lg shadow-primary/20" : "bg-base-300/50 hover:bg-base-300 opacity-60 hover:opacity-100"}`}
            >
              #{tag}
            </button>
          ))}
          {activeTags.size > 0 && (
            <button
              onClick={() => setActiveTags(new Set())}
              className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline ml-2 flex-none"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Pinned Messages */}
      {pinnedMsgList.length > 0 && (
        <div className="h-12 shrink-0 bg-base-200/50 backdrop-blur-md flex items-center px-6 gap-4 border-b border-base-content/5 cursor-pointer hover:bg-primary/5 transition-all">
          <span className="text-primary animate-bounce text-lg">📌</span>
          <div className="flex-1 text-xs font-medium truncate opacity-70">
            {pinnedMsgList[pinnedMsgList.length - 1].text}
          </div>
          {pinnedMsgList.length > 1 && (
            <span className="badge badge-neutral badge-sm rounded-full font-black opacity-60">
              +{pinnedMsgList.length - 1}
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        key={recipient}
        className="flex-1 overflow-y-auto scrollbar-hide animate-fadeIn bg-doodle"
        onClick={handleContainerClick}
      >
        <div className="max-w-3xl mx-auto w-full p-6 space-y-8">
          {filteredMessages.length === 0 && (
            <div className="min-h-[50vh] flex flex-col items-center justify-center opacity-10 gap-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
                className="w-16 h-16"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <span className="text-xl font-bold tracking-tight text-center">
                {searchQuery || activeTags.size > 0
                  ? "Nessun messaggio trovato per i criteri selezionati"
                  : "Inizia una conversazione sicura..."}
              </span>
            </div>
          )}

          {filteredMessages.map((msg, i) => {
            const isMe = msg.sender === "Me";
            const isGroupMsg =
              !isMe && msg.sender.length === 36 && msg.sender.includes("-");
            const cleanSender = isGroupMsg
              ? msg.sender
              : DataBase.cleanPub(msg.sender);
            const profile = contactProfiles[cleanSender] || {};
            const msgNick = isMe
              ? userNick || truncatePub(userPub) || truncatePub(username) || "?"
              : getDisplayName(msg.sender, profile);
            const isPinned = pinnedMessages[recipient]?.has(msg.id);

            return (
              <div
                key={msg.id || i}
                className={`chat ${isMe ? "chat-end" : "chat-start"} group/chat relative mb-4`}
              >
                <div className="chat-image avatar">
                  <UserAvatar
                    pub={msg.sender === "Me" ? userPub : msg.sender}
                    db={db}
                    isGroup={
                      !isMe &&
                      msg.sender.length === 36 &&
                      msg.sender.includes("-")
                    }
                    className="w-12 h-12"
                  />
                </div>

                <div className="chat-header opacity-40 text-[9px] font-bold uppercase tracking-widest mb-1 mx-2">
                  {!isMe && <span>{msgNick}</span>}
                </div>

                <div
                  className={`chat-bubble min-h-[40px] flex items-center relative group p-3 sm:px-4 sm:py-2.5 rounded-2xl cursor-pointer select-none touch-manipulation ${isMe ? "bg-primary text-primary-content rounded-tr-sm" : "bg-secondary text-base-content rounded-tl-sm"} ${selectedMessageId === msg.id ? "ring-2 ring-primary/40 brightness-110" : ""}`}
                  onClick={(e) => handleMessageClick(e, msg.id)}
                  onContextMenu={(e) => handleLongPress(e, msg.id)}
                >
                  {isPinned && (
                    <span className="absolute -top-2 -right-2 text-sm drop-shadow-xl bg-base-300 rounded-full w-7 h-7 flex items-center justify-center border border-base-content/10">
                      📌
                    </span>
                  )}

                  {msg.type === "audio" && msg.audio ? (
                    <AudioPlayer src={msg.audio} />
                  ) : (msg.type === "file" || msg.type === "image") &&
                    msg.fileMetadata ? (
                    <FileBubble
                      metadata={msg.fileMetadata}
                      isMe={isMe}
                      isCloud={recipient === userPub}
                      status="idle"
                      wormholeStatus={
                        msg.fileMetadata.method === "wormhole"
                          ? wormholeStatuses[
                              msg.fileMetadata.wormholeCode || ""
                            ]
                          : undefined
                      }
                      progress={
                        msg.fileMetadata.method === "wormhole"
                          ? transferProgress[
                              msg.fileMetadata.wormholeCode || ""
                            ] || 0
                          : 0
                      }
                      blob={
                        msg.fileMetadata.method === "wormhole"
                          ? transferBlobs[msg.fileMetadata.wormholeCode || ""]
                          : undefined
                      }
                      onAccept={async () => {
                        const meta = msg.fileMetadata!;
                        if (
                          meta.method === "wormhole" &&
                          meta.wormholeCode &&
                          wormholeService
                        ) {
                          const relays = [
                            import.meta.env.VITE_RELAY_URL,
                            "https://delay.scobrudot.dev",
                            "https://relay.peer.ooo",
                          ].filter(Boolean) as string[];

                          try {
                            console.log(
                              `[ChatView] Attempting Wormhole receive via multiple relays...`,
                            );
                            await Promise.any(
                              relays.map((relayUrl) =>
                                wormholeService.receive(
                                  meta.wormholeCode!,
                                  relayUrl,
                                ),
                              ),
                            );
                          } catch (err: any) {
                            console.error(
                              "[ChatView] All Wormhole relays failed to receive:",
                              err.message,
                            );
                          }
                        }
                      }}
                    />
                  ) : (
                    <div className="py-0.5 leading-relaxed text-[15px]">
                      <div className="break-words whitespace-pre-wrap">
                        <MessageText text={msg.text} isMe={isMe} />
                      </div>

                      {msg.tags && msg.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 mb-1">
                          {msg.tags.map((tag) => (
                            <span
                              key={tag}
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${isMe ? "bg-white/20 text-white" : "bg-primary/20 text-primary"}`}
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {msg.text?.includes("Impossibile decriptare") && (
                        <div className="flex flex-col gap-2 mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFixSync();
                            }}
                            className="btn btn-xs btn-error btn-outline rounded-full scale-90"
                          >
                            RIPRISTINA SINCRONIA
                          </button>
                        </div>
                      )}

                      {/* Telegram-style meta (time + status) inside bubble */}
                      <div
                        className={`flex items-center justify-end gap-1 mt-1 -mb-1 ml-4 float-right select-none opacity-60 text-[11px] ${isMe ? "text-primary-content" : "text-base-content"}`}
                      >
                        <span>
                          {msg.timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {isMe && (
                          <span className="flex items-center scale-90">
                            {msg.status === "sending" && "🕒"}
                            {msg.status === "sent" && "✓"}
                            {(msg.status === "delivered" ||
                              msg.status === "read") && (
                              <span
                                className={
                                  msg.status === "read"
                                    ? "text-white brightness-150"
                                    : ""
                                }
                              >
                                ✓✓
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bubble Actions */}
                  <div
                    className={`absolute top-0 flex gap-1.5 p-1.5 bg-base-300/90 backdrop-blur-xl rounded-full shadow-2xl border border-base-content/10 transition-all duration-300 z-10 ${selectedMessageId === msg.id ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-90 translate-y-2 pointer-events-none sm:group-hover:opacity-100 sm:group-hover:scale-100 sm:group-hover:translate-y-0 sm:group-hover:pointer-events-auto"} ${isMe ? "-left-20 sm:-left-24" : "-right-20 sm:-right-24"}`}
                  >
                    {recipient.length === 36 && recipient.includes("-") && (
                      <>
                        {["moderator", "administrator"].includes(
                          myRole || "",
                        ) && (
                          <button
                            onClick={() => handlePinMessage(msg.id, !isPinned)}
                            className="btn btn-ghost btn-circle btn-xs hover:text-primary transition-colors"
                            title={isPinned ? "Unpin" : "Pin"}
                          >
                            📌
                          </button>
                        )}
                        <button
                          onClick={() => handleReportMessage(msg.id)}
                          className="btn btn-ghost btn-circle btn-xs hover:text-warning transition-colors"
                          title="Report"
                        >
                          🚩
                        </button>
                      </>
                    )}

                    {(isMe ||
                      ["moderator", "administrator"].includes(
                        myRole || "",
                      )) && (
                      <button
                        onClick={() =>
                          handleDeleteMessage(msg.id, msg.senderPub)
                        }
                        className="btn btn-ghost btn-circle btn-xs hover:text-error transition-colors"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area - Signal Minimalism Style */}
      <div className="p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] bg-white/5 backdrop-blur-md border-t border-base-content/5 shrink-0 z-20 flex items-center justify-center">
        {!isTrusted ? (
          isBlocked ? (
            <div className="flex flex-col items-center gap-6 p-8 bg-base-300 rounded-[2rem] border border-base-content/5 w-full max-w-5xl">
              <div className="text-center space-y-2">
                <h4 className="text-lg font-black text-error uppercase tracking-tighter">
                  Contatto Bloccato
                </h4>
                <p className="text-xs opacity-60 font-bold max-w-xs leading-relaxed">
                  Hai bloccato questo contatto. Sbloccalo per poter inviare messaggi.
                </p>
              </div>
              <div className="flex gap-3 w-full max-w-sm">
                <button
                  onClick={async () => {
                    setIsAccepting(true);
                    try {
                      await acceptContact(recipient);
                    } finally {
                      setIsAccepting(false);
                    }
                  }}
                  disabled={isAccepting}
                  className="btn btn-primary flex-1 rounded-2xl shadow-lg h-12"
                >
                  {isAccepting ? (
                    <span className="loading loading-spinner"></span>
                  ) : (
                    "Sblocca"
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6 p-8 bg-base-300 rounded-[2rem] border border-base-content/5 w-full max-w-5xl">
              <div className="text-center space-y-2">
                <h4 className="text-lg font-black text-primary uppercase tracking-tighter">
                  Unknown Contact
                </h4>
                <p className="text-xs opacity-60 font-bold max-w-xs leading-relaxed">
                  Questa persona sta cercando di scriverti. Vuoi accettare la
                  conversazione?
                </p>
              </div>
              <div className="flex gap-3 w-full max-w-sm">
                <button
                  onClick={async () => {
                    setIsAccepting(true);
                    try {
                      await acceptContact(recipient);
                    } finally {
                      setIsAccepting(false);
                    }
                  }}
                  disabled={isAccepting}
                  className="btn btn-primary flex-1 rounded-2xl shadow-lg h-12"
                >
                  {isAccepting ? (
                    <span className="loading loading-spinner"></span>
                  ) : (
                    "Accetta"
                  )}
                </button>
                <button
                  onClick={() => blockContact(recipient)}
                  className="btn btn-ghost bg-white/5 flex-1 rounded-2xl h-12"
                >
                  Blocca
                </button>
              </div>
            </div>
          )
        ) : !canSendMessage ? (
          <div className="flex items-center justify-center p-5 bg-base-300 rounded-2xl border border-base-content/5 italic opacity-40 text-xs w-full font-bold">
            Solo gli amministratori possono inviare messaggi
          </div>
        ) : (
          <div className="flex items-center gap-2 w-full max-w-3xl mx-auto">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={recipient.length === 36 && recipient.includes("-")}
              className={`btn btn-ghost btn-circle bg-base-content/5 hover:bg-base-content/10 h-11 w-11 min-h-0 border-none ${recipient.length === 36 && recipient.includes("-") ? "opacity-20 cursor-not-allowed" : ""}`}
              aria-label="Allega file o immagine"
              title={
                recipient.length === 36 && recipient.includes("-")
                  ? "Il trasferimento file non è ancora supportato nei gruppi"
                  : "Allega file"
              }
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-5 h-5 opacity-60"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
            </button>

            <div className="flex-1 relative flex items-center">
              <textarea
                className="textarea textarea-sm w-full min-h-[44px] max-h-48 py-3 bg-base-300/50 border-none focus:ring-0 focus:outline-none rounded-2xl px-4 text-[15px] placeholder:opacity-50 resize-none leading-tight"
                placeholder="Scrivi un messaggio..."
                aria-label="Messaggio"
                rows={1}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  handleTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    if (message.trim()) {
                      e.preventDefault();
                      handleSendMessage(message);
                      setMessage("");
                    } else {
                      e.preventDefault();
                    }
                  }
                }}
              />
            </div>

            <AudioRecorder
              onRecordingComplete={(base64) =>
                handleSendMessage(undefined, base64)
              }
              loading={!canSendMessage}
            />

            <button
              className={`btn btn-circle btn-sm h-11 w-11 transition-all ${message.trim() ? "btn-primary shadow-lg" : "btn-ghost opacity-20"}`}
              onClick={() => {
                if (message.trim()) {
                  handleSendMessage(message);
                  setMessage("");
                }
              }}
              disabled={!message.trim()}
              aria-label="Invia messaggio"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
