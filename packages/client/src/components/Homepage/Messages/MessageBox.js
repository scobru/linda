import React, { useState, useEffect } from "react";
import { messaging, gun, DAPP_NAME } from "#protocol";
import { getUserUsername, getUserAvatar } from "../../../utils/userUtils";
import { ReactionsContainer } from "../../Reactions";
import {
  addReaction,
  removeReaction,
  getReactions,
  CONTENT_TYPES,
} from "../../../protocol/reactions/reactions";
import { useAppState } from "../../../context/AppContext";
import AudioPlayer from "./AudioPlayer";

const MessageBox = ({
  message,
  isOwnMessage,
  onDelete,
  messageStates,
  showDeleteButton,
  showRemoveMember,
  onRemoveMember,
  isVoiceMessage,
  messageType = "private", // Può essere 'private', 'channel', o 'board'
}) => {
  const [decryptedContent, setDecryptedContent] = useState("");
  const [senderName, setSenderName] = useState(isOwnMessage ? "Tu" : "...");
  const [senderAvatar, setSenderAvatar] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const { appState } = useAppState();
  const currentUserPub = appState.user.is.pub;

  useEffect(() => {
    const loadUserInfo = async () => {
      if (!message.sender) return;

      try {
        // Carica l'avatar dell'utente
        const avatar = await getUserAvatar(message.sender);
        setSenderAvatar(avatar);

        // Carica il nome dell'utente
        const alias = await new Promise((resolve) => {
          gun
            .get(DAPP_NAME)
            .get("users")
            .get(message.sender)
            .get("alias")
            .once((alias) => {
              resolve(alias);
            });
        });

        if (alias) {
          setSenderName(isOwnMessage ? "Tu" : alias);
        } else {
          const username = await getUserUsername(message.sender);
          setSenderName(isOwnMessage ? "Tu" : username || "Utente");
        }
      } catch (error) {
        console.error("Errore caricamento info utente:", error);
        setSenderName(isOwnMessage ? "Tu" : "Utente");
      }
    };

    loadUserInfo();
  }, [message.sender, isOwnMessage]);

  useEffect(() => {
    const decryptMessage = async () => {
      try {
        if (message.type === "system") {
          setDecryptedContent(message.content);
          return;
        }

        const recipientPub = isOwnMessage ? message.recipient : message.sender;
        const decrypted = await messaging.messages.decrypt(
          message,
          recipientPub
        );
        let content = decrypted.content || message.content;

        if (message.type === "image" || content.startsWith("[IMAGE]")) {
          content = content.replace("[IMAGE]", "");
          setDecryptedContent(content);
        } else if (message.type === "voice" || content.startsWith("[VOICE]")) {
          content = content.replace("[VOICE]", "");
          if (content.startsWith("data:audio")) {
            setAudioUrl(content);
            setDecryptedContent(null);
          } else {
            setDecryptedContent("[Errore decrittazione]");
            setAudioUrl(null);
          }
        } else {
          setDecryptedContent(content);
          setAudioUrl(null);
        }
      } catch (error) {
        console.error("Errore decrittazione:", error);
        setDecryptedContent("[Errore decrittazione]");
        setAudioUrl(null);
      }
    };

    decryptMessage();
  }, [message, isOwnMessage]);

  // Seleziona il tipo di contenuto appropriato in base al tipo di messaggio
  const getContentType = () => {
    switch (messageType) {
      case "channel":
        return CONTENT_TYPES.CHANNEL_MESSAGE;
      case "board":
        return CONTENT_TYPES.BOARD_MESSAGE;
      default:
        return CONTENT_TYPES.PRIVATE_MESSAGE;
    }
  };

  const contentType = getContentType();

  const renderContent = () => {
    if (message.type === "system") {
      return <span className="text-gray-400 italic">{message.content}</span>;
    }

    if (
      message.type === "image" ||
      decryptedContent?.startsWith("data:image")
    ) {
      return (
        <img
          src={decryptedContent}
          alt="Immagine inviata"
          className="max-w-[300px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(decryptedContent, "_blank")}
        />
      );
    }

    if (audioUrl) {
      return <AudioPlayer audioUrl={audioUrl} />;
    }

    if (decryptedContent) {
      return <div className="break-words">{decryptedContent}</div>;
    }

    return (
      <p className="text-red-400 text-sm">
        Errore nel caricamento del messaggio
      </p>
    );
  };

  return (
    <div className="mb-4 px-4">
      <div
        className={`flex items-center mb-1 ${
          isOwnMessage ? "justify-end" : "justify-start"
        }`}
      >
        {!isOwnMessage && (
          <>
            <div className="w-12 h-12 rounded-full flex-shrink-0">
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
            <div className="ml-3 flex flex-col">
              <span className="text-base text-white font-medium break-words">
                {senderName}
              </span>
            </div>
          </>
        )}
        {isOwnMessage && (
          <>
            <div className="mr-3 flex flex-col items-end">
              <span className="text-base text-white font-medium break-words">
                {senderName}
              </span>
            </div>
            <div className="w-12 h-12 rounded-full flex-shrink-0">
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
            message.type === "system"
              ? "bg-[#1E2235] text-gray-300 italic"
              : isOwnMessage
              ? "bg-[#4A90E2] text-white rounded-br-none"
              : "bg-[#373B5C] text-white rounded-bl-none"
          }`}
        >
          <div className="flex flex-col">
            {renderContent()}
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-200">
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
              <div className="flex space-x-2">
                {showDeleteButton && (
                  <button
                    onClick={() => onDelete(message.id)}
                    className="text-xs text-red-300 hover:text-red-200"
                  >
                    Elimina
                  </button>
                )}
                {showRemoveMember && (
                  <button
                    onClick={() => onRemoveMember(message.sender)}
                    className="text-xs text-yellow-300 hover:text-yellow-200"
                  >
                    Rimuovi membro
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenitore reazioni */}
      <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
        <div
          className={`flex items-center ${
            isOwnMessage ? "mr-12" : "ml-12"
          } mt-2 mb-1`}
        >
          <ReactionsContainer
            contentId={message.id}
            contentType={contentType}
            onAddReaction={addReaction}
            onRemoveReaction={removeReaction}
            getReactions={getReactions}
            currentUserPub={currentUserPub}
          />
        </div>
      </div>
    </div>
  );
};

export default React.memo(MessageBox);
