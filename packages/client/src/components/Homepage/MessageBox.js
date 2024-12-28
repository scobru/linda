import React, { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { user } from "linda-protocol";
import { getUserUsername, getUserAvatar } from "../../utils/userUtils";
import AudioPlayer from "./AudioPlayer";

const MessageBox = ({ message, isOwnMessage, onDelete, messageTracking }) => {
  const [senderName, setSenderName] = useState(isOwnMessage ? "Tu" : "...");
  const [senderAvatar, setSenderAvatar] = useState(null);

  useEffect(() => {
    console.log("MessageBox - Messaggio ricevuto:", {
      type: message.type,
      content: message.content?.substring(0, 100) + "...",
      isVoice: message.type === "voice",
      isAudio: message.content?.startsWith("data:audio"),
    });
  }, [message]);

  useEffect(() => {
    const loadUserInfo = async () => {
      if (!message.sender) return;

      try {
        const username = await getUserUsername(message.sender);
        setSenderName(isOwnMessage ? "Tu" : username || "Utente sconosciuto");

        const avatar = await getUserAvatar(message.sender);
        setSenderAvatar(avatar);
      } catch (error) {
        console.error("Errore caricamento info utente:", error);
      }
    };

    loadUserInfo();
  }, [message.sender, isOwnMessage]);

  if (!message) {
    return null;
  }

  const formattedTime = message.timestamp
    ? formatDistanceToNow(new Date(message.timestamp), {
        addSuffix: true,
        locale: it,
      })
    : "Data non disponibile";

  const isRead = messageTracking?.[message.id]?.read;

  return (
    <div className="mb-4 px-4">
      <div
        className={`flex items-center mb-1 ${
          isOwnMessage ? "justify-end" : "justify-start"
        }`}
      >
        {!isOwnMessage && (
          <>
            <div className="w-8 h-8 rounded-full flex-shrink-0">
              {senderAvatar ? (
                <img
                  className="w-full h-full rounded-full object-cover"
                  src={senderAvatar}
                  alt="Avatar"
                />
              ) : (
                <img
                  className="w-full h-full rounded-full"
                  src={`https://api.dicebear.com/7.x/bottts/svg?seed=${senderName}&backgroundColor=b6e3f4`}
                  alt="Avatar predefinito"
                />
              )}
            </div>
            <div className="ml-2 flex flex-col">
              <span className="text-sm text-white font-medium break-words">
                {senderName}
              </span>
            </div>
          </>
        )}
        {isOwnMessage && (
          <>
            <div className="mr-2 flex flex-col items-end">
              <span className="text-sm text-white font-medium break-words">
                {senderName}
              </span>
            </div>
            <div className="w-8 h-8 rounded-full flex-shrink-0">
              {senderAvatar ? (
                <img
                  className="w-full h-full rounded-full object-cover"
                  src={senderAvatar}
                  alt="Avatar"
                />
              ) : (
                <img
                  className="w-full h-full rounded-full"
                  src={`https://api.dicebear.com/7.x/bottts/svg?seed=${senderName}&backgroundColor=b6e3f4`}
                  alt="Avatar predefinito"
                />
              )}
            </div>
          </>
        )}
      </div>
      <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[70%] rounded-lg p-3 ${
            isOwnMessage
              ? "bg-blue-500 text-white rounded-br-none"
              : "bg-gray-700 text-white rounded-bl-none"
          }`}
        >
          <div className="flex flex-col">
            {message.type === "voice" ||
            message.content?.startsWith("data:audio") ? (
              <>
                {console.log("Rendering AudioPlayer con:", {
                  type: message.type,
                  contentStart: message.content?.substring(0, 100),
                })}
                <AudioPlayer audioUrl={message.content} />
              </>
            ) : (
              <div className="break-words">
                {typeof message.content === "string"
                  ? message.content
                  : "[Invalid message]"}
              </div>
            )}
            <div className="flex items-center justify-end mt-1 space-x-1">
              <span className="text-xs opacity-75">{formattedTime}</span>
              {isOwnMessage && (
                <>
                  {isRead ? (
                    <span className="text-xs">✓✓</span>
                  ) : (
                    <span className="text-xs">✓</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        {isOwnMessage && (
          <button
            onClick={() => onDelete(message.id)}
            className="ml-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default MessageBox;
