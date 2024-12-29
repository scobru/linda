import React from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import MessageStatus from "../MessageStatus";
import AudioPlayer from "../AudioPlayer";

export const MessageItem = ({ message, isOwnMessage }) => {
  const formattedDate = format(new Date(message.timestamp), "HH:mm", {
    locale: it,
  });

  console.log("Rendering MessageItem:", {
    type: message.type,
    content: message.content?.substring(0, 50),
    isVoice: message.type === "voice",
  });

  return (
    <div className={`message ${isOwnMessage ? "own-message" : ""}`}>
      <div className="message-content">
        {message.type === "voice" ? (
          <div className="voice-message">
            <AudioPlayer audioUrl={message.content} />
          </div>
        ) : (
          <p>{message.content}</p>
        )}
        <div className="message-meta">
          <span className="message-time">{formattedDate}</span>
          {isOwnMessage && <MessageStatus status={message.status} />}
        </div>
      </div>
    </div>
  );
};
