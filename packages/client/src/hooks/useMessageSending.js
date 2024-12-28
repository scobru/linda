import { useState, useCallback } from "react";
import { useMessages } from "./useMessages";
import { useGroupMessages } from "./useGroupMessages";
import { toast } from "react-hot-toast";

export const useMessageSending = (selected) => {
  const [newMessage, setNewMessage] = useState("");

  // Usa l'hook appropriato in base al tipo di chat
  const {
    sendMessage: sendPrivateMessage,
    deleteMessage: deletePrivateMessage,
  } = useMessages(selected.type === "friend" ? selected : null);

  const { sendMessage: sendGroupMessage, deleteMessage: deleteGroupMessage } =
    useGroupMessages(
      selected.type !== "friend" ? selected.id : null,
      selected.type
    );

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim()) return;

    const messageContent = newMessage.trim();
    setNewMessage("");

    try {
      // Usa la funzione appropriata in base al tipo di chat
      const success =
        selected.type === "friend"
          ? await sendPrivateMessage(messageContent)
          : await sendGroupMessage(messageContent);

      if (!success) {
        setNewMessage(messageContent);
      }
    } catch (error) {
      console.error("Errore invio messaggio:", error);
      toast.error("Errore nell'invio del messaggio");
      setNewMessage(messageContent);
    }
  }, [newMessage, sendPrivateMessage, sendGroupMessage, selected.type]);

  const deleteMessage = useCallback(
    (messageId) => {
      return selected.type === "friend"
        ? deletePrivateMessage(messageId)
        : deleteGroupMessage(messageId);
    },
    [deletePrivateMessage, deleteGroupMessage, selected.type]
  );

  const handleVoiceMessage = useCallback(
    async (audioBlob) => {
      if (!audioBlob) return;

      try {
        console.log("Preparazione messaggio vocale:", {
          blobType: audioBlob.type,
          blobSize: audioBlob.size,
        });

        // Converti il blob in base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const audioUrl = reader.result;
          console.log("Audio convertito in URL data");

          // Crea il messaggio vocale
          const messageData = {
            content: audioUrl,
            type: "voice",
            timestamp: Date.now(),
            metadata: {
              duration: audioBlob.duration || 0,
              size: audioBlob.size || 0,
              mimeType: audioBlob.type || "audio/webm",
            },
          };

          console.log("Invio messaggio vocale");
          // Usa la funzione appropriata in base al tipo di chat
          const success =
            selected.type === "friend"
              ? await sendPrivateMessage(messageData)
              : await sendGroupMessage(messageData);

          if (success) {
            toast.success("Messaggio vocale inviato");
          } else {
            toast.error("Errore nell'invio del messaggio vocale");
          }
        };
      } catch (error) {
        console.error("Errore invio messaggio vocale:", error);
        toast.error("Errore nell'invio del messaggio vocale");
      }
    },
    [sendPrivateMessage, sendGroupMessage, selected.type]
  );

  return {
    newMessage,
    setNewMessage,
    sendMessage,
    deleteMessage,
    handleVoiceMessage,
  };
};
