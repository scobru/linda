import React, { useState, useEffect } from "react";
import { user } from "linda-protocol";
import { MessageStatus } from "../MessageStatus";
import { VoiceMessage } from "./VoiceMessage";
import AudioPlayer from "../AudioPlayer";
import { getUserUsername, getUserAvatar } from "../../../utils/userUtils";

export const MessageItem = ({
  message,
  isOwnMessage,
  showSender,
  messageObserver,
  handleDeleteMessage,
  selected,
}) => {
  const [senderName, setSenderName] = useState("");
  const [senderAvatar, setSenderAvatar] = useState("");
  const shouldShowSender = showSender && message.sender !== user.is.pub;
  const isCreator = selected?.creator === user.is.pub;

  useEffect(() => {
    const loadSenderInfo = async () => {
      try {
        if (isOwnMessage) {
          setSenderName("Tu");
          const myAvatar = await getUserAvatar(user.is.pub);
          setSenderAvatar(myAvatar);
        } else {
          const username = await getUserUsername(message.sender);
          setSenderName(username);
          const avatar = await getUserAvatar(message.sender);
          setSenderAvatar(avatar);
        }
      } catch (error) {
        console.warn("Errore nel caricamento info mittente:", error);
        setSenderName(
          message.sender.slice(0, 6) + "..." + message.sender.slice(-4)
        );
      }
    };
    loadSenderInfo();
  }, [message.sender, isOwnMessage]);

  return (
    <div
      ref={(el) => {
        if (el && messageObserver) {
          el.dataset.messageId = message.id;
          messageObserver.observe(el);
        }
      }}
      className={`flex flex-col ${
        isOwnMessage ? "items-end" : "items-start"
      } space-y-1`}
    >
      <div className="flex items-center mb-1">
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
            {isOwnMessage ? "Tu" : senderName}
          </span>
          <span className="text-xs text-gray-300">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      <div className="flex items-end w-full">
        <div
          className={`rounded-lg px-4 py-2 break-words ${
            isOwnMessage
              ? "bg-[#4A4F76] text-white rounded-br-none ml-auto"
              : "bg-[#2D325A] text-white rounded-bl-none"
          } max-w-full`}
        >
          {message.type === "voice" ? (
            <AudioPlayer audioUrl={message.content} />
          ) : (
            <span className="whitespace-pre-wrap">
              {typeof message.content === "string"
                ? message.content
                : "[Invalid message]"}
            </span>
          )}
        </div>
        {isOwnMessage && <MessageStatus message={message} />}
      </div>

      {isCreator && selected?.type === "board" && (
        <button
          onClick={() => handleDeleteMessage(message.id)}
          className="text-red-400 text-xs hover:text-red-300 mt-1"
        >
          Delete
        </button>
      )}
    </div>
  );
};
