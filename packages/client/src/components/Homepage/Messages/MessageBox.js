import React, { useState, useEffect } from "react";
import { messaging, gun, DAPP_NAME } from "linda-protocol";
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
        // Prima prova a recuperare l'alias dal database
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
          // Se non trova l'alias, usa il nome utente come fallback
          const username = await getUserUsername(message.sender);
          setSenderName(isOwnMessage ? "Tu" : username || "Utente sconosciuto");
        }

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
          // Se è un messaggio di sistema, cerca di sostituire le chiavi pubbliche con gli alias
          if (message.content) {
            // Modifica l'espressione regolare per catturare sia le chiavi che iniziano con - che quelle senza
            const pubKeys =
              message.content.match(/(?:\s|^)([a-zA-Z0-9_-]{43,})(?:\s|$)/g) ||
              [];
            let updatedContent = message.content;

            for (const pubKey of pubKeys) {
              const cleanPubKey = pubKey.trim(); // Rimuove spazi iniziali e finali
              const alias = await new Promise((resolve) => {
                gun
                  .get(DAPP_NAME)
                  .get("users")
                  .get(cleanPubKey)
                  .get("alias")
                  .once((alias) => {
                    resolve(alias || cleanPubKey);
                  });
              });
              updatedContent = updatedContent.replace(cleanPubKey, alias);
            }
            console.log("Contenuto originale:", message.content);
            console.log("Chiavi pubbliche trovate:", pubKeys);
            console.log("Contenuto aggiornato:", updatedContent);
            setDecryptedContent(updatedContent);
          } else {
            setDecryptedContent(message.content);
          }
          return;
        }

        const recipientPub = isOwnMessage ? message.recipient : message.sender;
        const decrypted = await messaging.messages.decrypt(
          message,
          recipientPub
        );
        let content = decrypted.content || message.content;

        // Gestione dei diversi tipi di messaggio
        if (message.type === "image" || content.startsWith("[IMAGE]")) {
          // Rimuovi il prefisso [IMAGE] se presente
          content = content.replace("[IMAGE]", "");
          setDecryptedContent(content);
        } else if (message.type === "voice" || content.startsWith("[VOICE]")) {
          // Gestione messaggi vocali
          content = content.replace("[VOICE]", "");
          if (content.startsWith("data:audio")) {
            setAudioUrl(content);
            setDecryptedContent(null);
          } else {
            console.error(
              "Formato audio non valido:",
              content.substring(0, 100)
            );
            setDecryptedContent("Errore nel caricamento del messaggio vocale");
            setAudioUrl(null);
          }
        } else {
          // Messaggi di testo normali
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

  const renderMessageContent = () => {
    if (message.type === "system") {
      return <span className="text-gray-400 italic">{message.content}</span>;
    } else if (
      message.type === "voice" ||
      message.content?.startsWith("[VOICE]")
    ) {
      const audioUrl =
        message.content?.replace("[VOICE]", "") || message.content;
      return (
        <audio controls className="max-w-[200px]">
          <source src={audioUrl} type="audio/webm" />
          Il tuo browser non supporta l'elemento audio.
        </audio>
      );
    } else if (
      message.type === "image" ||
      message.content?.startsWith("[IMAGE]")
    ) {
      const imageUrl =
        message.content?.replace("[IMAGE]", "") || message.content;
      return (
        <img
          src={imageUrl}
          alt="Immagine inviata"
          className="max-w-[300px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(imageUrl, "_blank")}
        />
      );
    } else {
      return message.content;
    }
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
    </div>
  );
};

export default React.memo(MessageBox);
