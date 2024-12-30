import { useState, useCallback } from "react";
import { messageService } from "../protocol/services";
import { toast } from "react-hot-toast";
import { useAppState } from "../context/AppContext";

export const useMessageSending = (selected) => {
  const [newMessage, setNewMessage] = useState("");
  const [messageTracking, setMessageTracking] = useState({});
  const { appState } = useAppState();

  // Funzione per cancellare tutti i messaggi
  const clearMessages = useCallback(async () => {
    if (!selected?.roomId) return;

    try {
      await messageService.clearAllMessages(selected.roomId, selected.type);
      return true;
    } catch (error) {
      console.error("Errore durante la cancellazione dei messaggi:", error);
      throw error;
    }
  }, [selected]);

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim()) return;

    console.log("Tentativo invio messaggio:", {
      selected,
      content: newMessage,
    });

    try {
      const messageData = await messageService.sendMessage(
        selected.roomId,
        selected.type,
        newMessage,
        {
          sender: appState.user.is.pub,
          senderAlias: appState.user.is.alias,
        }
      );

      setNewMessage("");
      return messageData;
    } catch (error) {
      console.error("Errore invio messaggio:", error);
      toast.error(error.message || "Errore durante l'invio del messaggio");
    }
  }, [selected, newMessage, appState.user.is]);

  const handleDeleteMessage = useCallback(
    async (messageId) => {
      try {
        await messageService.deleteMessage(
          selected.roomId,
          selected.type,
          messageId
        );
        toast.success("Messaggio eliminato");
      } catch (error) {
        console.error("Errore eliminazione messaggio:", error);
        toast.error("Errore durante l'eliminazione del messaggio");
      }
    },
    [selected]
  );

  const handleVoiceMessage = useCallback(
    async (audioBlob) => {
      if (!selected) {
        toast.error("Nessuna chat selezionata");
        return;
      }

      if (!audioBlob) return;

      try {
        console.log("Preparazione messaggio vocale:", {
          selected,
          blobType: audioBlob.type,
          blobSize: audioBlob.size,
        });

        // Converti il blob in base64
        const audioBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(audioBlob);
        });

        const messageData = await messageService.sendVoiceMessage(
          selected.roomId,
          selected.type,
          audioBase64,
          {
            sender: appState.user.is.pub,
            senderAlias: appState.user.is.alias,
          }
        );

        toast.success("Messaggio vocale inviato");
        return messageData;
      } catch (error) {
        console.error("Errore invio messaggio vocale:", error);
        toast.error("Errore nell'invio del messaggio vocale");
      }
    },
    [selected, appState.user.is]
  );

  return {
    newMessage,
    setNewMessage,
    sendMessage,
    handleDeleteMessage,
    handleVoiceMessage,
    messageTracking,
    clearMessages,
  };
};
