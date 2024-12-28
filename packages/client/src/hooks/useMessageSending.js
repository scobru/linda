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
        setNewMessage(messageContent); // Ripristina il messaggio in caso di errore
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
          const base64Audio = reader.result;
          console.log("Audio convertito in base64:", {
            length: base64Audio.length,
            preview: base64Audio.substring(0, 100) + "...",
          });

          // Crea il messaggio con tipo esplicito
          const messageData = {
            content: base64Audio,
            type: "voice",
            timestamp: Date.now(),
          };

          console.log("Invio messaggio vocale:", messageData);
          const success = await sendMessageToGun(messageData);

          if (success) {
            toast.success("Messaggio vocale inviato");
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
