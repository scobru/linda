import React, { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { user } from "linda-protocol";
import { getUserUsername, getUserAvatar } from "../../../utils/userUtils";
import AudioPlayer from "./AudioPlayer";

export default function MessageBox({
  message,
  isOwnMessage,
  onDelete,
  messageTracking,
  showDeleteButton,
  showRemoveMember,
  onRemoveMember,
}) {
  const [senderName, setSenderName] = useState(isOwnMessage ? "Tu" : "...");
  const [senderAvatar, setSenderAvatar] = useState(null);

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

  // Verifica se il messaggio è vocale
  const isVoiceMessage =
    typeof message.content === "string" &&
    message.content.startsWith("[VOICE]");
  const audioUrl = isVoiceMessage ? message.content.substring(7) : null;

  return (
    <div
      className={`p-4 flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[70%] ${
          isOwnMessage ? "bg-blue-500" : "bg-[#2D325A]"
        } rounded-lg p-3 relative group`}
      >
        <div className="flex items-start space-x-2">
          <div className="flex-1">
            <div className="text-gray-300 text-sm mb-1">
              {message.senderAlias || "Utente"}
            </div>
            <div className="text-white break-words">{message.content}</div>
            <div className="text-gray-400 text-xs mt-1">
              {new Date(message.timestamp).toLocaleTimeString()}
            </div>
          </div>
          <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {showDeleteButton && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1 hover:bg-[#4A4F76] rounded-full text-gray-400 hover:text-white"
                title="Elimina messaggio"
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
            {showRemoveMember && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveMember();
                }}
                className="p-1 hover:bg-[#4A4F76] rounded-full text-gray-400 hover:text-white"
                title="Rimuovi membro dalla board"
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
                    d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
