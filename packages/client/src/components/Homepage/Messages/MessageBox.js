import React, { useState, useEffect } from "react";
import { messaging } from "linda-protocol";
import { getUserUsername, getUserAvatar } from "../../../utils/userUtils";
import AudioPlayer from "./AudioPlayer";

const MessageBox = ({
  message,
  isOwnMessage,
  onDelete,
  showDeleteButton,
  showRemoveMember,
  onRemoveMember,
  isVoiceMessage,
}) => {
  const [decryptedContent, setDecryptedContent] = useState("");
  const [senderName, setSenderName] = useState(isOwnMessage ? "Tu" : "...");
  const [senderAvatar, setSenderAvatar] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

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

        // Verifica se è un messaggio vocale
        const isVoice =
          message.type === "voice" ||
          content.startsWith("[VOICE]") ||
          content.startsWith("data:audio");

        if (isVoice) {
          // Rimuovi il prefisso [VOICE] se presente
          if (content.startsWith("[VOICE]")) {
            content = content.replace("[VOICE]", "");
          }

          // Verifica che sia un URL audio valido
          if (content.startsWith("data:audio")) {
            setAudioUrl(content);
            setDecryptedContent(null); // Non mostrare il contenuto testuale per i messaggi vocali
          } else {
            console.error(
              "Formato audio non valido:",
              content.substring(0, 100)
            );
            setDecryptedContent("Errore nel caricamento del messaggio vocale");
            setAudioUrl(null);
          }
        } else {
          setDecryptedContent(content);
          setAudioUrl(null);
        }
      } catch (error) {
        console.error("Errore decrittazione messaggio:", error);
        setDecryptedContent("Errore nella decrittazione del messaggio");
        setAudioUrl(null);
      }
    };

    decryptMessage();
  }, [message, isOwnMessage]);

  const renderContent = () => {
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
              : "bg-[#2D325A] text-white rounded-bl-none"
          }`}
        >
          <div className="flex flex-col">
            {renderContent()}
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-300">
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
              <div className="flex space-x-2">
                {showDeleteButton && (
                  <button
                    onClick={() => onDelete(message.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Elimina
                  </button>
                )}
                {showRemoveMember && (
                  <button
                    onClick={() => onRemoveMember(message.sender)}
                    className="text-xs text-yellow-400 hover:text-yellow-300"
                  >
                    Rimuovi membro
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageBox;
