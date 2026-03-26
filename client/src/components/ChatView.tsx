import React, { useEffect, useRef, useMemo } from "react";
import { getInitial } from "../utils/ui";

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    <div className="flex flex-col h-full bg-base-100 overflow-hidden relative">
      {/* Header */}
      <div className="navbar bg-base-100/80 backdrop-blur-md border-b border-white/5 h-16 shrink-0 px-4 gap-3 z-10">
        <div className="flex-none lg:hidden">
          <button
            className="btn btn-ghost btn-circle btn-sm"
            onClick={() => setRecipient("")}
            aria-label="Back"
          >
            ←
          </button>
        </div>
        
        <div className="avatar hidden sm:block">
          <div className="w-10 rounded-full border border-white/10">
            {contactProfiles[recipient]?.avatar ? (
              <img src={contactProfiles[recipient].avatar} alt={recipient} />
            ) : (
              <div className="bg-neutral text-neutral-content flex items-center justify-center font-bold">
                {getInitial(contactProfiles[recipient]?.nickname || recipient)}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold truncate">
              {contactProfiles[recipient]?.nickname ||
                (recipient.length === 36 && recipient.includes("-")
                  ? "Loading group..."
                  : recipient.length > 20
                  ? `${recipient.slice(0, 8)}...${recipient.slice(-4)}`
                  : recipient)}
            </h3>
            {recipient.length === 36 && recipient.includes("-") && (
              <span className="badge badge-xs badge-primary font-bold">GROUP</span>
            )}
          </div>
          
          <div className="flex items-center gap-2 mt-0.5">
            {typingStatuses[recipient] && Date.now() - typingStatuses[recipient] <= 3000 ? (
              <div className="flex gap-1 items-center">
                <span className="loading loading-dots loading-xs text-primary"></span>
                <span className="text-[10px] text-primary font-bold uppercase tracking-widest">Typing</span>
              </div>
            ) : (
              <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${contactErrors[recipient] ? "text-error" : "opacity-30"}`}>
                <span className={`status status-xs ${contactErrors[recipient] ? "status-error" : "status-success"}`}></span>
                {contactErrors[recipient] ? "Secure Session Error" : "End-to-End Encrypted"}
              </div>
            )}
          </div>
        </div>

        <div className="flex-none gap-2">
          {recipient.length === 36 && recipient.includes("-") && (
            <button
              onClick={() => setShowGroupSettings(recipient)}
              className="btn btn-ghost btn-circle btn-sm"
              title="Group Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}

          {contactErrors[recipient] && (
            <button
              onClick={handleManualReset}
              className="btn btn-warning btn-outline btn-xs h-8"
            >
              Heal Session
            </button>
          )}
        </div>
      </div>

      {/* Pinned Messages */}
      {pinnedMsgList.length > 0 && (
        <div className="h-10 shrink-0 bg-base-200/50 flex items-center px-4 gap-3 border-b border-white/5 cursor-pointer hover:bg-base-200 transition-colors">
          <span className="text-primary animate-bounce">📌</span>
          <div className="flex-1 text-xs truncate opacity-70">
            {pinnedMsgList[pinnedMsgList.length - 1].text}
          </div>
          {pinnedMsgList.length > 1 && (
            <span className="badge badge-neutral badge-xs opacity-50">+{pinnedMsgList.length - 1}</span>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {currentMessages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3h9m-9 3h9m-6.75-12a3 3 0 00-3 3v15l3-3h12a3 3 0 003-3v-12a3 3 0 00-3-3h-12z" />
            </svg>
            <span className="text-xl font-bold italic">Start the conversation...</span>
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
              className={`chat ${isMe ? "chat-end" : "chat-start"}`}
            >
              <div className="chat-image avatar">
                <div className="w-10 rounded-full border border-white/10 shadow-sm">
                  {msgAvatar ? (
                    <img src={msgAvatar} alt="avatar" />
                  ) : (
                    <div className="bg-neutral text-neutral-content flex items-center justify-center font-bold text-xs h-full w-full">
                      {getInitial(msgNick)}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="chat-header opacity-50 text-[10px] mb-1 flex gap-2 mx-1">
                {!isMe && <span>{msgNick}</span>}
              </div>

              <div className={`chat-bubble shadow-lg border border-white/5 min-h-[44px] flex items-center relative group ${isMe ? "chat-bubble-primary " : "chat-bubble-neutral"}`}>
                {isPinned && <span className="absolute -top-2 -right-1 text-xs drop-shadow-md">📌</span>}
                <div className="py-1">{msg.text}</div>

                {/* Bubble Actions on Hover */}
                <div className={`absolute top-0 flex gap-1 p-1 bg-base-300 rounded-lg shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity z-10 ${isMe ? "-left-20" : "-right-20"}`}>
                   {recipient.length === 36 && (
                      <>
                        {["moderator", "administrator"].includes(myRole || "") && (
                          <button
                            onClick={() => handlePinMessage(msg.id, !isPinned)}
                            className="btn btn-ghost btn-square btn-xs hover:text-primary"
                            title={isPinned ? "Unpin" : "Pin"}
                          >
                            📌
                          </button>
                        )}
                        <button
                          onClick={() => handleReportMessage(msg.id)}
                          className="btn btn-ghost btn-square btn-xs hover:text-warning"
                          title="Report"
                        >
                          🚩
                        </button>
                        {(isMe || ["moderator", "administrator"].includes(myRole || "")) && (
                          <button
                            onClick={() => handleDeleteMessage(msg.id, msg.senderPub)}
                            className="btn btn-ghost btn-square btn-xs hover:text-error"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        )}
                      </>
                    )}
                </div>
              </div>

              <div className="chat-footer opacity-40 text-[10px] flex items-center gap-1 mt-1">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {isMe && (
                  <span className="flex items-center">
                    {msg.status === "sending" && "🕒"}
                    {msg.status === "sent" && "✓"}
                    {msg.status === "delivered" && "✓✓"}
                    {msg.status === "read" && <span className="text-primary font-bold">✓✓</span>}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 h-24 bg-base-100/50 backdrop-blur-sm border-t border-white/5 flex items-center gap-3 shrink-0">
        <label className="input input-bordered grow focus-within:border-primary flex items-center gap-3 h-12 bg-base-200/50">
          <input
            type="text"
            className="grow"
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
          className="btn btn-primary btn-circle h-12 w-12 shadow-lg shadow-primary/20" 
          onClick={handleSendMessage}
          disabled={!message.trim()}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 translate-x-0.5">
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </button>
      </div>
    </div>
  );
};
