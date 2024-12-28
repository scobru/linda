import { useState, useCallback } from "react";
import { useMessages } from "./useMessages";
import { toast } from "react-hot-toast";

export const useMessageSending = (selected) => {
  const [newMessage, setNewMessage] = useState("");
  const { sendMessage: sendMessageToGun, deleteMessage } =
    useMessages(selected);

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim()) return;

    const messageContent = newMessage.trim();
    setNewMessage("");

    try {
      const success = await sendMessageToGun(messageContent);
      if (!success) {
        setNewMessage(messageContent);
      }
    } catch (error) {
      console.error("Errore invio messaggio:", error);
      toast.error("Errore nell'invio del messaggio");
      setNewMessage(messageContent);
    }
  }, [newMessage, sendMessageToGun]);

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
          // Mantieni l'intero URL data:audio
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
          const success = await sendMessageToGun(messageData);

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
    [sendMessageToGun]
  );

  return {
    newMessage,
    setNewMessage,
    sendMessage,
    deleteMessage,
    handleVoiceMessage,
  };
};
