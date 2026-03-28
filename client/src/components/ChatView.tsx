import React, { useEffect, useRef, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getInitial } from "../utils/ui";
import { GroupService } from "../GroupService";

interface Message {
  id: string;
  sender: string;
  senderPub?: string;
  text: string;
  timestamp: Date;
  status: "sending" | "sent" | "delivered" | "read";
}

interface ChatViewProps {
  recipient: string;
  setRecipient: (id: string) => void;
  groupService: GroupService | null;
  contactProfiles: Record<string, { avatar?: string; nickname?: string; uniqueUsername?: string }>;
  typingStatuses: Record<string, number>;
  contactErrors: Record<string, boolean>;
  pinnedMessages: Record<string, Set<string>>;
  messages: Record<string, Message[]>;
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
}

export const ChatView: React.FC<ChatViewProps> = ({
  recipient,
  setRecipient,
  groupService,
  contactProfiles,
  typingStatuses,
  contactErrors,
  pinnedMessages,
  messages,
  myRole,
  userAvatar,
  userNick,
  username,
  message,
  setMessage,
  handleSendMessage,
  handleTyping,
  handleManualReset,
  handlePinMessage,
  handleReportMessage,
  handleDeleteMessage,
  setShowGroupSettings,
}) => {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [canSendMessage, setCanSendMessage] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  // Check permissions whenever recipient or role changes
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

    // Reactive mute subscription
    if (groupService && recipient.length === 36 && recipient.includes("-")) {
      const myPub = (groupService as any).db.getUserPub();
      if (myPub) {
        const unsubscribe = groupService.onMuteStatusChange(recipient, myPub, (muted) => {
          setIsMuted(muted);
          // If we receive a mute update, we should also re-evaluate canSendMessage
          // although isMuted is checked inside canPerform, canPerform is not reactive.
          // So we manually override if we know we are muted.
          if (muted) setCanSendMessage(false);
          else {
            // Re-check full permissions when unmuted
            checkPerms();
          }
        });
        return unsubscribe;
      }
    } else {
      setIsMuted(false);
    }
  }, [recipient, groupService, myRole]);

  const currentMessages = useMemo(() => messages[recipient] || [], [messages, recipient]);
  const pinnedMsgList = useMemo(() => 
    currentMessages.filter(m => pinnedMessages[recipient]?.has(m.id)),
    [currentMessages, pinnedMessages, recipient]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessages]);

  if (!recipient) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-base-100 text-center p-8 gap-6 animate-fadeIn">
        <div className="avatar">
          <div className="w-24 rounded-full bg-primary/10 p-4 border border-primary/20 shadow-2xl shadow-primary/10">
            <img src="/logo.svg" alt="Linda Logo" className="opacity-80" />
          </div>
        </div>
        <div className="max-w-sm">
          <h2 className="text-3xl font-black text-primary mb-2">Linda Secure</h2>
          <p className="opacity-60 text-sm leading-relaxed">
            Select a contact or add a new one to start an encrypted conversation. Your messages are stored locally on your device.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div key={recipient} className="flex flex-col h-full bg-base-100 overflow-hidden relative animate-chat-fadeIn">
      {/* Header */}
      <div className="navbar bg-base-100/60 backdrop-blur-2xl border-b border-white/5 h-20 shrink-0 px-6 gap-4 z-10 sticky top-0">
        <div className="flex-none lg:hidden">
          <button
            className="btn btn-ghost btn-circle shadow-xl bg-base-200/90 border border-white/10 active:scale-90 transition-all flex items-center justify-center p-0 mr-1"
            onClick={() => { 
                setRecipient(""); 
                navigate("/"); 
            }}
            aria-label="Back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5 text-primary">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        </div>
        
        <div className="avatar">
          <div className="w-12 rounded-full border-2 border-primary/20 ring-4 ring-primary/5 shadow-2xl">
            {contactProfiles[recipient]?.avatar ? (
              <img src={contactProfiles[recipient].avatar} alt={recipient} className="object-cover" />
            ) : (
              <div className="bg-neutral text-neutral-content flex items-center justify-center font-black text-lg">
                {getInitial(contactProfiles[recipient]?.nickname || recipient)}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden ml-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black truncate tracking-tight">
              {contactProfiles[recipient]?.nickname ||
                (recipient.length === 36 && recipient.includes("-")
                  ? "Loading group..."
                  : recipient.length > 20
                  ? `${recipient.slice(0, 8)}...${recipient.slice(-4)}`
                  : recipient)}
            </h3>
            {recipient.length === 36 && recipient.includes("-") && (
              <span className="badge badge-sm badge-primary font-black rounded-full tracking-wider px-3 border-2">GROUP</span>
            )}
          </div>
          
          <div className="flex items-center gap-2 mt-0.5">
            {typingStatuses[recipient] && Date.now() - typingStatuses[recipient] <= 3000 ? (
              <div className="flex gap-1.5 items-center">
                <span className="loading loading-dots loading-xs text-primary scale-75"></span>
                <span className="text-[9px] text-primary font-black uppercase tracking-[0.2em]">Typing</span>
              </div>
            ) : (
              <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] ${contactErrors[recipient] ? "text-error" : "opacity-30"}`}>
                <span className={`status status-xs ${contactErrors[recipient] ? "status-error animate-pulse" : "status-success opacity-50"}`}></span>
                {contactErrors[recipient] ? "Secure Session Error" : "E2E Encrypted"}
              </div>
            )}
          </div>
        </div>

        <div className="flex-none gap-3">
          {recipient.length === 36 && recipient.includes("-") && (
            <button
              onClick={() => setShowGroupSettings(recipient)}
              className="btn btn-ghost btn-circle bg-base-300/30 hover:bg-base-300/60"
              title="Group Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}

          {contactErrors[recipient] && (
            <button
              onClick={handleManualReset}
              className="btn btn-warning btn-outline btn-sm rounded-full px-4 font-black text-[10px] tracking-widest"
            >
              HEAL
            </button>
          )}
        </div>
      </div>

      {/* Pinned Messages */}
      {pinnedMsgList.length > 0 && (
        <div className="h-12 shrink-0 bg-base-200/50 backdrop-blur-md flex items-center px-6 gap-4 border-b border-white/5 cursor-pointer hover:bg-primary/5 transition-all">
          <span className="text-primary animate-bounce text-lg">📌</span>
          <div className="flex-1 text-xs font-medium truncate opacity-70">
            {pinnedMsgList[pinnedMsgList.length - 1].text}
          </div>
          {pinnedMsgList.length > 1 && (
            <span className="badge badge-neutral badge-sm rounded-full font-black opacity-60">+{pinnedMsgList.length - 1}</span>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
        {currentMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-10 gap-6">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-24 h-24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.625-12.125a.75.75 0 0 1 .75.75V4.5a.75.75 0 0 1-1.5 0V1.375a.75.75 0 0 1 .75-.75ZM13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm7 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-14 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
            </svg>
            <span className="text-2xl font-black tracking-tight italic">Start messaging...</span>
          </div>
        )}
        
        {currentMessages.map((msg, i) => {
          const isMe = msg.sender === "Me";
          const msgAvatar = isMe ? userAvatar : contactProfiles[msg.sender]?.avatar;
          const msgNick = isMe ? userNick || username || "?" : contactProfiles[msg.sender]?.nickname || msg.sender;
          const isPinned = pinnedMessages[recipient]?.has(msg.id);

          return (
            <div
              key={`${msg.id || "msg"}-${i}`}
              className={`chat ${isMe ? "chat-end" : "chat-start"} animate-slideUp`}
            >
              <div className="chat-image avatar">
                <div className="w-10 sm:w-12 rounded-full border border-white/10 shadow-xl ring-2 ring-primary/5">
                  {msgAvatar ? (
                    <img src={msgAvatar} alt="avatar" className="object-cover" />
                  ) : (
                    <div className="bg-neutral text-neutral-content flex items-center justify-center font-black text-xs h-full w-full">
                      {getInitial(msgNick)}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="chat-header opacity-50 text-[10px] font-black uppercase tracking-[0.1em] mb-1.5 flex gap-2 mx-2">
                {!isMe && <span>{msgNick}</span>}
              </div>

              <div className={`chat-bubble shadow-2xl border border-white/5 min-h-[48px] flex items-center relative group p-4 sm:p-5 rounded-[2rem] ${isMe ? "chat-bubble-primary !text-slate-900 rounded-tr-md shadow-primary/20" : "chat-bubble-neutral rounded-tl-md"}`}>
                {isPinned && <span className="absolute -top-2 -right-2 text-sm drop-shadow-xl bg-base-300 rounded-full w-7 h-7 flex items-center justify-center border border-white/10">📌</span>}
                <div className="py-0.5 leading-relaxed font-bold">{msg.text}</div>

                {/* Bubble Actions on Hover */}
                <div className={`absolute top-0 flex gap-1.5 p-1.5 bg-base-300/90 backdrop-blur-xl rounded-full shadow-2xl border border-white/10 opacity-0 group-hover:opacity-100 transition-all duration-300 z-10 scale-90 group-hover:scale-100 ${isMe ? "-left-24" : "-right-24"}`}>
                   {recipient.length === 36 && (
                      <>
                        {["moderator", "administrator"].includes(myRole || "") && (
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
                        {(isMe || ["moderator", "administrator"].includes(myRole || "")) && (
                          <button
                            onClick={() => handleDeleteMessage(msg.id, msg.senderPub)}
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

              <div className="chat-footer opacity-40 text-[9px] font-black flex items-center gap-1.5 mt-2 mx-1">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {isMe && (
                  <span className="flex items-center scale-90">
                    {msg.status === "sending" && "🕒"}
                    {msg.status === "sent" && "✓"}
                    {msg.status === "delivered" && "✓✓"}
                    {msg.status === "read" && <span className="text-primary font-black">✓✓</span>}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] sm:p-8 bg-base-100/60 backdrop-blur-2xl border-t border-white/5 shrink-0">
        {!canSendMessage ? (
          <div className="flex items-center justify-center p-5 bg-base-300/40 rounded-[2rem] border border-white/10 italic opacity-50 text-xs w-full font-bold shadow-inner transition-all animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 mr-3 text-error opacity-60">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            {isMuted ? "Sei stato mutato in questo gruppo" : "Solo gli amministratori possono inviare messaggi"}
          </div>
        ) : (
          <div className="flex items-center gap-4 w-full px-2">
            <label className="input input-bordered grow focus-within:ring-4 focus-within:ring-primary/10 focus-within:border-primary border-white/5 flex items-center gap-4 h-16 bg-base-300/40 rounded-full transition-all px-8 shadow-inner group">
              <input
                type="text"
                className="grow font-bold text-base"
                placeholder="Write a message..."
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  handleTyping();
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
            </label>
            <button 
              className="btn btn-primary btn-circle h-14 w-14 shadow-2xl shadow-primary/40 transition-all active:scale-95 border-0 hover:scale-110" 
              onClick={handleSendMessage}
              disabled={!message.trim()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 translate-x-0.5">
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
