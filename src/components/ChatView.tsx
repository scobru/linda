import React, { useEffect, useRef, useMemo, useState } from "react";
import { getDiceBearAvatar } from "../utils/avatar";
import { GroupService } from "../GroupService";
import { AudioRecorder } from "./AudioRecorder";
import { AudioPlayer } from "./AudioPlayer";
import { FileBubble } from "./FileBubble";
import type { Message, FileMetadata } from "../hooks/useSignalMessaging";
import { SignalService } from "../SignalService";
import { WormholeService } from "../WormholeService";

interface ChatViewProps {
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
  messages: Record<string, Message[]>;
  myRole: string | null;
  userPub: string;
  userAvatar: string | null;
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
}

export const ChatView: React.FC<ChatViewProps> = ({
  recipient,
  setRecipient,
  signalService,
  groupService,
  contactProfiles,
  typingStatuses,
  pinnedMessages,
  messages,
  myRole,
  userPub,
  userAvatar,
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
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canSendMessage, setCanSendMessage] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);

  const isTrusted = useMemo(() => {
    if (isContactsLoading) return true;
    if (!recipient) return true;
    if (recipient.length === 36 && recipient.includes("-")) return true; // Groups are trusted by join
    return trustedContacts.has(recipient);
  }, [recipient, trustedContacts, isContactsLoading]);
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
      s => s === 'uploading' || s === 'downloading' || s === 'encrypting' || s === 'decrypting'
    );

    if (isTransferring) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = '';
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, [wormholeStatuses]);

  const currentMessages = useMemo(
    () => messages[recipient] || [],
    [messages, recipient],
  );
  const pinnedMsgList = useMemo(
    () => currentMessages.filter((m) => pinnedMessages[recipient]?.has(m.id)),
    [currentMessages, pinnedMessages, recipient],
  );

  // ── File Transfer Logic ──
  // ── Upload State ──
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMeta, setUploadMeta] = useState<{ name: string; size: number } | null>(null);

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
      // Initiate Wormhole transfer
      if (
        signalService &&
        (recipient.startsWith("@") || recipient.length < 30)
      ) {
        try {
        } catch (err) {
          console.warn(
            "[ChatView] Could not resolve pubkey for file transfer:",
            err,
          );
        }
      }

      // Initiate Wormhole transfer with fallback logic
      if (wormholeService) {
        const relays = [
          import.meta.env.VITE_RELAY_URL,
          'https://shogun-relay.scobrudot.dev',
          'https://relay.peer.ooo'
        ].filter(Boolean) as string[];
        
        const authToken = import.meta.env.VITE_AUTH_TOKEN || 'shogun2025';
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
              authToken
            });
            if (code) {
              meta.wormholeCode = code;
              meta.method = 'wormhole';
              meta.status = 'offered';
              handleSendMessage(undefined, undefined, meta);
              break; 
            }
          } catch (err: any) {
            console.warn(`[ChatView] Failed to send via ${relayUrl}:`, err.message);
            lastError = err;
          }
        }

        if (!code) {
          console.error("All Wormhole relays failed:", lastError);
          // Fallback to error notification if all failed
          throw new Error("Could not reach any file transfer relay. Please check your connection.");
        }
      }
    } catch (err: any) {
      console.error("Failed to initiate file transfer:", err);
      showNotification(err.message || "Failed to initiate file transfer", "error");
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
        if (msg.type === "image" && isCloudChat && msg.fileMetadata?.wormholeCode) {
          const code = msg.fileMetadata.wormholeCode;
          if (wormholeStatuses[code]) continue; // Already in progress or completed

          console.log(`[ChatView] Auto-accepting Cloud Sync image ${code}`);
          const relays = [
            import.meta.env.VITE_RELAY_URL,
            'https://shogun-relay.scobrudot.dev',
            'https://relay.peer.ooo'
          ].filter(Boolean) as string[];
          
          for (const relayUrl of relays) {
             try {
               await wormholeService.receive(code, relayUrl);
               break;
             } catch(e) {}
          }
        }
      }
    };
    processMessages();
  }, [currentMessages, wormholeStatuses, wormholeService, recipient, userPub]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages]);

  if (!recipient) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-base-100 text-center p-8 gap-6 animate-fadeIn font-narrow">
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
    <div
      key={recipient}
      className="flex flex-col h-full bg-base-100 overflow-hidden relative animate-chat-fadeIn font-narrow"
    >
      {/* Upload Overlay */}
      {isUploading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md animate-fadeIn">
          <div className="bg-base-200/80 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-base-content/10 shadow-2full flex flex-col items-center gap-6 max-w-sm mx-4 text-center">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-primary animate-pulse">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                 </svg>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black tracking-tight text-primary">Uploading...</h3>
              <p className="text-xs font-bold opacity-40 uppercase tracking-widest truncate max-w-[200px]">
                {uploadMeta?.name}
              </p>
              <p className="text-[10px] opacity-30 font-medium">
                {uploadMeta ? (uploadMeta.size / 1024 / 1024).toFixed(2) : 0} MB • Pre-flight sync...
              </p>
            </div>
            <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
               <div className="bg-primary h-full w-1/3 animate-shimmer"></div>
            </div>
          </div>
        </div>
      )}

      {/* Header - Signal Minimalism Style */}
      <div className="navbar bg-base-200 border-b border-base-content/5 h-16 shrink-0 px-6 gap-4 z-10 sticky top-0">
        <div className="flex-none lg:hidden">
          <button
            onClick={() => setRecipient("")}
            className="btn btn-ghost btn-circle btn-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-base-300 border border-base-content/5 overflow-hidden ring-1 ring-white/5">
              {contactProfiles[recipient]?.avatar ? (
                <img src={contactProfiles[recipient].avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <img src={getDiceBearAvatar(recipient, recipient.includes("-"))} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            {typingStatuses[recipient] && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-base-200 animate-pulse" />
            )}
          </div>
          
          <div className="flex flex-col min-w-0">
            <h3 className="text-[15px] font-bold tracking-tight truncate leading-tight">
              {contactProfiles[recipient]?.nickname || (recipient.length > 20 ? `${recipient.slice(0, 8)}...${recipient.slice(-4)}` : recipient)}
            </h3>
            <span className="text-[10px] font-black uppercase tracking-[0.1em] opacity-40">
              {typingStatuses[recipient] ? "Sta scrivendo..." : "Crittografato"}
            </span>
          </div>
        </div>

        <div className="flex-none flex items-center gap-1.5">
          {recipient.length === 36 && (
            <button
               onClick={() => setShowGroupSettings(recipient)}
               className="btn btn-ghost btn-circle btn-sm"
            >
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 opacity-60">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
               </svg>
            </button>
          )}
          <div className="dropdown dropdown-end">
             <button tabIndex={0} className="btn btn-ghost btn-circle btn-sm">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 opacity-60">
                   <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                </svg>
             </button>
             <ul tabIndex={0} className="dropdown-content mt-2 z-[50] menu p-2 shadow-2xl bg-base-300 border border-base-content/5 rounded-2xl w-56 font-bold">
               <li><button onClick={() => handleClearChat(recipient)} className="text-error py-3">Elimina cronologia</button></li>
               <li><button onClick={() => handleRegenerateCertificate()} className="py-3">Rigenera certificato</button></li>
             </ul>
          </div>
        </div>
      </div>

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
      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
        {currentMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-10 gap-4">
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
                d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.625-12.125a.75.75 0 0 1 .75.75V4.5a.75.75 0 0 1-1.5 0V1.375a.75.75 0 0 1 .75-.75ZM13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm7 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-14 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
              />
            </svg>
            <span className="text-xl font-bold tracking-tight">
              No messages here yet...
            </span>
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
          const isPinned = pinnedMessages[recipient]?.has(msg.id);

          return (
            <div key={msg.id || i} className={`chat ${isMe ? "chat-end" : "chat-start"} group/chat relative mb-4`}>
              <div className="chat-image avatar">
                <div className="w-12 rounded-full border border-base-content/10 shadow-xl ring-2 ring-primary/5">
                  {msgAvatar ? (
                    <img
                      src={msgAvatar}
                      alt="avatar"
                      className="object-cover"
                    />
                  ) : (
                    <img
                      src={getDiceBearAvatar(
                        isMe ? username || userNick : msg.sender,
                        !isMe &&
                          msg.sender.length === 36 &&
                          msg.sender.includes("-"),
                      )}
                      alt="avatar"
                      className="object-cover bg-neutral"
                    />
                  )}
                </div>
              </div>

              <div className="chat-header opacity-40 text-[9px] font-bold uppercase tracking-widest mb-1 mx-2">
                {!isMe && <span>{msgNick}</span>}
              </div>

              <div
                className={`chat-bubble min-h-[40px] flex items-center relative group p-3 sm:px-4 sm:py-2.5 rounded-2xl ${isMe ? "bg-primary text-primary-content rounded-tr-sm" : "bg-secondary text-base-content rounded-tl-sm"}`}
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
                    wormholeStatus={msg.fileMetadata.method === 'wormhole' ? wormholeStatuses[msg.fileMetadata.wormholeCode || ''] : undefined}
                    progress={
                      msg.fileMetadata.method === 'wormhole' 
                        ? transferProgress[msg.fileMetadata.wormholeCode || ''] || 0
                        : 0
                    }
                    blob={
                      msg.fileMetadata.method === 'wormhole'
                        ? transferBlobs[msg.fileMetadata.wormholeCode || '']
                        : undefined
                    }
                    onAccept={async () => {
                      const meta = msg.fileMetadata!;
                      if (meta.method === 'wormhole' && meta.wormholeCode && wormholeService) {
                        const relays = [
                          import.meta.env.VITE_RELAY_URL,
                          'https://shogun-relay.scobrudot.dev',
                          'https://relay.peer.ooo'
                        ].filter(Boolean) as string[];
                        
                        let success = false;
                        for (const relayUrl of relays) {
                          try {
                            console.log(`[ChatView] Attempting Wormhole receive via: ${relayUrl}`);
                            await wormholeService.receive(meta.wormholeCode, relayUrl);
                            success = true;
                            break;
                          } catch (err: any) {
                            console.warn(`[ChatView] Failed to receive via ${relayUrl}:`, err.message);
                          }
                        }
                        if (!success) {
                          console.error("All Wormhole relays failed to receive.");
                        }
                      }
                    }}
                  />
                ) : (
                  <div className="py-0.5 leading-relaxed font-semibold text-[14px] break-all">
                    {msg.text}
                    {msg.text?.includes("Impossibile decriptare") && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFixSync();
                        }}
                        className="btn btn-xs btn-error btn-outline rounded-full ml-3 mt-1 scale-90"
                      >
                        RIPRISTINA SINCRONIA
                      </button>
                    )}
                  </div>
                )}

                {/* Bubble Actions on Hover */}
                <div
                  className={`absolute top-0 flex gap-1.5 p-1.5 bg-base-300/90 backdrop-blur-xl rounded-full shadow-2xl border border-base-content/10 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10 scale-90 group-hover:scale-100 ${isMe ? "-left-24" : "-right-24"}`}
                >
                  {recipient.length === 36 && (
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
                    </>
                  )}
                </div>
              </div>

              <div className="chat-footer opacity-30 text-[9px] font-bold flex items-center gap-1.5 mt-1 mx-1">
                {msg.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {isMe && (
                  <span className="flex items-center scale-90">
                    {msg.status === "sending" && "🕒"}
                    {msg.status === "sent" && "✓"}
                    {msg.status === "delivered" && "✓✓"}
                    {msg.status === "read" && (
                      <span className="text-primary font-black">✓✓</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - Signal Minimalism Style */}
      <div className="p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] bg-base-200 border-t border-base-content/5 shrink-0 z-20 flex items-center justify-center">
        {!isTrusted ? (
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
                {isAccepting ? <span className="loading loading-spinner"></span> : "Accetta"}
              </button>
              <button
                onClick={() => blockContact(recipient)}
                className="btn btn-ghost bg-white/5 flex-1 rounded-2xl h-12"
              >
                Blocca
              </button>
            </div>
          </div>
        ) : !canSendMessage ? (
          <div className="flex items-center justify-center p-5 bg-base-300 rounded-2xl border border-base-content/5 italic opacity-40 text-xs w-full font-bold">
            Solo gli amministratori possono inviare messaggi
          </div>
        ) : (
          <div className="flex items-center gap-2 w-full max-w-5xl mx-auto">
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
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 opacity-60">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>

            <div className="flex-1 relative flex items-center">
              <input
                type="text"
                className="input input-sm w-full h-11 bg-base-content/10 border-none focus:ring-1 focus:ring-primary/20 rounded-2xl px-4 font-bold text-[13px] placeholder:opacity-40"
                placeholder="Aa"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  handleTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && message.trim()) {
                    handleSendMessage(message);
                    setMessage("");
                  }
                }}
              />
            </div>
            
            <AudioRecorder
              onRecordingComplete={(base64) => handleSendMessage(undefined, base64)}
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
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
