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
      <div className="chat-area chat-area-empty">
        <div className="chat-empty">
          <div className="chat-empty-logo">
            <img
              src="/logo.svg"
              alt="Linda Logo"
              style={{
                width: "120px",
                height: "120px",
                marginBottom: "24px",
                filter: "drop-shadow(0 0 30px var(--accent-glow))",
              }}
            />
          </div>
          <div className="chat-empty-text">Linda Secure Messenger</div>
          <div className="chat-empty-sub">
            Select a contact or add a new one to start an encrypted conversation
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area">
      <div className="chat-header">
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
              (recipient.length === 36 && recipient.includes("-")
                ? "Loading group..."
                : recipient.length > 15
                ? `${recipient.slice(0, 8)}...${recipient.slice(-4)}`
                : recipient)}
          </h3>
          {recipient.length === 36 && recipient.includes("-") && (
            <span
              className="role-badge role-peer"
              style={{ marginLeft: "8px", verticalAlign: "middle", fontSize: "0.6em" }}
            >
              GROUP
            </span>
          )}
          {typingStatuses[recipient] && Date.now() - typingStatuses[recipient] <= 3000 ? (
            <div className="typing-indicator">typing</div>
          ) : (
            <div
              className="chat-header-badge"
              style={{
                backgroundColor: contactErrors[recipient] ? "rgba(239, 68, 68, 0.2)" : undefined,
                color: contactErrors[recipient] ? "#ef4444" : "var(--success)",
              }}
            >
              {contactErrors[recipient] ? "⚠️ Session Error" : "🔒 End-to-End Encrypted"}
            </div>
          )}
        </div>

        {recipient.length === 36 && recipient.includes("-") && (
          <button
            onClick={() => setShowGroupSettings(recipient)}
            className="tab-btn"
            style={{ marginLeft: "auto", marginRight: "12px" }}
          >
            ⚙️ Group Settings
          </button>
        )}

        {contactErrors[recipient] && (
          <button
            onClick={handleManualReset}
            className="btn btn--secondary"
            style={{
              marginLeft: "auto",
              backgroundColor: "#ef4444",
              borderColor: "#ef4444",
              color: "white",
              fontSize: "0.8rem",
              padding: "4px 8px",
            }}
          >
            Reset Session
          </button>
        )}
      </div>

      {pinnedMsgList.length > 0 && (
        <div className="pinned-messages-bar" style={{ padding: '8px 16px', background: 'rgba(0, 188, 212, 0.1)', borderBottom: '1px solid rgba(0, 188, 212, 0.2)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)' }}>📌 Pinned:</span>
          <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: '0.85rem' }}>
            {pinnedMsgList[pinnedMsgList.length - 1].text}
          </div>
          {pinnedMsgList.length > 1 && <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>+{pinnedMsgList.length - 1} more</span>}
        </div>
      )}

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
          const msgAvatar = isMe ? userAvatar : contactProfiles[msg.sender]?.avatar;
          const msgNick = isMe ? userNick || username || "?" : contactProfiles[msg.sender]?.nickname || msg.sender;
          const isPinned = pinnedMessages[recipient]?.has(msg.id);

          return (
            <div
              key={msg.id || i}
              className={`message-wrapper ${
                isMe ? "message-wrapper--sent" : "message-wrapper--received"
              }`}
              style={{
                display: "flex",
                flexDirection: isMe ? "row-reverse" : "row",
                alignItems: "flex-end",
                gap: "8px",
                position: "relative",
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
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  getInitial(msgNick)
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", maxWidth: "80%" }}>
                <div
                  className={`message-bubble ${
                    isMe ? "message-bubble--sent" : "message-bubble--received"
                  }`}
                  style={{ position: "relative" }}
                >
                  {isPinned && (
                    <span style={{ position: "absolute", top: "-10px", right: "-5px", fontSize: "0.8rem" }}>
                      📌
                    </span>
                  )}
                  {msg.text}

                  <div
                    className="message-actions-inline"
                    style={{ display: "flex", gap: "5px", marginTop: "5px", opacity: 0.5 }}
                  >
                    {recipient.length === 36 && (
                      <>
                        {["moderator", "administrator"].includes(myRole || "") && (
                          <button
                            onClick={() => handlePinMessage(msg.id, !isPinned)}
                            className="btn-icon-tiny"
                            title={isPinned ? "Unpin" : "Pin"}
                          >
                            📌
                          </button>
                        )}
                        <button
                          onClick={() => handleReportMessage(msg.id)}
                          className="btn-icon-tiny"
                          title="Report"
                        >
                          🚩
                        </button>
                        {(isMe || ["moderator", "administrator"].includes(myRole || "")) && (
                          <button
                            onClick={() => handleDeleteMessage(msg.id, msg.senderPub)}
                            className="btn-icon-tiny"
                            title="Delete"
                          >
                            🗑️
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="message-time" style={{ textAlign: isMe ? "right" : "left" }}>
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {isMe && msg.status && (
                    <span className="message-status" style={{ marginLeft: "4px", fontSize: "0.8em" }}>
                      {msg.status === "sending" && "🕒"}
                      {msg.status === "sent" && "✓"}
                      {msg.status === "delivered" && "✓✓"}
                      {msg.status === "read" && <span style={{ color: "#34B7F1" }}>✓✓</span>}
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
    </div>
  );
};
