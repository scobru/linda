import { useState } from "react";
import { gun, user, DAPP_NAME } from "linda-protocol";
import { messaging } from "linda-protocol";
import { toast } from "react-hot-toast";

export const useMessageSending = (selected, setMessages) => {
  const [newMessage, setNewMessage] = useState("");

  const sendMessage = async () => {
    if (!selected?.roomId || !newMessage.trim()) return;

    const messageContent = newMessage.trim();
    setNewMessage("");

    try {
      const messageId = `msg_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      let messageData;

      if (selected.type === "friend") {
        // Cripta il messaggio per le chat private
        const encryptedContent =
          await messaging.chat.messageList.encryptMessage(
            messageContent,
            selected.pub
          );

        if (!encryptedContent) {
          throw new Error("Errore durante la crittografia del messaggio");
        }

        messageData = {
          id: messageId,
          content: encryptedContent,
          sender: user.is.pub,
          timestamp: Date.now(),
          type: "encrypted",
        };

        // Salva il messaggio criptato
        await gun
          .get(DAPP_NAME)
          .get("chats")
          .get(selected.roomId)
          .get("messages")
          .get(messageId)
          .put(messageData);
      } else {
        messageData = {
          id: messageId,
          content: messageContent,
          sender: user.is.pub,
          senderAlias: user.is.alias || "Unknown",
          timestamp: Date.now(),
          type: "plain",
        };

        const path = selected.type === "channel" ? "channels" : "boards";
        await gun
          .get(DAPP_NAME)
          .get(path)
          .get(selected.id)
          .get("messages")
          .get(messageId)
          .put(messageData);
      }

      // Aggiorna lo stato locale
      setMessages((prev) => [
        ...prev,
        {
          ...messageData,
          content: messageContent, // Usa il contenuto non criptato per la visualizzazione locale
        },
      ]);
    } catch (error) {
      console.error("Errore invio messaggio:", error);
      toast.error(error.message || "Errore nell'invio del messaggio");
      setNewMessage(messageContent);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (
      !selected?.roomId ||
      !selected?.creator ||
      selected.creator !== user.is.pub
    ) {
      return;
    }

    try {
      const path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      const id = selected.type === "friend" ? selected.roomId : selected.id;

      await messaging.chat.messageList.deleteMessage(path, id, messageId);
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      toast.success("Messaggio eliminato");
    } catch (error) {
      console.error("Errore eliminazione messaggio:", error);
      toast.error("Errore durante l'eliminazione del messaggio");
    }
  };

  const handleDeleteAllMessages = async () => {
    if (!selected?.roomId) return;

    try {
      const isConfirmed = window.confirm(
        "Sei sicuro di voler eliminare tutti i messaggi? Questa azione non può essere annullata."
      );

      if (!isConfirmed) return;

      const path =
        selected.type === "friend"
          ? "chats"
          : selected.type === "channel"
          ? "channels"
          : "boards";
      const id = selected.type === "friend" ? selected.roomId : selected.id;

      await messaging.chat.messageList.deleteAllMessages(path, id);
      setMessages([]);
      toast.success("Tutti i messaggi sono stati eliminati");
    } catch (error) {
      console.error("Errore eliminazione messaggi:", error);
      toast.error("Errore durante l'eliminazione dei messaggi");
    }
  };

  const handleVoiceMessage = async (audioBlob, selected) => {
    if (!selected?.roomId) return;

    try {
      // Converti il blob in base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result;
        const messageId = `msg_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        let messageData = {
          id: messageId,
          content: base64Audio,
          type: "voice",
          sender: user.is.pub,
          timestamp: Date.now(),
        };

        if (selected.type === "friend") {
          // Cripta il messaggio vocale per le chat private
          const encryptedContent =
            await messaging.chat.messageList.encryptMessage(
              base64Audio,
              selected.pub
            );

          if (!encryptedContent) {
            throw new Error(
              "Errore durante la crittografia del messaggio vocale"
            );
          }

          messageData.content = encryptedContent;

          await gun
            .get(DAPP_NAME)
            .get("chats")
            .get(selected.roomId)
            .get("messages")
            .get(messageId)
            .put(messageData);
        } else {
          // Per canali e bacheche
          const path = selected.type === "channel" ? "channels" : "boards";
          await gun
            .get(DAPP_NAME)
            .get(path)
            .get(selected.id)
            .get("messages")
            .get(messageId)
            .put(messageData);
        }

        toast.success("Messaggio vocale inviato");
      };
    } catch (error) {
      console.error("Errore invio messaggio vocale:", error);
      toast.error("Errore nell'invio del messaggio vocale");
    }
  };

  return {
    newMessage,
    setNewMessage,
    sendMessage,
    handleDeleteMessage,
    handleDeleteAllMessages,
    handleVoiceMessage,
  };
};
