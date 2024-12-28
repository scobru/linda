import { useState, useCallback } from "react";
import { messaging, gun, DAPP_NAME } from "linda-protocol";
import { toast } from "react-hot-toast";

const { chat } = messaging;

export const useMessageSending = (selected) => {
  const [newMessage, setNewMessage] = useState("");

  const sendMessage = useCallback(async () => {
    if (!selected) {
      toast.error("Nessuna chat selezionata");
      return;
    }

    if (!newMessage.trim()) return;

    console.log("Tentativo invio messaggio:", {
      selected,
      content: newMessage.trim(),
    });

    const messageContent = newMessage.trim();
    setNewMessage("");

    try {
      // Usa la funzione sendMessage con callback
      return new Promise((resolve, reject) => {
        chat.sendMessage(
          selected.roomId,
          selected.pub,
          messageContent,
          (result) => {
            if (result.success) {
              console.log("Messaggio inviato con successo:", result);
              resolve(true);
            } else {
              console.error("Errore invio messaggio:", result.errMessage);
              setNewMessage(messageContent);
              reject(new Error(result.errMessage));
            }
          }
        );
      });
    } catch (error) {
      console.error("Errore invio messaggio:", error);
      toast.error("Errore nell'invio del messaggio");
      setNewMessage(messageContent);
      return false;
    }
  }, [newMessage, selected]);

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
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);

        reader.onloadend = async () => {
          const audioUrl = reader.result;
          console.log("Audio convertito in URL data");

          // Invia il messaggio vocale come stringa
          const messageContent = `[VOICE]${audioUrl}`;

          chat.sendMessage(
            selected.roomId,
            selected.pub,
            messageContent,
            (result) => {
              if (result.success) {
                console.log("Messaggio vocale inviato con successo:", result);
                toast.success("Messaggio vocale inviato");
              } else {
                console.error(
                  "Errore invio messaggio vocale:",
                  result.errMessage
                );
                toast.error("Errore nell'invio del messaggio vocale");
              }
            }
          );
        };
      } catch (error) {
        console.error("Errore invio messaggio vocale:", error);
        toast.error("Errore nell'invio del messaggio vocale");
      }
    },
    [selected]
  );

  const handleDeleteMessage = useCallback(
    (messageId) => {
      if (!selected?.roomId || !messageId) return;

      try {
        // Usa la funzione deleteMessage di messaging.chat
        chat.deleteMessage(selected.roomId, messageId);
        toast.success("Messaggio eliminato");
      } catch (error) {
        console.error("Errore eliminazione messaggio:", error);
        toast.error("Errore nell'eliminazione del messaggio");
      }
    },
    [selected]
  );

  return {
    newMessage,
    setNewMessage,
    sendMessage,
    handleDeleteMessage,
    handleVoiceMessage,
  };
};
